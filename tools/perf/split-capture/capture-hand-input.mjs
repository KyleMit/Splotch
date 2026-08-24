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
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { argFlag, capture, fail, isMain, ROOT, runMain, sleep } from '../../lib/proc.mjs';
import { assertServedBuildIsFresh } from '../lib/profile-preview.mjs';
import { readinessThemeProblem } from '../lib/campaign-state.mjs';
import { captureRuntime, describeFidelityFailures, inputFidelity } from '../lib/input-fidelity.mjs';
import { describeRefreshRegime, refreshRegimeVerdict } from '../lib/refresh-regime.mjs';
import { inputRows, pacingRows, summarizeRun } from '../lib/real-screen-stats.mjs';
import { androidOpenSteps } from './lib/android-input.mjs';

const PLATFORMS = ['android', 'ios'];
const BRUSHES = ['pen', 'crayon', 'magic', 'eraser'];
const ORIENTATIONS = ['PORTRAIT', 'LANDSCAPE'];
const OPENERS = ['adb', 'manual'];
const DEFAULT_DRAW_SECONDS = 25;
const APP_STOP_SETTLE_MS = 1_500;
const ROTATION_SETTLE_MS = 2_500;
const PAGE_SETTLE_MS = 6_000;
const PROBE_READY_TIMEOUT_MS = 180_000;
const REPORT_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 1_000;
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

async function pollFor(callback, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await callback().catch(() => null);
    if (value) return value;
    await sleep(POLL_INTERVAL_MS);
  }
  return null;
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

function announceManualOpen({ host, orientation, theme }) {
  console.log('\n  Open this on the device, in the runtime being calibrated:');
  console.log(`\n      ${host}/\n`);
  console.log(`  Hold it in ${orientation}, with the ${theme} theme selected.`);
  console.log('  The page selects its own brush and reports back when it is ready.\n');
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
    device: device ?? null,
    drawSeconds: seconds,
    transport: 'human-finger',
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
  // `argFlag` matches `--name=value` only, so a bare flag has to be read from argv.
  nativeApp = process.argv.includes('--native-app'),
  opener = argFlag('open', argFlag('platform', 'android') === 'android' ? 'adb' : 'manual'),
  label = argFlag('label'),
  output = argFlag('output'),
  reportDir = argFlag('report-dir', join(ROOT, 'perf-profiles', 'split-capture', 'reports')),
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

  await assertServedBuildIsFresh(host, { allowForeignBuild: allowForeignBuild !== undefined });

  const runtime = captureRuntime(platform, nativeApp);
  const runLabel = label ?? `hand-${runtime}-${brush}-${orientation.toLowerCase()}-${theme}`;
  const nonce = `${runLabel}-${process.pid}-${Math.round(performance.now())}`;
  // Only a page we opened at a URL we chose can prove which run it belongs to.
  // A person opening the host by hand cannot carry a nonce, and a native WebView
  // loads a build-time URL — so those ask for no proof and the artifact records
  // that none was had.
  const requirePageIdentity = opener === 'adb' && !nativeApp;
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
  else announceManualOpen({ host, orientation, theme });

  const ready = await pollFor(async () => (await probeState(host)).ready, PROBE_READY_TIMEOUT_MS);
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

  const payload = JSON.parse(readFileSync(join(reportDir, `${runLabel}.json`), 'utf8'));
  if (payload.error) fail(payload.error);
  if ((payload.report?.events ?? []).length === 0) {
    fail('the capture recorded no pointer events — the finger never reached the canvas');
  }

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
    runLabel,
    runtime,
    platform,
    nativeApp,
    requirePageIdentity,
    brush,
    orientation,
    theme,
    ready,
    device: serial,
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
