// Drive one drawing capture on a physical device, with input and measurement on
// separate channels (ADR-0135).
//
//   npm run perf:device:frames -- --platform=android --brush=crayon --orientation=LANDSCAPE
//   npm run perf:device:frames -- --platform=ios --brush=pen --wda-url=http://127.0.0.1:8100
//
// Input is the platform's own trusted injection — `adb shell input` on Android,
// WebDriverAgent's W3C actions on iPadOS — replaying the same gesture plan the
// Appium transport dispatches. Measurement comes back over HTTP from the probe
// host, so neither an Appium session nor a Safari Web Inspector connection has
// to be available.
//
// Why this exists at all: the Appium Android browser transport delivers 46.8
// contact moves per second against a 100-170 fidelity band, so cells captured
// through it cannot be scored. This path clears the band.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  argFlag,
  capture,
  fail,
  isMain,
  ROOT,
  runMain,
  sleep,
  tryCapture,
} from '../../lib/proc.mjs';
import { assertServedBuildIsFresh } from '../lib/profile-preview.mjs';
import { nativeCanvasBounds, trustedGestureActions } from '../ios/capture-xcuitest-screen.mjs';
import { readinessThemeProblem } from '../lib/campaign-state.mjs';
import { captureRuntime, describeFidelityFailures, inputFidelity } from '../lib/input-fidelity.mjs';
import { describeRefreshRegime, refreshRegimeVerdict } from '../lib/refresh-regime.mjs';
import { drawingGateRows, scoreDrawingRun } from '../lib/drawing-gates.mjs';
import {
  engineRows,
  inputRows,
  pacingRows,
  starvationRows,
  summarizeRun,
} from '../lib/real-screen-stats.mjs';
import { androidGestureInstructions, androidOpenSteps, swipeArgs } from './lib/android-input.mjs';
import { activateChromePage, clearToolingLitter } from './lib/chrome-tabs.mjs';
import { PORT_ROLES } from '../lib/capture-readiness.mjs';

const PLATFORMS = ['android', 'ios'];
const BRUSHES = ['pen', 'crayon', 'magic', 'eraser'];
const ORIENTATIONS = ['PORTRAIT', 'LANDSCAPE'];
// Chrome and Safari both need time to settle a cold navigation before the
// bootstrap can find a sized canvas; the probe-ready poll below is the real
// gate, this only avoids hammering it from the first millisecond.
const PAGE_SETTLE_MS = 6_000;
const APP_STOP_SETTLE_MS = 1_500;
const ROTATION_SETTLE_MS = 2_500;
const PROBE_READY_TIMEOUT_MS = 90_000;
// Shorter than the full budget on purpose: this is how long to wait before
// deciding the launch did not land, not how long a slow page may take.
const PROBE_READY_OPEN_TIMEOUT_MS = 30_000;
const REPORT_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 1_000;
// After the last pointerUp the engine still has queued raster work; ending the
// phase immediately would clip it out of the capture.
const GESTURE_TAIL_MS = 1_200;
const WDA_SESSION_ATTEMPTS = 3;
const SAFARI_BUNDLE_ID = 'com.apple.mobilesafari';
export const APP_BUNDLE_ID = 'art.splotch.app';
const WDA_SESSION_SETTLE_MS = 2_500;
const CONTACT_BANK_MS = 600_000;

const adb = (serial, args) => capture('adb', ['-s', serial, ...args]);

async function control(host, body) {
  const response = await fetch(`${host}/__probe/control`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.json();
}

const probeState = (host) => fetch(`${host}/__probe/state`).then((r) => r.json());

async function wda(wdaUrl, method, path, body) {
  const response = await fetch(`${wdaUrl}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};
  if (parsed.value?.error) throw new Error(`${method} ${path}: ${parsed.value.message}`);
  return parsed.value;
}

// A native run reaches the same instrumented page through the app's own WebView
// rather than the browser, which needs the app built with `server.url` pointed at
// the probe host. What that changes is asset DELIVERY, not the engine: the touch
// path, the compositor and the frame loop are the WebView's either way. The
// artifact says so rather than leaving a reader to assume a bundled build.
function parsePositivePort(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) fail(`--${name} must be a positive integer`);
  return parsed;
}

// The pulse is the page's own running event count, posted until the first
// event arrives. Zero after a full dispatch means every injected touch landed
// on another tab or app — the wrong-tab failure that used to surface only as a
// report timeout (issue 1294) — and no amount of waiting changes it. A partial
// wrong-tab run (some events, most lost) is the fidelity gate's job, not this
// check's. A null pulse is a page that never pulsed (floor control, a
// pre-pulse bootstrap) and decides nothing.
export function zeroInputProblem(pulse) {
  if (!pulse || pulse.events !== 0) return null;
  return (
    'the page received zero input events across the whole dispatch — the injected touches ' +
    'landed on another tab or app, not the run page (issue 1294)'
  );
}

// `exec` and `activate` are injected so the wiring is testable at THIS call
// site — the openWithAdb precedent in capture-hand-input.mjs records how a
// tested chooser with an untested call site shipped the exact bug the test
// existed for.
export function androidDriver({
  serial,
  pageUrl,
  orientation,
  nativeApp,
  cdpPort,
  exec = adb,
  forward = tryCapture,
  activate = activateChromePage,
  litterClearer = clearToolingLitter,
}) {
  const nonce = new URL(pageUrl).searchParams.get('probe');
  const toolingHostname = new URL(pageUrl).hostname;
  // Session restore across the launch's force-stop can front a restored tab
  // while the run's page loads behind it (issue 1294). Closing the transport's
  // OWN litter removes the pile the restore re-fronts from — activation alone
  // lost that race twice while reporting success — and activating the run's
  // page then fails benignly: an unidentifiable page is left alone and the
  // zero-input check after dispatch is the enforcement. The forward runs
  // through the reporting runner, never capture(): a guard whose failure path
  // is process.exit is not best-effort, and --no-rebind refuses to steal a
  // forward another session owns.
  const frontRunPage = async (moment) => {
    if (nativeApp) return;
    const bound = forward('adb', [
      '-s',
      serial,
      'forward',
      '--no-rebind',
      `tcp:${cdpPort}`,
      'localabstract:chrome_devtools_remote',
    ]);
    if (!bound.ok) {
      console.log(
        `tab guard skipped ${moment}: forward tcp:${cdpPort} unavailable (${bound.stderr.trim()}) — ` +
          'a restored tab may hold the foreground; the zero-input check will catch it'
      );
      return;
    }
    try {
      const cdpBase = `http://127.0.0.1:${cdpPort}`;
      const cleared = await litterClearer({ cdpBase, hostname: toolingHostname, nonce });
      if (cleared.closed > 0) {
        console.log(`closed ${cleared.closed} of this transport's leftover tab(s) ${moment}`);
      }
      const result = await activate({ cdpBase, nonce });
      if (!result.activated) {
        console.log(
          `could not identify the run page among ${result.pages} Chrome tab(s) ${moment} — ` +
            'a restored tab may hold the foreground; the zero-input check will catch it'
        );
      }
    } catch (error) {
      console.log(
        `run-page activation unavailable ${moment} (${error?.message ?? error}) — ` +
          'a restored tab may hold the foreground; the zero-input check will catch it'
      );
    }
  };
  return {
    async openPage() {
      const settles = {
        appStop: APP_STOP_SETTLE_MS,
        rotation: ROTATION_SETTLE_MS,
        page: PAGE_SETTLE_MS,
      };
      for (const step of androidOpenSteps({ nativeApp, orientation, pageUrl })) {
        exec(serial, step.args);
        if (step.settle) await sleep(settles[step.settle]);
      }
      await frontRunPage('after launch');
    },
    boundsFrom(geometry) {
      return {
        bounds: geometry.canvas,
        densityScale: geometry.dpr,
        offset: { x: geometry.screenX * geometry.dpr, y: geometry.screenY * geometry.dpr },
      };
    },
    async dispatch({ bounds, densityScale, offset }, repeats) {
      await frontRunPage('before dispatch');
      if (!nativeApp) {
        // Nothing may stay attached while input is measured; a forward that was
        // never established (activation unavailable) has nothing to remove.
        forward('adb', ['-s', serial, 'forward', '--remove', `tcp:${cdpPort}`]);
      }
      const instructions = androidGestureInstructions(trustedGestureActions(bounds, repeats, 0), {
        densityScale,
        offset,
      });
      for (const instruction of instructions) {
        if (instruction.kind === 'pause') await sleep(instruction.durationMs);
        else exec(serial, swipeArgs(instruction));
      }
    },
  };
}

function iosDriver({ wdaUrl, pageUrl, nativeApp }) {
  let sessionId = null;
  return {
    async openPage() {
      // WDA keeps at most one session and expires it on its own schedule, so a
      // stale id from a previous capture reads as "Session does not exist" on
      // the first call. Always take a fresh one, and verify it before using it.
      const status = await wda(wdaUrl, 'GET', '/status');
      if (status.sessionId) {
        await wda(wdaUrl, 'DELETE', `/session/${status.sessionId}`).catch(() => null);
      }
      for (let attempt = 0; attempt < WDA_SESSION_ATTEMPTS; attempt += 1) {
        const created = await wda(wdaUrl, 'POST', '/session', {
          capabilities: {
            alwaysMatch: {
              bundleId: nativeApp ? APP_BUNDLE_ID : SAFARI_BUNDLE_ID,
              shouldWaitForQuiescence: false,
            },
          },
        });
        sessionId = created.sessionId;
        await sleep(WDA_SESSION_SETTLE_MS);
        // The native app loads the probe host from its own configuration, so
        // there is no URL to navigate: launching it IS opening the page.
        const opened = nativeApp
          ? true
          : await wda(wdaUrl, 'POST', `/session/${sessionId}/url`, { url: pageUrl }).then(
              () => true,
              () => false
            );
        if (opened) break;
        await sleep(WDA_SESSION_SETTLE_MS);
      }
      await sleep(PAGE_SETTLE_MS);
    },
    async boundsFrom(geometry) {
      const size = await wda(wdaUrl, 'GET', `/session/${sessionId}/window/size`);
      const element = await wda(wdaUrl, 'POST', `/session/${sessionId}/element`, {
        using: 'class name',
        value: 'XCUIElementTypeWebView',
      }).catch(() => null);
      const key = 'element-6066-11e4-a52e-4f735466cecf';
      const webViewBounds = element
        ? await wda(
            wdaUrl,
            'GET',
            `/session/${sessionId}/element/${element[key] ?? element.ELEMENT}/rect`
          )
        : { x: 0, y: 0, ...size };
      return {
        bounds: nativeCanvasBounds({
          webGeometry: geometry,
          webViewBounds,
          nativeWindow: { x: 0, y: 0, ...size },
          includeBrowserChrome: true,
        }),
        densityScale: 1,
        offset: { x: 0, y: 0 },
      };
    },
    async dispatch({ bounds }, repeats) {
      await wda(wdaUrl, 'POST', `/session/${sessionId}/actions`, {
        actions: [
          {
            type: 'pointer',
            id: 'finger',
            parameters: { pointerType: 'touch' },
            actions: trustedGestureActions(bounds, repeats, 0),
          },
        ],
      });
    },
  };
}

async function pollFor(callback, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await callback().catch(() => null);
    if (value) return value;
    await sleep(POLL_INTERVAL_MS);
  }
  return null;
}

// The artifact envelope, as a pure value. Extracted so the fields a later reader
// TRUSTS can be asserted without a device: `observedTheme` had no test, and
// deleting the assignment left the suite green while recreating the exact gap it
// closes — the handshake knew the theme and the saved file could not prove it.
export function drivenCaptureArtifact({
  runLabel,
  platform,
  brush,
  orientation,
  theme,
  ready,
  nativeApp,
  requirePageIdentity = true,
  fidelity,
  drawing,
  summaries,
  payload,
}) {
  return {
    label: runLabel,
    platform,
    brush,
    orientation,
    theme,
    // What the PAGE reported, read back at readiness. `theme` alone is a request,
    // and `report.meta.theme` cannot answer either: the product stores the
    // loosest preference that renders an appearance, so choosing the theme the OS
    // already shows clears the override and leaves that field null. An artifact
    // has to be able to prove which theme it measured without re-deriving it.
    observedTheme: ready?.resolvedTheme ?? null,
    nativeApp,
    // A native run reaches the instrumented page over the LAN through the app's
    // `server.url`, so its assets are not the bundled ones. Recorded because the
    // difference is invisible in the numbers and material to what the cell means.
    pageDelivery: nativeApp ? 'remote-probe-host' : 'browser',
    // Whether this capture could prove the page it measured was the one this run
    // opened. A native WebView loads a build-time URL, so it cannot — recorded
    // rather than assumed, because the guarantee genuinely differs by transport.
    pageIdentity: requirePageIdentity ? 'proven-by-url' : 'unprovable',
    transport: 'split-input-measurement',
    fidelity,
    drawing,
    summaries,
    report: payload?.report,
    topology: payload?.topology ?? null,
  };
}

export async function captureDeviceFrames({
  platform = argFlag('platform', 'android'),
  brush = argFlag('brush', 'pen'),
  orientation = argFlag('orientation', 'PORTRAIT'),
  theme = argFlag('theme', 'light'),
  repeats = Number(argFlag('gesture-repeats', 10)),
  host = argFlag('host'),
  serial = argFlag('device-serial'),
  cdpPort = parsePositivePort(argFlag('cdp-port', PORT_ROLES.androidCdp.port), 'cdp-port'),
  wdaUrl = argFlag('wda-url', 'http://127.0.0.1:8100'),
  label = argFlag('label'),
  output = argFlag('output'),
  reportDir = argFlag('report-dir', join(ROOT, 'perf-profiles', 'split-capture', 'reports')),
  allowForeignBuild = process.argv.includes('--allow-foreign-build'),
  // `argFlag` only matches `--name=value`, so a BARE flag is invisible to it and
  // reads as absent. A capture that silently ran against Safari while reporting a
  // WebView runtime is the failure this shape produces.
  nativeApp = process.argv.includes('--native-app'),
} = {}) {
  if (!PLATFORMS.includes(platform)) fail(`--platform must be one of ${PLATFORMS.join(', ')}`);
  if (!BRUSHES.includes(brush)) fail(`--brush must be one of ${BRUSHES.join(', ')}`);
  if (!ORIENTATIONS.includes(orientation)) {
    fail(`--orientation must be one of ${ORIENTATIONS.join(', ')}`);
  }
  if (!host) fail('--host= is required — the probe host URL the device can reach over the LAN');
  if (platform === 'android' && !serial)
    fail('--device-serial= is required for --platform=android');

  // The probe host proxies everything but the instrumented HTML to the real
  // preview, so the build the device will load is checkable from here — and until
  // it was, only the desktop runners verified a build at all. A native export
  // written after the preview started reached device cells unchallenged.
  await assertServedBuildIsFresh(host, { allowForeignBuild });

  const runLabel = label ?? `${platform}-${brush}-${orientation.toLowerCase()}-${theme}`;
  const nonce = `${runLabel}-${process.pid}-${Math.round(performance.now())}`;
  // Only a page opened at a URL we chose can prove which run it belongs to. A
  // native run cannot: the WebView loads the app's own `server.url`.
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
  const driver =
    platform === 'android'
      ? androidDriver({ serial, pageUrl, orientation, nativeApp, cdpPort })
      : iosDriver({ wdaUrl, pageUrl, nativeApp });

  await driver.openPage();

  // A launch does not always produce the page it asked for. Chrome restores the
  // tabs a previous cell left behind, each re-runs the bootstrap, and with the
  // identity guard in place those stand down correctly — but on a landscape cell
  // the intended page then failed to appear at all, six leftovers standing down
  // and no capture. Re-issuing the launch costs one settle when it was not
  // needed, and is the difference between a banked cell and a P1 when it was.
  let ready = await pollFor(
    async () => (await probeState(host)).ready,
    PROBE_READY_OPEN_TIMEOUT_MS
  );
  if (!ready) {
    console.log('no page reported ready — re-opening');
    await driver.openPage();
    ready = await pollFor(async () => (await probeState(host)).ready, PROBE_READY_TIMEOUT_MS);
  }
  if (!ready) fail('the page never reported the probe ready');
  if (ready.committed && ready.committed !== brush) {
    fail(`the engine is on ${ready.committed}, not ${brush}`);
  }
  // The device rotates, the page does not always agree. Trusting the request
  // rather than the page is how a landscape capture gets filed as portrait.
  // Theme used to be recorded from the REQUEST, so a light-labelled artifact
  // could be written while the page stayed dark. It is now set through the
  // product's Settings controls and read back before anything is measured.
  const themeProblem = readinessThemeProblem(ready, theme);
  if (themeProblem) fail(themeProblem);
  if (ready.geometry?.orientation && ready.geometry.orientation !== orientation) {
    fail(`the page is ${ready.geometry.orientation}, not the requested ${orientation}`);
  }

  const geometry = await driver.boundsFrom(ready.geometry);
  console.log(`canvas ${JSON.stringify(geometry.bounds)} scale ${geometry.densityScale}`);

  await driver.dispatch(geometry, repeats);
  await sleep(GESTURE_TAIL_MS);
  const pulsed = await probeState(host).catch(() => null);
  const inputProblem = zeroInputProblem(pulsed?.pulse);
  if (inputProblem) fail(inputProblem);
  await control(host, { finish: true });

  const uploaded = await pollFor(
    async () => ((await probeState(host)).hasReport ? true : null),
    REPORT_TIMEOUT_MS
  );
  if (!uploaded) {
    const finalState = await probeState(host).catch(() => null);
    const seen = finalState?.pulse ? ` (page last pulsed ${finalState.pulse.events} events)` : '';
    fail(`no report was uploaded${seen}`);
  }

  const payload = JSON.parse(readFileSync(join(reportDir, `${runLabel}.json`), 'utf8'));
  if (payload.error) fail(payload.error);
  if ((payload.report?.events ?? []).length === 0) {
    fail('the capture recorded no pointer events — the gesture never reached the canvas');
  }

  // Defence in depth for the same failure the bootstrap now refuses at the page:
  // the report says which URL produced it, and that URL carries the nonce this
  // run opened. A report whose URL names another cell is another cell's data
  // however plausible its shape.
  const capturedAt = new URL(payload.report?.meta?.url ?? 'http://invalid/').searchParams.get(
    'probe'
  );
  if (requirePageIdentity && capturedAt !== nonce) {
    fail(
      `the report came from a page opened for ${capturedAt ?? 'an unknown run'}, not ${nonce} — ` +
        'a restored tab that adopted this plan is the usual cause'
    );
  }

  const summaries = summarizeRun(payload.report);
  const drawing = scoreDrawingRun(summaries.phases);
  const fidelity = inputFidelity(
    summaries.phases?.[0]?.input ?? {},
    captureRuntime(platform, nativeApp)
  );

  console.log(
    `\n${runLabel} — observed frame beat: ` +
      `${describeRefreshRegime(refreshRegimeVerdict(summaries.intervalMs))}`
  );
  console.table(pacingRows(summaries.phases));
  console.table(inputRows(summaries.phases));
  console.table(engineRows(summaries.phases));
  console.table(starvationRows(summaries.phases));
  console.table(drawingGateRows(drawing));
  console.log(
    `\nFidelity: ${fidelity.passed ? 'PASS' : 'FAIL'} (${fidelity.runtime}) · ` +
      `${JSON.stringify(fidelity.checks)}`
  );
  if (!fidelity.passed) console.log(`  not passing: ${describeFidelityFailures(fidelity)}`);

  // Orientation and theme are recorded because the performance matrix validates
  // a capture against the mode it was filed under and refuses one that cannot
  // prove which mode it measured.
  const artifact = drivenCaptureArtifact({
    runLabel,
    platform,
    brush,
    orientation,
    theme,
    ready,
    nativeApp,
    requirePageIdentity,
    fidelity,
    drawing,
    summaries,
    payload,
  });

  if (output) {
    mkdirSync(dirname(join(ROOT, output)), { recursive: true });
    writeFileSync(join(ROOT, output), JSON.stringify(artifact, null, 2));
    console.log(`Wrote ${output}`);
  }
  return artifact;
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    const artifact = await captureDeviceFrames();
    if (!artifact.fidelity.passed) {
      fail('The capture failed the trusted-input fidelity gate; do not score it.');
    }
  });
}
