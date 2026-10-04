// captureHandInput's PRODUCTION dispatch, executed (issue 1309). The earlier
// tests called exported openWithAdb directly, and fault injection proved the
// gap: flipping the production call back to `nativeApp: false` — the original
// Chrome-vs-WebView bug — left the focused suite green. This drives the whole
// run against a real in-test probe host with `--native-app` parsed from argv,
// and asserts the flag reaches the launch steps, the identity contract, and
// the artifact.
import { createServer } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const captureCalls = [];
const tryCaptureCalls = [];
// The phone's system settings: `settings get` answers `null` for one never
// written, as a device does, and `put` and `delete` change what it answers.
const phoneSettings = new Map();
// Substrings of the adb calls a test makes fail.
const failingCalls = [];
// fail() exits the process. Each one is recorded before it throws, so a catch
// that swallows the throw cannot hide that the run would have exited.
const exits = [];

function phoneAnswer(call) {
  const setting = call.match(/ shell settings (get|put|delete) system (\w+)(?: (\S+))?$/);
  if (!setting) return '';
  const [, verb, key, value] = setting;
  if (verb === 'get') return `${phoneSettings.get(key) ?? 'null'}\n`;
  if (verb === 'put') phoneSettings.set(key, value);
  else phoneSettings.delete(key);
  return '';
}

vi.mock('../../lib/proc.mjs', async (importOriginal) => {
  const real = await importOriginal();
  const fail = (message) => {
    exits.push(message);
    throw new Error(message);
  };
  const failing = (call) => failingCalls.some((part) => call.includes(part));
  return {
    ...real,
    sleep: async () => {},
    capture: (cmd, args) => {
      const call = [cmd, ...args].join(' ');
      captureCalls.push(call);
      if (failing(call)) fail(`${cmd} failed (exit 1)`);
      return phoneAnswer(call);
    },
    tryCapture: (cmd, args) => {
      const call = [cmd, ...args].join(' ');
      tryCaptureCalls.push(call);
      if (failing(call)) return { ok: false, stdout: '', stderr: 'device offline' };
      return { ok: true, stdout: phoneAnswer(call), stderr: '' };
    },
    fail,
  };
});

const buildGuard = vi.fn(async () => {});

vi.mock('../lib/profile-preview.mjs', () => ({
  assertServedBuildIsFresh: (...args) => buildGuard(...args),
}));

const { captureHandInput } = await import('../split-capture/capture-hand-input.mjs');
const { closeFloorControlHost, createFloorControlHost } =
  await import('../split-capture/serve-floor-control.mjs');
const { FLOOR_CONTROL_PAGE } = await import('../split-capture/lib/probe-host-protocol.mjs');

const FRAME_COUNT = 120;
const BEAT_MS = 16.67;

// The probe's real row schemas (real-screen-stats.mjs header): frames are
// [t, dt, contact] tuples and events are positional rows whose type column is
// 0=down/1=move/2=up. The events only need to exist and parse — the hand tool
// prints fidelity, it does not gate on it.
function probeReport({ url, ua }) {
  const start = 100;
  return {
    meta: { schema: 2, url, ua },
    phases: [
      {
        key: 'blank',
        paper: 'blank',
        startedAt: start,
        endedAt: start + FRAME_COUNT * BEAT_MS,
        contactMs: FRAME_COUNT * BEAT_MS,
        frames: FRAME_COUNT,
      },
    ],
    frames: Array.from({ length: FRAME_COUNT }, (_, index) => [start + index * BEAT_MS, -1, 1]),
    events: Array.from({ length: 30 }, (_, index) => [
      start + 20 + index * 8,
      start + 20 + index * 8,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0,
      44,
      44,
      null,
      null,
    ]),
    measures: [],
    history: [],
    liftLatencies: [],
  };
}

// A real HTTP probe host, minimal: answers the control PUT, reports a ready
// state, and exposes the accepted report the moment the run announces its
// label — with the page identity this test case wants the report to carry.
// Without `acceptReport`, the report endpoint answers 404 for the whole run.
function startProbeHost({ ua, reportProbeParam, acceptReport = true }) {
  const controls = [];
  let reportPayload = null;
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => {
      response.setHeader('content-type', 'application/json');
      if (request.method === 'PUT' && request.url === '/__probe/control') {
        const control = JSON.parse(body);
        controls.push(control);
        if (control.label && acceptReport) {
          const base = `http://device-page.test/`;
          const url =
            reportProbeParam === 'nonce'
              ? `${base}?probe=${encodeURIComponent(control.nonce)}`
              : base;
          reportPayload = { report: probeReport({ url, ua }) };
        }
        response.end('{}');
        return;
      }
      if (request.url === '/__probe/state') {
        response.end(
          JSON.stringify({
            planRequests: 1,
            stalePage: false,
            hasReport: true,
            ready: {
              committed: 'pen',
              resolvedTheme: 'light',
              geometry: { orientation: 'PORTRAIT' },
            },
          })
        );
        return;
      }
      if (request.url === '/__probe/report') {
        if (!reportPayload) response.statusCode = 404;
        response.end(JSON.stringify(reportPayload ?? { error: 'no accepted report' }));
        return;
      }
      response.end('{}');
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, controls, host: `http://127.0.0.1:${server.address().port}` })
    );
  });
}

const servers = [];
const floorServers = [];
const argvBaseline = [...process.argv];
// Auto-rotate on and user_rotation never written, so `settings get` answers 1
// and null: one setting to put back, one to delete.
const PHONE_AS_FOUND = { accelerometer_rotation: '1' };

beforeEach(() => {
  for (const [key, value] of Object.entries(PHONE_AS_FOUND)) phoneSettings.set(key, value);
});

afterEach(async () => {
  for (const { server } of servers.splice(0)) {
    await new Promise((resolve) => server.close(resolve));
  }
  for (const server of floorServers.splice(0)) await closeFloorControlHost(server);
  process.argv = [...argvBaseline];
  captureCalls.length = 0;
  tryCaptureCalls.length = 0;
  failingCalls.length = 0;
  exits.length = 0;
  phoneSettings.clear();
  buildGuard.mockClear();
});

async function runCapture({ nativeApp, ua, reportProbeParam, acceptReport }) {
  const probe = await startProbeHost({ ua, reportProbeParam, acceptReport });
  servers.push(probe);
  if (nativeApp) process.argv = [...argvBaseline, '--native-app'];
  const artifact = await captureHandInput({
    platform: 'android',
    brush: 'pen',
    orientation: 'PORTRAIT',
    theme: 'light',
    seconds: 0,
    host: probe.host,
    serial: 'FAKESERIAL',
    opener: 'adb',
  });
  return { artifact, controls: probe.controls };
}

describe('captureHandInput’s production dispatch', () => {
  // The fault this pins: openWithAdb picking correctly when HANDED the right
  // value proved nothing about the production call site, which once passed
  // `nativeApp: false` while captureRuntime still labelled the artifact a
  // WebView runtime — Chrome's numbers under the WebView's name.
  it('launches the installed app, not Chrome, when --native-app is parsed from argv', async () => {
    const { artifact } = await runCapture({
      nativeApp: true,
      ua: 'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Version/4.0 Chrome/126 Mobile',
      reportProbeParam: 'none',
    });

    const launches = captureCalls.filter((call) => call.includes('am start'));
    expect(launches.some((call) => call.includes('art.splotch.app'))).toBe(true);
    expect(captureCalls.some((call) => call.includes('com.android.chrome'))).toBe(false);
    expect(artifact.runtime).toBe('android-capacitor-webview');
    expect(artifact.nativeApp).toBe(true);
  });

  // Issue 1309's second gap, the artifact half: a native WebView loads a
  // build-time URL, so its page cannot carry the run nonce — the run asks for
  // no proof, proceeds to a report whose URL has no probe param at all, and
  // records that no proof was had.
  it('exempts the native run from page identity and records the exemption', async () => {
    const { artifact, controls } = await runCapture({
      nativeApp: true,
      ua: 'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Version/4.0 Chrome/126 Mobile',
      reportProbeParam: 'none',
    });

    expect(controls[0]).toMatchObject({ requirePageIdentity: false });
    expect(artifact.pageIdentity).toBe('unprovable');
  });

  it('launches Chrome at the nonce URL and holds the browser run to its proof', async () => {
    const { artifact, controls } = await runCapture({
      nativeApp: false,
      ua: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36',
      reportProbeParam: 'nonce',
    });

    const launches = captureCalls.filter((call) => call.includes('am start'));
    expect(launches.some((call) => call.includes('com.android.chrome'))).toBe(true);
    expect(
      launches.some((call) => call.includes(`probe=${encodeURIComponent(controls[0].nonce)}`))
    ).toBe(true);
    expect(captureCalls.some((call) => call.includes('art.splotch.app'))).toBe(false);
    expect(controls[0]).toMatchObject({ requirePageIdentity: true });
    expect(artifact.runtime).toBe('android-chrome');
    expect(artifact.pageIdentity).toBe('proven-by-url');
  });

  it('refuses a browser report from a page opened for another run', async () => {
    await expect(
      runCapture({
        nativeApp: false,
        ua: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36',
        reportProbeParam: 'none',
      })
    ).rejects.toThrow('open the exact printed URL');
  });
});

// Issue 2276: the hand capture ran the SvelteKit served-build guard against
// every host, so a finger could never be measured on the floor control, which
// has no build. It now routes the host the way perf:device:frames does. The
// floor host here is the real one; the loop below stands in for the device
// page a person would be drawing on.
const IPAD_SAFARI_UA =
  'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ' +
  'Version/18.6 Mobile/15E148 Safari/604.1';

async function startFloorHost() {
  const { server, state } = createFloorControlHost({ log: () => {} });
  floorServers.push(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { host: `http://127.0.0.1:${server.address().port}`, state };
}

async function drawOnFloorPage(host) {
  const plan = () => fetch(`${host}/__probe/plan`).then((response) => response.json());
  const post = (path, body) =>
    fetch(`${host}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const wait = () => new Promise((resolve) => setTimeout(resolve, 5));
  let current = await plan();
  while (!current.nonce) {
    await wait();
    current = await plan();
  }
  const { nonce } = current;
  await post('/__probe/ready', {
    nonce,
    resolvedTheme: 'light',
    geometry: { orientation: 'PORTRAIT' },
  });
  while (!(await plan()).finish) await wait();
  const url = `${host}/?probe=${encodeURIComponent(nonce)}`;
  await post('/__probe/report', { nonce, report: probeReport({ url, ua: IPAD_SAFARI_UA }) });
}

const floorHandRequest = (host, overrides = {}) => ({
  platform: 'ios',
  brush: 'pen',
  orientation: 'PORTRAIT',
  theme: 'light',
  seconds: 0,
  host,
  opener: 'manual',
  ...overrides,
});

describe('a hand capture against the floor control', () => {
  it('proves the floor by its served bytes and records a floor artifact', async () => {
    const { host } = await startFloorHost();

    const [artifact] = await Promise.all([
      captureHandInput(floorHandRequest(host)),
      drawOnFloorPage(host),
    ]);

    expect(buildGuard).not.toHaveBeenCalled();
    expect(artifact).toMatchObject({
      page: FLOOR_CONTROL_PAGE,
      handCapture: true,
      runtime: 'ios-safari',
      productCommit: null,
      buildEntry: null,
      pageIdentity: 'proven-by-url',
    });
    expect(artifact.buildDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses a request the floor cannot honour before posting a plan', async () => {
    const { host, state } = await startFloorHost();

    await expect(captureHandInput(floorHandRequest(host, { brush: 'crayon' }))).rejects.toThrow(
      /--brush=pen/
    );
    await expect(captureHandInput(floorHandRequest(host, { theme: 'dark' }))).rejects.toThrow(
      /--theme=light/
    );
    await expect(
      captureHandInput(floorHandRequest(host, { platform: 'android', nativeApp: true }))
    ).rejects.toThrow(/--native-app/);
    expect(state.plan.nonce).toBeUndefined();
    expect(buildGuard).not.toHaveBeenCalled();
  });

  // run-operator-session serves the web build to a native hand capture's
  // WebView, so the guard must not demand the native export for it.
  it('still holds the app probe host to the web served-build guard', async () => {
    await runCapture({
      nativeApp: true,
      ua: 'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Version/4.0 Chrome/126 Mobile',
      reportProbeParam: 'none',
    });

    expect(buildGuard).toHaveBeenCalledWith(expect.any(String), { allowForeignBuild: false });
  });
});

// Every guided Android hand capture opens over adb (run-operator-session), and
// every adb open turns auto-rotate off and pins user_rotation. A phone left that
// way hands the next reader that assumes portrait the wrong geometry, which is
// what issue 2272 fixed for the driven capture. The fail() exit path, which no
// in-process test can take, is android-rotation-handback.test.mjs's child run.
describe('captureHandInput hands the phone back as it found it', () => {
  const NATIVE_RUN = {
    nativeApp: true,
    ua: 'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Version/4.0 Chrome/126 Mobile',
    reportProbeParam: 'none',
  };
  const settingsCalls = (calls) => calls.filter((call) => call.includes(' shell settings '));

  it('reads both settings before the open writes either', async () => {
    await runCapture(NATIVE_RUN);

    const firstWrite = captureCalls.findIndex((call) => call.includes(' settings put '));
    expect(captureCalls.slice(0, firstWrite)).toEqual([
      'adb -s FAKESERIAL shell settings get system accelerometer_rotation',
      'adb -s FAKESERIAL shell settings get system user_rotation',
      'adb -s FAKESERIAL shell am force-stop art.splotch.app',
    ]);
  });

  it('puts both back after a clean capture, keeping no exit listener', async () => {
    const exitListeners = process.listenerCount('exit');

    await runCapture(NATIVE_RUN);

    expect(settingsCalls(tryCaptureCalls)).toEqual([
      'adb -s FAKESERIAL shell settings put system accelerometer_rotation 1',
      'adb -s FAKESERIAL shell settings delete system user_rotation',
    ]);
    expect(Object.fromEntries(phoneSettings)).toEqual(PHONE_AS_FOUND);
    expect(process.listenerCount('exit')).toBe(exitListeners);
  });

  it('puts both back when the capture throws after the drawing', async () => {
    await expect(runCapture({ ...NATIVE_RUN, acceptReport: false })).rejects.toThrow(
      'did not answer successfully (404)'
    );

    expect(exits).toEqual([]);
    expect(settingsCalls(captureCalls)).toContain(
      'adb -s FAKESERIAL shell settings put system accelerometer_rotation 0'
    );
    expect(Object.fromEntries(phoneSettings)).toEqual(PHONE_AS_FOUND);
  });

  it('reads and writes no rotation for an opener that turns no phone', async () => {
    const { host } = await startFloorHost();

    await Promise.all([captureHandInput(floorHandRequest(host)), drawOnFloorPage(host)]);

    expect(settingsCalls([...captureCalls, ...tryCaptureCalls])).toEqual([]);
  });

  // The cue is best effort: a phone that will not buzz must not cost the
  // capture a person is standing there to give.
  it('carries on past a phone that will not buzz, trying once per cue', async () => {
    failingCalls.push('vibrator_manager');

    const { artifact } = await runCapture(NATIVE_RUN);

    expect(exits).toEqual([]);
    expect(artifact.handCapture).toBe(true);
    expect(tryCaptureCalls.filter((call) => call.includes('vibrator_manager'))).toHaveLength(2);
  });
});
