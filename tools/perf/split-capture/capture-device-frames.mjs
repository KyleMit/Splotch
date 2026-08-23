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
import { argFlag, capture, fail, isMain, ROOT, runMain, sleep } from '../../lib/proc.mjs';
import { assertServedBuildIsFresh } from '../lib/profile-preview.mjs';
import {
  inputFidelity,
  nativeCanvasBounds,
  trustedGestureActions,
} from '../ios/capture-xcuitest-screen.mjs';
import { drawingGateRows, scoreDrawingRun } from '../lib/drawing-gates.mjs';
import {
  engineRows,
  inputRows,
  pacingRows,
  starvationRows,
  summarizeRun,
} from '../lib/real-screen-stats.mjs';
import {
  androidGestureInstructions,
  androidPageLaunchSteps,
  swipeArgs,
} from './lib/android-input.mjs';

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
const REPORT_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 1_000;
// After the last pointerUp the engine still has queued raster work; ending the
// phase immediately would clip it out of the capture.
const GESTURE_TAIL_MS = 1_200;
const WDA_SESSION_ATTEMPTS = 3;
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

function androidDriver({ serial, pageUrl, orientation }) {
  return {
    async openPage() {
      const settles = {
        appStop: APP_STOP_SETTLE_MS,
        rotation: ROTATION_SETTLE_MS,
        page: PAGE_SETTLE_MS,
      };
      for (const step of androidPageLaunchSteps(orientation, pageUrl)) {
        adb(serial, step.args);
        if (step.settle) await sleep(settles[step.settle]);
      }
    },
    boundsFrom(geometry) {
      return {
        bounds: geometry.canvas,
        densityScale: geometry.dpr,
        offset: { x: geometry.screenX * geometry.dpr, y: geometry.screenY * geometry.dpr },
      };
    },
    async dispatch({ bounds, densityScale, offset }, repeats) {
      const instructions = androidGestureInstructions(trustedGestureActions(bounds, repeats, 0), {
        densityScale,
        offset,
      });
      for (const instruction of instructions) {
        if (instruction.kind === 'pause') await sleep(instruction.durationMs);
        else adb(serial, swipeArgs(instruction));
      }
    },
  };
}

function iosDriver({ wdaUrl, pageUrl }) {
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
            alwaysMatch: { bundleId: 'com.apple.mobilesafari', shouldWaitForQuiescence: false },
          },
        });
        sessionId = created.sessionId;
        await sleep(WDA_SESSION_SETTLE_MS);
        const opened = await wda(wdaUrl, 'POST', `/session/${sessionId}/url`, {
          url: pageUrl,
        }).then(
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

export async function captureDeviceFrames({
  platform = argFlag('platform', 'android'),
  brush = argFlag('brush', 'pen'),
  orientation = argFlag('orientation', 'PORTRAIT'),
  theme = argFlag('theme', 'light'),
  repeats = Number(argFlag('gesture-repeats', 10)),
  host = argFlag('host'),
  serial = argFlag('device-serial'),
  wdaUrl = argFlag('wda-url', 'http://127.0.0.1:8100'),
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
  if (!host) fail('--host= is required — the probe host URL the device can reach over the LAN');
  if (platform === 'android' && !serial)
    fail('--device-serial= is required for --platform=android');

  // The probe host proxies everything but the instrumented HTML to the real
  // preview, so the build the device will load is checkable from here — and until
  // it was, only the desktop runners verified a build at all. A native export
  // written after the preview started reached device cells unchallenged.
  await assertServedBuildIsFresh(host, { allowForeignBuild: allowForeignBuild !== undefined });

  const runLabel = label ?? `${platform}-${brush}-${orientation.toLowerCase()}-${theme}`;
  const nonce = `${runLabel}-${process.pid}-${Math.round(performance.now())}`;
  await control(host, {
    brush,
    label: runLabel,
    nonce,
    contactMs: CONTACT_BANK_MS,
    finish: false,
    reset: true,
  });

  const pageUrl = `${host}/?probe=${encodeURIComponent(nonce)}`;
  const driver =
    platform === 'android'
      ? androidDriver({ serial, pageUrl, orientation })
      : iosDriver({ wdaUrl, pageUrl });

  await driver.openPage();

  const ready = await pollFor(async () => (await probeState(host)).ready, PROBE_READY_TIMEOUT_MS);
  if (!ready) fail('the page never reported the probe ready');
  if (ready.committed && ready.committed !== brush) {
    fail(`the engine is on ${ready.committed}, not ${brush}`);
  }
  // The device rotates, the page does not always agree. Trusting the request
  // rather than the page is how a landscape capture gets filed as portrait.
  if (ready.geometry?.orientation && ready.geometry.orientation !== orientation) {
    fail(`the page is ${ready.geometry.orientation}, not the requested ${orientation}`);
  }

  const geometry = await driver.boundsFrom(ready.geometry);
  console.log(`canvas ${JSON.stringify(geometry.bounds)} scale ${geometry.densityScale}`);

  await driver.dispatch(geometry, repeats);
  await sleep(GESTURE_TAIL_MS);
  await control(host, { finish: true });

  const uploaded = await pollFor(
    async () => ((await probeState(host)).hasReport ? true : null),
    REPORT_TIMEOUT_MS
  );
  if (!uploaded) fail('no report was uploaded');

  const payload = JSON.parse(readFileSync(join(reportDir, `${runLabel}.json`), 'utf8'));
  if (payload.error) fail(payload.error);
  if ((payload.report?.events ?? []).length === 0) {
    fail('the capture recorded no pointer events — the gesture never reached the canvas');
  }

  const summaries = summarizeRun(payload.report);
  const drawing = scoreDrawingRun(summaries.phases);
  const fidelity = inputFidelity(summaries.phases?.[0]?.input ?? {});

  console.log(`\n${runLabel} — observed frame beat: ${summaries.intervalMs} ms`);
  console.table(pacingRows(summaries.phases));
  console.table(inputRows(summaries.phases));
  console.table(engineRows(summaries.phases));
  console.table(starvationRows(summaries.phases));
  console.table(drawingGateRows(drawing));
  console.log(
    `\nFidelity: ${fidelity.passed ? 'PASS' : 'FAIL'} · ${JSON.stringify(fidelity.checks)}`
  );

  // Orientation and theme are recorded because the performance matrix validates
  // a capture against the mode it was filed under and refuses one that cannot
  // prove which mode it measured.
  const artifact = {
    label: runLabel,
    platform,
    brush,
    orientation,
    theme,
    transport: 'split-input-measurement',
    fidelity,
    drawing,
    summaries,
    report: payload.report,
    topology: payload.topology ?? null,
  };
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
