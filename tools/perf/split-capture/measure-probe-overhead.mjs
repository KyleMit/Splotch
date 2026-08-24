// Measure what the in-page probe costs the page it is measuring.
//
//   npm run perf:device:probe-overhead -- --device-serial=<serial> --brush=crayon \
//     --upstream=http://127.0.0.1:4196 --probe-host=http://127.0.0.1:4195
//
// Every real-screen capture runs with an injected probe that hooks pointer
// events, `requestAnimationFrame` and performance marks on the drawing hot path.
// That is code the shipped app does not run, executing inside the loop being
// measured, and nothing had ever established what it costs. The campaign
// measured Instruments' observer effect and never its own.
//
// The obstacle is that the probe cannot score the arm that has no probe. Two
// platform-side clocks were tried on this phone and neither answers for a
// browser target: `dumpsys gfxinfo com.android.chrome` reports zero frames
// rendered while the page is being drawn on, because Chrome composites web
// content outside the Android view system's pipeline, and
// `dumpsys SurfaceFlinger --latency` returns all-zero rows on Android 16 for the
// same surface, reporting only the refresh period.
//
// So the common clock is a FRAME COUNTER injected into BOTH arms: a closure that
// records `requestAnimationFrame` deltas and nothing else. It is not free, but it
// is identical in both arms, so its cost cancels — which is the only property a
// control instrument needs. The probe is the single variable.
//
// Both arms are served from ONE origin, differing only by a query parameter, so
// the persisted brush selection carries between them and neither arm has to run
// the other's setup.
import { createServer } from 'node:http';
import { argFlag, capture, fail, isMain, runMain, sleep } from '../../lib/proc.mjs';
import { lanAddress } from './verify-android-input.mjs';
import { CHROME_PACKAGE } from './lib/android-input.mjs';

const DEFAULT_PORT = 4198;
const DEFAULT_UPSTREAM = 'http://127.0.0.1:4196';
const DEFAULT_PROBE_HOST = 'http://127.0.0.1:4195';
const APP_STOP_SETTLE_MS = 1_500;
const PAGE_SETTLE_MS = 9_000;
const DRIVE_WINDOW_MS = 12_000;
// The probe arm's bootstrap selects a brush and closes the menu before the probe
// starts, and that setup is one-time work rather than the steady-state observer
// effect. The counter therefore discards everything before this mark, and the
// input is driven after it, so both arms are compared over the same phase of the
// page's life.
const COUNTER_WARMUP_MS = 8_000;
const UPLOAD_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 500;
const SWIPE_DURATION_MS = 500;
const SWIPES_PER_SAMPLE = 12;
// Three samples per arm is the campaign's standing minimum, and the spread this
// device shows at three is comparable to the effects being looked for — which is
// itself part of the answer rather than a reason to take fewer.
const SAMPLES_PER_ARM = 3;
const ARMS = ['control', 'probe'];
const BRUSHES = ['pen', 'crayon', 'magic', 'eraser'];
const BRUSH_COMMIT_TIMEOUT_MS = 45_000;

const adb = (serial, args) => capture('adb', ['-s', serial, ...args]);

// Deliberately the smallest thing that can count frames: one closure, one array
// of numbers, no listeners, no marks, no observers, no per-event work. Anything
// richer would put the control's own cost into the comparison.
function counterSource(warmupMs, windowMs) {
  return `(() => {
  const deltas = [];
  let previous = 0;
  let recording = false;
  const tick = (now) => {
    if (recording && previous) deltas.push(now - previous);
    previous = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  setTimeout(() => {
    recording = true;
    previous = 0;
  }, ${warmupMs});
  setTimeout(() => {
    navigator.sendBeacon(
      '/__overhead/report',
      JSON.stringify({ arm: new URL(location.href).searchParams.get('arm'), deltas })
    );
  }, ${warmupMs + windowMs});
})();`;
}

export function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

// Frames produced per second is the outcome that survives the arms having
// different instrumentation: both count the same way, and a probe heavy enough to
// matter shows up as the page producing fewer of them under the same input.
export function summarizeDeltas(deltas) {
  const windowMs = deltas.reduce((total, delta) => total + delta, 0);
  return {
    frames: deltas.length,
    perSecond: windowMs > 0 ? (deltas.length * 1000) / windowMs : null,
    p50: percentile(deltas, 0.5),
    p95: percentile(deltas, 0.95),
    p99: percentile(deltas, 0.99),
    max: deltas.length ? Math.max(...deltas) : null,
  };
}

// Forwarded verbatim minus the hop-by-hop and body-framing headers. Passing the
// request's own `connection`, `content-length` and `accept-encoding` through to
// fetch made the forward fail intermittently, and the bootstrap then parsed the
// proxy's own 502 text as its plan — a page that looks instrumented and is not.
const FORWARDED_HEADERS = ['accept', 'accept-language', 'content-type', 'user-agent'];

// The bootstrap polls its plan every 400 ms for the length of a run, and Node's
// default 5 s keep-alive timeout closes an idle upstream socket at the moment
// undici reuses it. One retry covers that race; without it roughly one poll per
// run failed, the bootstrap parsed the 502 body as its plan, and the probe arm
// silently became a second control arm.
//
// Restricted to GET and HEAD. Retrying a POST replays a request the upstream may
// already have processed — a duplicate report or a duplicate plan write — and a
// blanket catch would also hide failures that have nothing to do with the
// keep-alive race behind a second attempt that happens to succeed.
const RETRYABLE_METHODS = new Set(['GET', 'HEAD']);

async function forward(target, init) {
  try {
    return await fetch(target, init);
  } catch (error) {
    if (!RETRYABLE_METHODS.has(init.method)) throw error;
    return fetch(target, init);
  }
}

export function createOverheadHost({
  upstream,
  probeHost,
  warmupMs = COUNTER_WARMUP_MS,
  windowMs = DRIVE_WINDOW_MS,
}) {
  const state = { reports: [], pageErrors: [] };
  const counter = counterSource(warmupMs, windowMs);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/__overhead/counter.js') {
      res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' });
      return res.end(counter);
    }
    if (req.method === 'POST' && url.pathname === '/__overhead/report') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      state.reports.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      res.writeHead(204);
      return res.end();
    }
    // The probe's own endpoints are forwarded rather than reimplemented, so the
    // probe arm runs the real bootstrap against the real host and the two arms
    // still share one origin.
    const origin = url.pathname.startsWith('/__probe/') ? probeHost : upstream;
    let body;
    if (!['GET', 'HEAD'].includes(req.method)) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = Buffer.concat(chunks);
      // The bootstrap reports its own failures here, and a probe arm that threw
      // measured a page with no probe in it. Recorded rather than only forwarded,
      // so the run can refuse to score such a sample instead of publishing it.
      if (url.pathname === '/__probe/log') {
        state.pageErrors.push(JSON.parse(body.toString('utf8')));
      }
    }
    const forwarded = Object.fromEntries(
      FORWARDED_HEADERS.filter((name) => req.headers[name]).map((name) => [name, req.headers[name]])
    );
    let response;
    try {
      response = await forward(`${origin}${url.pathname}${url.search}`, {
        method: req.method,
        headers: forwarded,
        body,
      });
    } catch (error) {
      // Named rather than swallowed: a silent 502 here is served to the bootstrap,
      // which parses it as its plan and gives up — a probe arm with no probe in it,
      // reported as an ordinary sample. The run's own pageErrors count is what
      // stops such a sample being scored, and this says why.
      console.warn(`forward failed ${req.method} ${url.pathname}: ${error?.message ?? error}`);
      res.writeHead(502, { 'content-type': 'text/plain' });
      return res.end('upstream unreachable');
    }
    const headers = Object.fromEntries(response.headers.entries());
    delete headers['content-encoding'];
    delete headers['content-length'];
    if ((headers['content-type'] ?? '').includes('text/html')) {
      const html = await response.text();
      headers['content-type'] = 'text/html; charset=utf-8';
      headers['cache-control'] = 'no-store';
      res.writeHead(response.status, headers);
      const scripts =
        url.searchParams.get('arm') === 'probe'
          ? '<script src="/__overhead/counter.js"></script><script src="/__probe/bootstrap.js"></script>'
          : '<script src="/__overhead/counter.js"></script>';
      return res.end(html.replace('</body>', `${scripts}</body>`));
    }
    res.writeHead(response.status, headers);
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  return { server, state };
}

// The brush is persisted per origin and the arms share one, so whichever brush the
// last page committed is the one the CONTROL arm draws with — and the control arm
// runs first. An earlier revision left that to whatever the probe host's default
// plan happened to be, which made the measured brush a property of run order rather
// than of the run. It is now requested, committed through a probe-arm page, and
// verified before any sample is taken.
async function pollFor(callback, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await callback().catch(() => null);
    if (value) return value;
    await sleep(POLL_INTERVAL_MS);
  }
  return null;
}

async function primeBrush(serial, pageUrl, probeHost, brush) {
  // Reset first: the probe host keeps the last page's `ready` payload, and polling
  // for a commit without clearing it reads the previous run's brush and calls it a
  // success.
  const plan = await fetch(`${probeHost}/__probe/control`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ brush, label: `overhead-${brush}`, finish: false, reset: true }),
  });
  if (!plan.ok) fail(`could not set the probe plan to ${brush}`);
  await launchArm(serial, pageUrl, 'probe');
  const committed = await pollFor(async () => {
    const ready = await fetch(`${probeHost}/__probe/state`).then((response) => response.json());
    return ready?.ready?.committed === brush ? ready.ready : null;
  }, BRUSH_COMMIT_TIMEOUT_MS);
  if (!committed) fail(`the page never committed ${brush}; measuring would compare two brushes`);
  return brush;
}

async function launchArm(serial, pageUrl, arm) {
  adb(serial, ['shell', 'am', 'force-stop', CHROME_PACKAGE]);
  await sleep(APP_STOP_SETTLE_MS);
  adb(serial, [
    'shell',
    'am',
    'start',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    `'${pageUrl}?arm=${arm}&nonce=${process.pid}-${arm}'`,
    CHROME_PACKAGE,
  ]);
  await sleep(PAGE_SETTLE_MS);
}

async function runSample(serial, state, pageUrl, arm, geometry) {
  const before = state.reports.length;
  const errorsBefore = state.pageErrors.length;
  // Long enough for the probe arm's bootstrap to finish its setup, so the input
  // lands inside the counter's recording window in both arms.
  await launchArm(serial, pageUrl, arm);
  for (let swipe = 0; swipe < SWIPES_PER_SAMPLE; swipe++) {
    adb(serial, [
      'shell',
      'input',
      'swipe',
      String(geometry.x0),
      String(geometry.y0),
      String(geometry.x1),
      String(geometry.y1),
      String(SWIPE_DURATION_MS),
    ]);
  }
  const deadline = Date.now() + UPLOAD_TIMEOUT_MS;
  while (Date.now() < deadline && state.reports.length === before) await sleep(POLL_INTERVAL_MS);
  const report = state.reports[before];
  if (!report) return { arm, invalid: 'no report uploaded' };
  const errors = state.pageErrors
    .slice(errorsBefore)
    .filter((entry) => entry.kind === 'error' || entry.kind === 'bootstrap');
  // A probe arm whose bootstrap threw measured a page with no probe in it, which is
  // a second control arm wearing the probe label. An earlier revision counted the
  // errors and then included the row in the mean anyway.
  if (errors.length > 0) {
    return { arm, invalid: `${errors.length} page error(s): ${errors[0].message ?? 'unknown'}` };
  }
  return { arm, ...summarizeDeltas(report.deltas), pageErrors: 0 };
}

// Identical device-space coordinates in both arms, derived from the screen rather
// than from the page: reading the canvas rect would need an instrument in the
// control arm, which is the thing the control arm must not have.
export function centreSwipe(screen) {
  return {
    x0: Math.round(screen.width * 0.25),
    y0: Math.round(screen.height * 0.5),
    x1: Math.round(screen.width * 0.75),
    y1: Math.round(screen.height * 0.55),
  };
}

export function readScreenSize(serial) {
  const output = adb(serial, ['shell', 'wm', 'size']);
  const match = /(\d+)x(\d+)/.exec(output);
  if (!match) fail(`could not read the screen size from ${JSON.stringify(output)}`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

export async function measureProbeOverhead({
  serial = argFlag('device-serial'),
  port = Number(argFlag('port', DEFAULT_PORT)),
  upstream = argFlag('upstream', DEFAULT_UPSTREAM),
  probeHost = argFlag('probe-host', DEFAULT_PROBE_HOST),
  address = argFlag('host-address', lanAddress()),
  samples = Number(argFlag('samples', SAMPLES_PER_ARM)),
  brush = argFlag('brush', 'pen'),
} = {}) {
  if (!serial) fail('--device-serial= is required');
  if (!address) fail('no non-loopback IPv4 address found — pass --host-address=');
  if (!BRUSHES.includes(brush)) fail(`--brush must be one of ${BRUSHES.join(', ')}`);

  const { server, state } = createOverheadHost({ upstream, probeHost });
  await new Promise((resolve) => server.listen(port, '0.0.0.0', resolve));
  const geometry = centreSwipe(readScreenSize(serial));
  const pageUrl = `http://${address}:${port}/`;
  const rows = [];
  const invalid = [];
  try {
    const committedBrush = await primeBrush(serial, pageUrl, probeHost, brush);
    // Arms interleaved rather than blocked, so a device that warms or throttles
    // across the run cannot be mistaken for the probe.
    for (let sample = 0; sample < samples; sample++) {
      for (const arm of ARMS) {
        const row = await runSample(serial, state, pageUrl, arm, geometry);
        if (row.invalid) invalid.push({ sample: sample + 1, arm, reason: row.invalid });
        else rows.push({ sample: sample + 1, brush: committedBrush, ...row });
      }
    }
  } finally {
    await shutDown(serial, server, probeHost);
  }
  // Every requested pair has to be valid. A comparison missing one arm of one sample
  // is not the interleaved design it claims to be, and reporting a mean over
  // whatever survived is how a broken run publishes an ordinary-looking number.
  if (invalid.length > 0) {
    for (const entry of invalid) {
      console.error(`sample ${entry.sample} ${entry.arm}: ${entry.reason}`);
    }
    fail(`${invalid.length} of ${samples * ARMS.length} measurements were not valid`);
  }
  return rows;
}

// The last page keeps polling a `finish: false` plan every 400 ms, and
// `server.close()` waits for that connection to drain — a run that measured cleanly
// then hung for six minutes until Chrome was force-stopped. Both halves are closed
// deterministically: the plan is finished so the page's own loop exits, and the
// browser is stopped so nothing is left holding a socket.
async function shutDown(serial, server, probeHost) {
  await fetch(`${probeHost}/__probe/control`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ finish: true }),
  }).catch(() => {});
  adb(serial, ['shell', 'am', 'force-stop', CHROME_PACKAGE]);
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    const rows = await measureProbeOverhead();
    console.table(rows);
    for (const arm of ARMS) {
      const perSecond = rows.filter((row) => row.arm === arm).map((row) => row.perSecond);
      if (!perSecond.length) continue;
      const mean = perSecond.reduce((total, value) => total + value, 0) / perSecond.length;
      console.log(
        `${arm.padEnd(8)} ${rows[0].brush} frames/s ${mean.toFixed(2)} ` +
          `(${perSecond.map((value) => value.toFixed(2)).join(', ')})`
      );
    }
  });
}
