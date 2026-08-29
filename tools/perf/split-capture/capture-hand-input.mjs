// Record what a REAL HUMAN FINGER reports in one capture runtime, so an input
// fidelity threshold can be set from a measurement of that runtime instead of
// from another platform's numbers.
//
//   npm run perf:device:hand -- --platform=android --device-serial=<serial> \
//     --host=http://<lan-ip>:4175 --brush=pen --seconds=25
//
// This is the same split-capture path as `perf:device:frames` with the injection
// half removed: the page instruments itself and uploads its report exactly as it
// does for a driven run, and a person draws in place of `adb shell input`. That
// symmetry is the point — a hand number is only a calibration for a driven
// capture if both were read by the same instrument.
//
// The artifact keeps the probe's RAW event rows, which is what makes the human's
// time reusable: every percentile and verdict is derived in Node, so a later
// revision of the fidelity table re-reads this file rather than asking for
// another finger. Issue 1218 is the Android half of that measurement.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { argFlag, capture, fail, isMain, ROOT, runMain, sleep } from '../../lib/proc.mjs';
import { assertServedBuildIsFresh } from '../lib/profile-preview.mjs';
import { mintProbeNonce } from '../lib/capture-attribution.mjs';
import { pollFor } from './lib/poll.mjs';
import { hostQuietRecord, sampleHostLoad } from '../lib/host-quiet.mjs';
import { readinessThemeProblem } from '../lib/campaign-state.mjs';
import { captureRuntime, describeFidelityFailures, inputFidelity } from '../lib/input-fidelity.mjs';
import { describeRefreshRegime, refreshRegimeVerdict } from '../lib/refresh-regime.mjs';
import { inputRows, pacingRows, summarizeRun } from '../lib/real-screen-stats.mjs';
import { androidOpenSteps } from './lib/android-input.mjs';
import { APP_BUNDLE_ID } from './capture-device-frames.mjs';
import { fetchAcceptedProbeReport } from './lib/probe-host-protocol.mjs';

const PLATFORMS = ['android', 'ios'];
const BRUSHES = ['pen', 'crayon', 'magic', 'eraser'];
const ORIENTATIONS = ['PORTRAIT', 'LANDSCAPE'];
const OPENERS = ['adb', 'devicectl', 'manual'];
const DEFAULT_DRAW_SECONDS = 25;
const APP_STOP_SETTLE_MS = 1_500;
const ROTATION_SETTLE_MS = 2_500;
const PAGE_SETTLE_MS = 6_000;
const PROBE_READY_TIMEOUT_MS = 180_000;
// A launched app that will contact the probe host does so within a few seconds
// of the launch; one that never will — a locked iPad (devicectl reports the
// launch as successful anyway) or an installed clean bundled build that renders
// the app perfectly and never loads the probe host — is silent forever. Fifteen
// seconds separates the two without eating the operator's capture window the
// way the full three-minute ready poll did twice on 2026-08-25 (issue 1316).
const FIRST_CONTACT_TIMEOUT_MS = 15_000;
const REPORT_TIMEOUT_MS = 120_000;
// The probe ends a phase on its own once the banked contact time runs out; a
// hand run is ended by the clock below instead, so the bank has to outlast it.
const CONTACT_BANK_MS = 600_000;
// A hand stroke is still committing raster work when the drawer lifts off.
const DRAW_TAIL_MS = 1_200;
const BUZZ_MS = 350;

const adb = (serial, args) => capture('adb', ['-s', serial, ...args]);

// The person drawing is holding the device, not watching the terminal, so the
// start and end of the window have to be announced on the device itself. Best
// effort by design: a phone that will not buzz is not a reason to lose a capture
// the human is already standing there to give.
function buzz(serial, times) {
  if (!serial) return;
  for (let index = 0; index < times; index += 1) {
    try {
      adb(serial, ['shell', 'cmd', 'vibrator_manager', 'synced', 'oneshot', String(BUZZ_MS)]);
    } catch {
      return;
    }
  }
}

const control = (host, body) =>
  fetch(`${host}/__probe/control`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then((response) => response.json());

const probeState = (host) => fetch(`${host}/__probe/state`).then((response) => response.json());

// The runtime is the one mode dimension the page can answer for itself, and the
// one this tool used to copy from the request: a hand capture labelled
// `ios-capacitor-webview` was recorded in Safari because Safari happened to be
// foregrounded, and nothing noticed (PR 1314's review). Safari stamps a
// `Version/… Safari/…` token a WKWebView never emits; the Android System
// WebView stamps `; wv` / `Version/4.0` where Chrome has neither. Returns the
// refusal message, or null when the UA is consistent with the labelled runtime.
export function runtimeUaProblem(runtime, ua) {
  const agent = String(ua ?? '');
  if (!agent) return `the report carries no user agent, so the ${runtime} label is unverifiable`;
  const safariToken = / Version\/[\d.]+.* Safari\//.test(agent);
  const androidWebviewToken = agent.includes('; wv') || agent.includes('Version/4.0');
  const problems = {
    'ios-safari': safariToken ? null : 'no Safari Version token — this is not Safari',
    'ios-capacitor-webview': safariToken
      ? 'the Safari Version token is present — this page ran in Safari, not the WKWebView'
      : null,
    'android-chrome': androidWebviewToken
      ? 'the Android WebView token is present — this page ran in a WebView, not Chrome'
      : null,
    'android-capacitor-webview': androidWebviewToken
      ? null
      : 'no Android WebView token — this page ran in a browser, not the WebView',
  };
  const problem = problems[runtime] ?? null;
  return problem ? `the page's user agent contradicts ${runtime}: ${problem} (ua: ${agent})` : null;
}

// `--native-app` decides the RUNTIME the artifact is judged as, so opening Chrome
// here while recording `android-capacitor-webview` produces a calibration read off
// the wrong browser — correctly shaped, plausibly labelled, and wrong. The opener
// has to follow the flag.
// `exec` is injected so this call site can be tested. Asserting the chooser in
// isolation proved it picks correctly when handed the right value, and left the
// original bug reachable: passing `nativeApp: false` HERE opens Chrome while
// `captureRuntime(platform, nativeApp)` still labels the artifact a WebView
// runtime, and the suite stayed green.
export async function openWithAdb({ serial, pageUrl, orientation, nativeApp, exec = adb }) {
  const settles = {
    appStop: APP_STOP_SETTLE_MS,
    rotation: ROTATION_SETTLE_MS,
    page: PAGE_SETTLE_MS,
  };
  for (const step of androidOpenSteps({ nativeApp, orientation, pageUrl })) {
    exec(serial, step.args);
    if (step.settle) await sleep(settles[step.settle]);
  }
}

// A manual page that stood down means the human's URL lacked this run's
// identity — with exactly one page in play, waiting out the full ready budget
// buys nothing but three minutes of blank screen (issue 1300 review). Exported
// for the message test; the adb path deliberately does NOT fail on this signal,
// because leftover tabs standing down while the real page loads is that
// transport's normal weather.
export function stalePageFailure(pageUrl) {
  return (
    'a page reached the probe host without this run’s identity and stood down — it was opened ' +
    'without the exact printed URL. Reopen this address, query string included:\n' +
    `\n      ${pageUrl}\n`
  );
}

// Issue 1295: the manual path predates the page-identity guard and printed a
// bare host URL, so a hand capture could never prove which run its page
// belonged to. The printed URL now carries the run nonce, giving the manual
// flow the same guarantee as the driven one — the capture refuses a page that
// was not opened at it. Exported as lines so the guarantee is testable.
export function manualOpenLines({ pageUrl, orientation, theme }) {
  return [
    '',
    '  Open this EXACT address on the device, in the runtime being calibrated',
    '  (the query is this run’s identity — the capture refuses a page without it):',
    '',
    `      ${pageUrl}`,
    '',
    `  Hold it in ${orientation}, with the ${theme} theme selected.`,
    '  The page selects its own brush and reports back when it is ready.',
    '',
  ];
}

function announceManualOpen(details) {
  for (const line of manualOpenLines(details)) console.log(line);
}

// A deterministic launch of the installed app, so the capture cannot depend on
// whichever app the operator (or a previous automation step) left foregrounded.
// `--terminate-existing` forces a fresh page load, which is also what makes the
// page re-read the plan this run just posted.
export function openWithDevicectl({ udid, exec = capture }) {
  exec('xcrun', [
    'devicectl',
    'device',
    'process',
    'launch',
    '--terminate-existing',
    '--device',
    udid,
    APP_BUNDLE_ID,
  ]);
}

// What silence after a devicectl launch means, in the operator's terms. First
// contact is any request for the plan, not proof of identity — a page that asks
// for the plan may still fail readiness — but a launch that produces NO request
// is one of exactly two operator-fixable states, and both look identical on the
// device.
export function firstContactFailure(host) {
  return (
    `the launched app never phoned home — no request for the probe plan reached ${host} ` +
    `within ${FIRST_CONTACT_TIMEOUT_MS / 1000}s. Two usual causes:\n` +
    '  - the iPad is locked: devicectl reports a successful launch even behind a locked\n' +
    '    screen, and the WebView then never loads. Unlock the iPad and re-run this step.\n' +
    `  - the installed build cannot do a probe capture: a clean bundled build renders the\n` +
    `    drawing app perfectly and never contacts ${host}. Install the server.url profiling\n` +
    '    build (npm run perf:build:cap, then npm run ios:run:device) and re-run.'
  );
}

async function countDown(seconds) {
  for (let remaining = seconds; remaining > 0; remaining -= 1) {
    process.stdout.write(`\r  drawing — ${String(remaining).padStart(3)}s left `);
    await sleep(1_000);
  }
  process.stdout.write('\r  drawing — done             \n');
}

// The numbers a fidelity expectation is written from. Printed on their own
// rather than only inside the verdict, because for this capture they ARE the
// result: the verdict is expected to report uncalibrated checks, and the whole
// purpose of the run is to supply what those checks have never had.
//
// Exported for its test: these key names are the contract the tracked evidence
// index is read back through, so a rename here silently orphans every capture a
// person's hand paid for.
export function calibrationReading(input = {}) {
  return {
    kinds: input.kinds ?? null,
    trustedShare: input.trust?.share ?? null,
    movesPerSecond: input.movesPerSecond ?? null,
    moveGapP95Ms: input.moveGapP95Ms ?? null,
    movesPerFrame: input.movesPerFrame ?? null,
    coalescedPerMove: input.coalescedPerMove ?? null,
    pressureP50: input.pressure?.p50 ?? null,
    pressureP95: input.pressure?.p95 ?? null,
    contactWidthP50: input.contactWidth?.p50 ?? null,
    contactHeightP50: input.contactHeight?.p50 ?? null,
  };
}

// The artifact envelope, as a pure value — see drivenCaptureArtifact. A hand
// capture is the one a person paid for, so what it can prove about itself later
// matters more here than anywhere else.
export function handCaptureArtifact({
  hostQuiet = null,
  runLabel,
  runtime,
  platform,
  nativeApp,
  requirePageIdentity = false,
  brush,
  orientation,
  theme,
  ready,
  device,
  seconds,
  reading,
  fidelity,
  summaries,
  payload,
}) {
  return {
    label: runLabel,
    handCapture: true,
    runtime,
    platform,
    nativeApp,
    brush,
    orientation,
    theme,
    // The page's own answer, not the request — see capture-device-frames.
    observedTheme: ready?.resolvedTheme ?? null,
    pageIdentity: requirePageIdentity ? 'proven-by-url' : 'unprovable',
    // The dominant variable for coalescing (issue 1303): a native WebView here
    // loads the probe host remotely, never its bundled assets.
    pageDelivery: nativeApp ? 'remote-probe-host' : 'browser',
    device: device ?? null,
    drawSeconds: seconds,
    transport: 'human-finger',
    hostQuiet,
    reading,
    fidelity,
    summaries,
    report: payload?.report,
    topology: payload?.topology ?? null,
  };
}

export async function captureHandInput({
  platform = argFlag('platform', 'android'),
  brush = argFlag('brush', 'pen'),
  orientation = argFlag('orientation', 'PORTRAIT'),
  theme = argFlag('theme', 'light'),
  seconds = Number(argFlag('seconds', DEFAULT_DRAW_SECONDS)),
  host = argFlag('host'),
  serial = argFlag('device-serial'),
  udid = argFlag('device-udid'),
  // `argFlag` matches `--name=value` only, so a bare flag has to be read from argv.
  nativeApp = process.argv.includes('--native-app'),
  opener = argFlag('open', argFlag('platform', 'android') === 'android' ? 'adb' : 'manual'),
  label = argFlag('label'),
  output = argFlag('output'),
  allowForeignBuild = argFlag('allow-foreign-build'),
} = {}) {
  if (!PLATFORMS.includes(platform)) fail(`--platform must be one of ${PLATFORMS.join(', ')}`);
  if (!BRUSHES.includes(brush)) fail(`--brush must be one of ${BRUSHES.join(', ')}`);
  if (!ORIENTATIONS.includes(orientation)) {
    fail(`--orientation must be one of ${ORIENTATIONS.join(', ')}`);
  }
  if (!OPENERS.includes(opener)) fail(`--open must be one of ${OPENERS.join(', ')}`);
  if (!host) fail('--host= is required — the probe host URL the device can reach over the LAN');
  if (opener === 'adb' && !serial) fail('--device-serial= is required for --open=adb');
  if (opener === 'devicectl' && !udid) fail('--device-udid= is required for --open=devicectl');
  if (opener === 'devicectl' && !nativeApp) {
    fail('--open=devicectl launches the installed app, so it requires --native-app');
  }

  await assertServedBuildIsFresh(host, { allowForeignBuild: allowForeignBuild !== undefined });

  const runtime = captureRuntime(platform, nativeApp);
  const runLabel = label ?? `hand-${runtime}-${brush}-${orientation.toLowerCase()}-${theme}`;
  const hostLoadStart = sampleHostLoad();
  const nonce = mintProbeNonce(runLabel);
  // Only a page opened at a URL carrying the nonce can prove which run it
  // belongs to. A native WebView loads a build-time URL, so it cannot — the
  // artifact records that no proof was had. Browser pages can, whoever opens
  // them: adb navigates to the nonce URL, and the manual path prints one for
  // the human to open (issue 1295), so both are held to the proof.
  const requirePageIdentity = !nativeApp;
  await control(host, {
    brush,
    theme,
    label: runLabel,
    nonce,
    requirePageIdentity,
    contactMs: CONTACT_BANK_MS,
    finish: false,
    reset: true,
  });

  const pageUrl = `${host}/?probe=${encodeURIComponent(nonce)}`;
  if (opener === 'adb') await openWithAdb({ serial, pageUrl, orientation, nativeApp });
  else if (opener === 'devicectl') {
    openWithDevicectl({ udid });
    console.log(`  Launched the installed app; waiting for it to load ${host} …`);
    // The reset in the control call above zeroed the counter, so any request
    // now is this launch (or a leftover — either way, a reachable page).
    const contacted = await pollFor(
      async () => ((await probeState(host)).planRequests > 0 ? true : null),
      FIRST_CONTACT_TIMEOUT_MS
    );
    if (!contacted) fail(firstContactFailure(host));
    console.log('  The app reached the probe host; waiting for the page to report ready …');
    await sleep(PAGE_SETTLE_MS);
  } else announceManualOpen({ pageUrl, orientation, theme });

  const ready = await pollFor(async () => {
    const state = await probeState(host);
    if (opener === 'manual' && state.stalePage) fail(stalePageFailure(pageUrl));
    return state.ready;
  }, PROBE_READY_TIMEOUT_MS);
  if (!ready) fail('the page never reported the probe ready');
  if (ready.committed && ready.committed !== brush) {
    fail(`the engine is on ${ready.committed}, not ${brush}`);
  }
  // Theme used to be recorded from the REQUEST, so a light-labelled artifact
  // could be written while the page stayed dark. It is now set through the
  // product's Settings controls and read back before anything is measured.
  const themeProblem = readinessThemeProblem(ready, theme);
  if (themeProblem) fail(themeProblem);
  if (ready.geometry?.orientation && ready.geometry.orientation !== orientation) {
    fail(`the page is ${ready.geometry.orientation}, not the requested ${orientation}`);
  }

  console.log(`\n  READY — ${runtime}, ${brush}, ${orientation}.`);
  console.log(`  DRAW ON THE PAPER WITH ONE FINGER for ${seconds}s: long, continuous strokes,`);
  console.log(
    '  the way a toddler scribbles. Keep the finger down; lift only to start a new one.\n'
  );
  buzz(serial, 1);
  await countDown(seconds);
  buzz(serial, 2);
  await sleep(DRAW_TAIL_MS);
  await control(host, { finish: true });

  const uploaded = await pollFor(
    async () => ((await probeState(host)).hasReport ? true : null),
    REPORT_TIMEOUT_MS
  );
  if (!uploaded) fail('no report was uploaded');

  const payload = await fetchAcceptedProbeReport(host);
  if (payload.error) fail(payload.error);
  if ((payload.report?.events ?? []).length === 0) {
    fail('the capture recorded no pointer events — the finger never reached the canvas');
  }
  // Defence in depth, mirrored from the driven runner: the report names the URL
  // that produced it, and that URL carries the nonce this run announced.
  const capturedAt = new URL(payload.report?.meta?.url ?? 'http://invalid/').searchParams.get(
    'probe'
  );
  if (requirePageIdentity && capturedAt !== nonce) {
    fail(
      `the report came from a page opened for ${capturedAt ?? 'an unknown run'}, not ${nonce} — ` +
        'open the exact printed URL, query string included'
    );
  }
  // The runtime is observed, never trusted: a hand capture labelled for the
  // WKWebView was once recorded in Safari because Safari was foregrounded, and
  // every downstream reader would have believed it (PR 1314's review).
  const uaProblem = runtimeUaProblem(runtime, payload.report?.meta?.ua);
  if (uaProblem) fail(uaProblem);

  const summaries = summarizeRun(payload.report);
  const input = summaries.phases?.[0]?.input ?? {};
  const reading = calibrationReading(input);
  const fidelity = inputFidelity(input, runtime);

  console.log(
    `\n${runLabel} — observed frame beat: ` +
      `${describeRefreshRegime(refreshRegimeVerdict(summaries.intervalMs))}`
  );
  console.table(pacingRows(summaries.phases));
  console.table(inputRows(summaries.phases));
  console.log('\nWhat a real finger reports in this runtime:');
  console.table([reading]);
  console.log(
    `\nAgainst today's table: ${fidelity.passed ? 'PASS' : 'not passing'} — ` +
      `${describeFidelityFailures(fidelity) || 'every check'} (${fidelity.runtime})`
  );

  const artifact = handCaptureArtifact({
    hostQuiet: hostQuietRecord(hostLoadStart, sampleHostLoad()),
    runLabel,
    runtime,
    platform,
    nativeApp,
    requirePageIdentity,
    brush,
    orientation,
    theme,
    ready,
    device: serial ?? udid ?? null,
    seconds,
    reading,
    fidelity,
    summaries,
    payload,
  });

  if (output) {
    mkdirSync(dirname(join(ROOT, output)), { recursive: true });
    writeFileSync(join(ROOT, output), JSON.stringify(artifact, null, 2));
    console.log(`\nWrote ${output}`);
  }
  return artifact;
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    await captureHandInput();
  });
}
