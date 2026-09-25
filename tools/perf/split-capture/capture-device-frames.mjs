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
import { mkdirSync, writeFileSync } from 'node:fs';
import { mintProbeNonce } from '../lib/capture-attribution.mjs';
import { pollFor } from './lib/poll.mjs';
import { rethrowIfBroken } from '../lib/error-classification.mjs';
import { hostQuietRecord, sampleHostLoad } from '../lib/host-quiet.mjs';
import { dirname, isAbsolute, join } from 'node:path';
import { argFlag, fail, isMain, ROOT, runMain, sleep, tryCapture } from '../../lib/proc.mjs';
import { assertServedBuildIsFresh } from '../lib/profile-preview.mjs';
import {
  STROKES_PER_GESTURE_REPEAT,
  driveTrustedGesturePasses,
  nativeCanvasBounds,
  trustedGestureActions,
} from '../ios/capture-xcuitest-screen.mjs';
import { readinessThemeProblem } from '../lib/campaign-state.mjs';
import {
  FLOOR_CONTROL_PAGE,
  fetchAcceptedProbeReport,
  probeHostJson,
} from './lib/probe-host-protocol.mjs';
import { ANDROID_NATIVE_PACKAGE, GESTURE_REPEATS, gesturePlanFor } from '../lib/campaign-plan.mjs';
import { captureRuntime, describeFidelityFailures, inputFidelity } from '../lib/input-fidelity.mjs';
import { describeRefreshRegime, refreshRegimeVerdict } from '../lib/refresh-regime.mjs';
import { drawingGateRows, scoreDrawingRun } from '../lib/drawing-gates.mjs';
import { summarizeUndoActions, undoActionRows } from '../lib/undo-action-stats.mjs';
import { UNDO_ACTION_PAUSE_MS } from '../lib/undo-driver.mjs';
import {
  engineRows,
  inputRows,
  pacingRows,
  starvationRows,
  summarizeRun,
} from '../lib/real-screen-stats.mjs';
import {
  ANDROID_DISPLAY_INSETS_ARGS,
  androidContentOffset,
  androidForegroundPackage,
  androidGestureInstructions,
  androidOpenSteps,
  androidRotationRestoreCommands,
  androidSystemInsets,
  readAndroidRotationSettings,
  swipeArgs,
} from './lib/android-input.mjs';
import { activateChromePage, clearToolingLitter } from './lib/chrome-tabs.mjs';
import { PORT_ROLES } from '../lib/capture-readiness.mjs';
import { adbRunner, reverseToLocalhost } from '../lib/android-localhost-route.mjs';
import { staleServiceWorkerProblem } from '../lib/service-worker-guard.mjs';
import { reduceMotionReadinessProblem, reduceMotionSeedProblem } from '../lib/reduce-motion.mjs';
import { strokeDeliveryProblem, trustedPointerdowns } from '../lib/stroke-delivery.mjs';
import { FLOOR_CONTROL_THEME, floorControlIdentity } from './serve-floor-control.mjs';

const PLATFORMS = ['android', 'ios'];
const BRUSHES = ['pen', 'crayon', 'magic', 'eraser'];
const ORIENTATIONS = ['PORTRAIT', 'LANDSCAPE'];
// Chrome and Safari both need time to settle a cold navigation before the
// bootstrap can find a sized canvas; the probe-ready poll below is the real
// gate, this only avoids hammering it from the first millisecond.
const PAGE_SETTLE_MS = 6_000;
const APP_STOP_SETTLE_MS = 1_500;
const ROTATION_SETTLE_MS = 2_500;
const ROTATION_WINDOW_TIMEOUT_MS = 10_000;
const ROTATION_WINDOW_POLL_MS = 250;
const PROBE_READY_TIMEOUT_MS = 90_000;
// Shorter than the full budget on purpose: this is how long to wait before
// deciding the launch did not land, not how long a slow page may take.
const PROBE_READY_OPEN_TIMEOUT_MS = 30_000;
const REPORT_TIMEOUT_MS = 120_000;
const ERASER_REFILL_ACK_TIMEOUT_MS = 30_000;
// After the last pointerUp the engine still has queued raster work; ending the
// phase immediately would clip it out of the capture.
const GESTURE_TAIL_MS = 1_200;
const WDA_SESSION_ATTEMPTS = 3;
const SAFARI_BUNDLE_ID = 'com.apple.mobilesafari';
export const APP_BUNDLE_ID = ANDROID_NATIVE_PACKAGE;
const WDA_SESSION_SETTLE_MS = 2_500;
const CONTACT_BANK_MS = 600_000;

// Throws where capture() would exit: once openPage has rotated the phone, a
// failed geometry read or swipe must still reach driveHandingBack's `finally`,
// and process.exit skips it. `run` is injectable only so a test can fail it.
export function adbOrThrow(serial, args, run = tryCapture) {
  const result = run('adb', ['-s', serial, ...args]);
  if (!result.ok) {
    throw new Error(`adb ${args.join(' ')} failed on ${serial}: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

async function control(host, body) {
  const response = await fetch(`${host}/__probe/control`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.json();
}

const probeState = (host) => probeHostJson(host, '/__probe/state');

export async function requestPageEraserRefill({
  host,
  nonce,
  afterStroke,
  controlPage = control,
  readState = probeState,
}) {
  const sequence = afterStroke / STROKES_PER_GESTURE_REPEAT;
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error(`invalid eraser refill boundary ${afterStroke}`);
  }
  const request = { sequence, afterStroke };
  await controlPage(host, { eraserRefillRequest: request });
  const acknowledged = await pollFor(async () => {
    const refill = (await readState(host)).refill;
    return refill?.nonce === nonce &&
      refill.request?.sequence === sequence &&
      refill.request?.afterStroke === afterStroke
      ? refill
      : null;
  }, ERASER_REFILL_ACK_TIMEOUT_MS);
  if (!acknowledged) {
    throw new Error(`the page did not acknowledge eraser refill ${sequence}`);
  }
  return acknowledged.entry;
}

export function driveSplitGesturePasses({ driver, geometry, repeats, refillBetweenPasses = null }) {
  return driveTrustedGesturePasses({
    repeats,
    perform: (count) => driver.dispatch(geometry, count),
    refillBetweenPasses,
  });
}

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

// The floor control (serve-floor-control.mjs) draws one fixed stroke on one
// light page in a browser, so a request it cannot honour would be recorded as
// if it had been measured. Eraser and undo also wait on page acknowledgements
// the floor never sends.
export function floorControlRequestProblem({ brush, theme, undoCount, nativeApp }) {
  if (nativeApp) return 'the floor control is a browser page — --native-app has no floor to open';
  if (brush !== 'pen') {
    return `the floor control draws one fixed stroke — use --brush=pen, not ${brush}`;
  }
  if (theme !== FLOOR_CONTROL_THEME) {
    return `the floor control renders only --theme=${FLOOR_CONTROL_THEME}, not ${theme}`;
  }
  if (undoCount > 0) return 'the floor control has no undo — use --undo-count=0';
  return null;
}

// Which page the host serves decides how its identity is proven. The app's
// probe host proxies a SvelteKit build, checked against this checkout's
// web/build; the floor control has no build, so the served-build guard could
// never pass against it and the floor's own served bytes are checked instead.
// Either way the returned binding is what the artifact records. The readers
// are injected so the routing is testable without a live host or a build.
export async function assertServedPageIdentity(
  host,
  { brush, theme, undoCount, allowForeignBuild, nativeApp },
  {
    readState = probeState,
    floorIdentity = floorControlIdentity,
    buildIdentity = assertServedBuildIsFresh,
  } = {}
) {
  if ((await readState(host)).page !== FLOOR_CONTROL_PAGE) {
    return {
      page: 'app',
      servedBuild: await buildIdentity(host, { allowForeignBuild, nativeApp }),
    };
  }
  const requestProblem = floorControlRequestProblem({ brush, theme, undoCount, nativeApp });
  if (requestProblem) throw new Error(requestProblem);
  const { problem, buildDigest } = await floorIdentity(host);
  if (problem) throw new Error(problem);
  // No productCommit: the floor measures no product, and the fold's build
  // identity check refuses a recorded digest without one, which keeps a floor
  // capture out of the committed matrix.
  return {
    page: FLOOR_CONTROL_PAGE,
    servedBuild: { productCommit: null, buildEntry: null, buildDigest },
  };
}

// `exec` and `activate` are injected so the wiring is testable at THIS call
// site — the openWithAdb precedent in capture-hand-input.mjs records how a
// tested chooser with an untested call site shipped the exact bug the test
// existed for. `tryRun` is the reporting runner for every step that must not
// exit the process: the tab guard's forward, and the rotation hand-back.
export function androidDriver({
  serial,
  pageUrl,
  toolingHostnames,
  orientation,
  nativeApp,
  cdpPort,
  exec = adbOrThrow,
  tryRun = tryCapture,
  activate = activateChromePage,
  litterClearer = clearToolingLitter,
}) {
  const nonce = new URL(pageUrl).searchParams.get('probe');
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
    const bound = tryRun('adb', [
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
      const cleared = await litterClearer({ cdpBase, hostnames: toolingHostnames, nonce });
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
    } finally {
      tryRun('adb', ['-s', serial, 'forward', '--remove', `tcp:${cdpPort}`]);
    }
  };
  // What the phone's rotation settings were before this capture wrote its own,
  // read once — a re-open must not adopt the capture's own writes as the prior
  // state — and cleared by `release` so the hand-back runs at most once.
  let priorRotation = null;
  return {
    async openPage() {
      const settles = {
        appStop: APP_STOP_SETTLE_MS,
        rotation: ROTATION_SETTLE_MS,
        page: PAGE_SETTLE_MS,
      };
      priorRotation ??= readAndroidRotationSettings((args) => exec(serial, args));
      for (const step of androidOpenSteps({ nativeApp, orientation, pageUrl })) {
        exec(serial, step.args);
        if (step.settle) await sleep(settles[step.settle]);
      }
      await frontRunPage('after launch');
    },
    // A phone left at user_rotation=1 hands the next reader that assumes
    // portrait the wrong geometry (issue 2272). Idempotent, and it never throws or exits: it also runs on the refusal
    // paths, where the capture's own error is the one worth reporting, and each
    // setting is put back whether or not the other one could be.
    release() {
      if (!priorRotation) return;
      const prior = priorRotation;
      priorRotation = null;
      for (const command of androidRotationRestoreCommands(prior)) {
        const restored = tryRun('adb', ['-s', serial, ...command]);
        if (!restored.ok) {
          console.warn(
            `could not ${command.slice(1).join(' ')} on ${serial} (${restored.stderr.trim()}) — ` +
              'put the rotation back by hand before the next capture'
          );
        }
      }
    },
    boundsFrom(geometry) {
      const userRotation = Number.parseInt(
        exec(serial, ['shell', 'settings', 'get', 'system', 'user_rotation']).trim(),
        10
      );
      return {
        bounds: geometry.canvas,
        densityScale: geometry.dpr,
        offset: androidContentOffset(geometry, {
          userRotation,
          systemInsets: androidSystemInsets(exec(serial, ANDROID_DISPLAY_INSETS_ARGS)),
        }),
      };
    },
    runtimeIdentity() {
      if (!nativeApp) return null;
      const nativePackage = androidForegroundPackage(
        exec(serial, ['shell', 'dumpsys', 'activity', 'activities'])
      );
      if (nativePackage !== APP_BUNDLE_ID) {
        throw new Error(
          `the foreground Android package is ${nativePackage ?? 'unknown'}, not ${APP_BUNDLE_ID}`
        );
      }
      return { nativePackage };
    },
    // Every swipe is its own down/up, so a page that recorded fewer
    // pointerdowns than this lost touches before the page saw them (issue 2229:
    // an overlay column dropped 20 of 160 while the capture passed).
    dispatchedStrokes: 0,
    // Where each swipe was meant to land, in page CSS px, for the landing rule
    // in stroke-delivery.mjs to hold against the pointerdowns the page records.
    plannedStrokeStarts: [],
    async dispatch({ bounds, densityScale, offset }, repeats) {
      await frontRunPage('before dispatch');
      const instructions = androidGestureInstructions(trustedGestureActions(bounds, repeats, 0), {
        densityScale,
        offset,
      });
      for (const instruction of instructions) {
        if (instruction.kind === 'pause') await sleep(instruction.durationMs);
        else {
          exec(serial, swipeArgs(instruction));
          this.dispatchedStrokes += 1;
          this.plannedStrokeStarts.push([
            (instruction.x0 - offset.x) / densityScale,
            (instruction.y0 - offset.y) / densityScale,
          ]);
        }
      }
    },
  };
}

// The page measures the WINDOW, while WDA's orientation is the DEVICE's, which
// the interface need not follow (an app's own orientation lock). So a rotation
// is settled when the window's own shape agrees, not the orientation.
export function windowOrientation(size) {
  return size.width > size.height ? 'LANDSCAPE' : 'PORTRAIT';
}

// The bootstrap reports its geometry once, at ready, so rotating after the page
// loads cannot help: the device turns BEFORE the page opens. Safari is navigated
// after the rotation, and the native app is launched into it from a session that
// has not started it yet. `request` and `pause` are injected so the order is
// testable at this call site, as `androidDriver`'s are.
export function iosDriver({
  wdaUrl,
  pageUrl,
  nativeApp,
  orientation,
  request = (method, path, body) => wda(wdaUrl, method, path, body),
  pause = sleep,
}) {
  let sessionId = null;
  let originalOrientation = null;
  let released = null;
  const rotate = async (target) => {
    const current = await request('GET', `/session/${sessionId}/orientation`);
    const requestedAt = Date.now();
    if (current !== target) {
      await request('POST', `/session/${sessionId}/orientation`, { orientation: target });
    }
    const settled = await pollFor(
      async () =>
        windowOrientation(await request('GET', `/session/${sessionId}/window/size`)) === target,
      ROTATION_WINDOW_TIMEOUT_MS,
      { intervalMs: ROTATION_WINDOW_POLL_MS }
    );
    if (!settled) {
      throw new Error(
        `the iPad did not turn to ${target} within ${ROTATION_WINDOW_TIMEOUT_MS} ms — ` +
          "a rotation lock (Control Centre, or the native app's Orientation setting) holds it"
      );
    }
    if (current !== target) {
      console.log(
        `iPad turned ${current} → ${target}; window agreed in ${Date.now() - requestedAt} ms`
      );
      await pause(ROTATION_SETTLE_MS);
    }
  };
  return {
    async openPage() {
      // WDA keeps at most one session and expires it on its own schedule, so a
      // stale id from a previous capture reads as "Session does not exist" on
      // the first call. Always take a fresh one, and verify it before using it.
      const status = await request('GET', '/status');
      if (status.sessionId) {
        await request('DELETE', `/session/${status.sessionId}`).catch(() => null);
      }
      for (let attempt = 0; attempt < WDA_SESSION_ATTEMPTS; attempt += 1) {
        const created = await request('POST', '/session', {
          capabilities: {
            alwaysMatch: nativeApp
              ? { shouldWaitForQuiescence: false }
              : { bundleId: SAFARI_BUNDLE_ID, shouldWaitForQuiescence: false },
          },
        });
        sessionId = created.sessionId;
        await pause(WDA_SESSION_SETTLE_MS);
        // Recorded before the turn is requested: a turn that WDA accepts and the
        // window never follows still has to be turned back by `release`.
        originalOrientation ??= await request('GET', `/session/${sessionId}/orientation`);
        await rotate(orientation);
        // The native app loads the probe host from its own configuration, so
        // there is no URL to navigate: launching it IS opening the page. WDA's
        // launch only activates an app that is already running, whose page kept
        // the geometry it reported before the turn — so it is stopped first.
        const opened = await (
          nativeApp
            ? request('POST', `/session/${sessionId}/wda/apps/terminate`, {
                bundleId: APP_BUNDLE_ID,
              }).then(() =>
                request('POST', `/session/${sessionId}/wda/apps/launch`, {
                  bundleId: APP_BUNDLE_ID,
                })
              )
            : request('POST', `/session/${sessionId}/url`, { url: pageUrl })
        ).then(
          () => true,
          () => false
        );
        if (opened) break;
        await pause(WDA_SESSION_SETTLE_MS);
      }
      await pause(PAGE_SETTLE_MS);
    },
    // Idempotent, and it never throws: it also runs on the failure paths, where
    // the capture's own error is the one worth reporting.
    release() {
      released ??= (async () => {
        if (!sessionId) return;
        if (originalOrientation && originalOrientation !== orientation) {
          await rotate(originalOrientation).catch((error) => {
            rethrowIfBroken(error);
            console.warn(
              `could not restore the iPad to ${originalOrientation} (${error.message}) — ` +
                'turn it back by hand before the next capture'
            );
          });
        }
        await request('DELETE', `/session/${sessionId}`).catch((error) => {
          rethrowIfBroken(error);
          console.warn(`could not delete WDA session ${sessionId} (${error.message})`);
        });
      })();
      return released;
    },
    async boundsFrom(geometry) {
      const size = await request('GET', `/session/${sessionId}/window/size`);
      const element = await request('POST', `/session/${sessionId}/element`, {
        using: 'class name',
        value: 'XCUIElementTypeWebView',
      }).catch((error) => {
        rethrowIfBroken(error);
        return null;
      });
      const key = 'element-6066-11e4-a52e-4f735466cecf';
      const webViewBounds = element
        ? await request(
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
      await request('POST', `/session/${sessionId}/actions`, {
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

// The absolute() guard run-campaign resolves the same flag with: join(ROOT, output)
// rebases an absolute --output under ROOT, so the runner's inspector looked for an
// artifact this child had written somewhere else — and its delete-before-retry
// removed a valid product-red artifact it could not see (session 01a049ec). Shared
// by capture-hand-input.mjs, whose write had the identical shape.
export function writeArtifactFile(output, artifact) {
  const path = isAbsolute(output) ? output : join(ROOT, output);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(artifact, null, 2));
  return path;
}

// The artifact envelope, as a pure value. Extracted so the fields a later reader
// TRUSTS can be asserted without a device: `observedTheme` had no test, and
// deleting the assignment left the suite green while recreating the exact gap it
// closes — the handshake knew the theme and the saved file could not prove it.
export function drivenCaptureArtifact({
  hostQuiet = null,
  runLabel,
  platform,
  brush,
  orientation,
  theme,
  gestureRepeats,
  gesturePlan,
  undoCount,
  undoPauseMs,
  ready,
  nativeApp,
  nativePackage = null,
  requirePageIdentity = true,
  page = 'app',
  servedBuild = null,
  reduceMotion = null,
  dispatchedStrokes = null,
  plannedStrokeStarts = null,
  fidelity,
  drawing,
  undo,
  summaries,
  payload,
}) {
  return {
    label: runLabel,
    // FLOOR_CONTROL_PAGE marks a diagnostic of the browser's own floor
    // (ADR-0136), never a cell of the product; campaign acceptance, evidence
    // promotion, and the matrix fold all refuse it.
    page,
    platform,
    brush,
    orientation,
    theme,
    // What the served-build guard proved at capture time, kept instead of
    // discarded (issue: a refuted experimental arm was promoted under the
    // baseline's label, and no artifact could contradict it). `productCommit`
    // is the checkout's HEAD, recorded only when the served bytes were verified
    // as this checkout's build; a --allow-foreign-build capture records null
    // there but still carries the served digest, so same-mode agreement stays
    // checkable. Fold-time enforcement lives in campaign-sources.
    productCommit: servedBuild?.productCommit ?? null,
    buildEntry: servedBuild?.buildEntry ?? null,
    buildDigest: servedBuild?.buildDigest ?? null,
    // The repeat count decides the cell's first-touch-to-repeat mix, so cells
    // captured at different counts are not comparable; campaign acceptance
    // refuses a banked cell recording a count other than its contract (issue
    // 1297).
    gestureRepeats,
    // How the repeats were fed ink — `gesturePlanFor` owns the vocabulary and
    // the comparability boundary (issue 1292). (A 'per-repeat-offsets' value
    // existed briefly inside the unmerged stack and never captured a cell.)
    gesturePlan: gesturePlan ?? null,
    undoCount,
    undoPauseMs,
    // The verified eraser-fill evidence (issue 1302); null for other brushes
    // and for captures predating verification.
    eraserFill: ready?.eraserFill ?? null,
    // Per-pass refill evidence (issue 1292): one entry per between-pass refill,
    // each carrying its own verification result.
    eraserRefills: payload?.eraserRefills ?? null,
    // What the PAGE reported, read back at readiness. `theme` alone is a request,
    // and `report.meta.theme` cannot answer either: the product stores the
    // loosest preference that renders an appearance, so choosing the theme the OS
    // already shows clears the override and leaves that field null. An artifact
    // has to be able to prove which theme it measured without re-deriving it.
    observedTheme: ready?.resolvedTheme ?? null,
    // The Reduce Motion seed this run asked for (null: left as the origin had
    // it) beside what the page's boot script resolved — the same
    // request-versus-observation split as the theme.
    requestedReduceMotion: reduceMotion,
    observedReducedMotion: ready?.reducedMotion ?? null,
    // Android only: one per `adb shell input swipe`, each a separate
    // down/up. Null where the transport does not count them.
    dispatchedStrokes,
    // Android only: each swipe's planned start beside each trusted pointerdown
    // the page recorded, both in page CSS px and in dispatch order. Null where
    // the transport plans no screen coordinates of its own, and on the floor
    // control, whose page does not record positions.
    strokeLanding:
      plannedStrokeStarts && page !== FLOOR_CONTROL_PAGE
        ? { planned: plannedStrokeStarts, recorded: payload?.pointerdownPositions ?? null }
        : null,
    // 'blocked' on a secure origin, 'unsupported' on an insecure one; null
    // predates the guard. A 'stale-worker' page is refused before this.
    serviceWorkerRegistration: ready?.serviceWorkerRegistration ?? null,
    nativeApp,
    nativePackage,
    // A native run reaches the instrumented page over the LAN through the app's
    // `server.url`, so its assets are not the bundled ones. Recorded because the
    // difference is invisible in the numbers and material to what the cell means.
    pageDelivery: nativeApp ? 'remote-probe-host' : 'browser',
    // Whether this capture could prove the page it measured was the one this run
    // opened. A native WebView loads a build-time URL, so it cannot — recorded
    // rather than assumed, because the guarantee genuinely differs by transport.
    pageIdentity: requirePageIdentity ? 'proven-by-url' : 'unprovable',
    transport: 'split-input-measurement',
    // The host drives the input, so host business is a measured variable
    // (issue 1304): two raw load samples bracketing the capture; readers
    // re-derive the verdict from them (lib/host-quiet.mjs).
    hostQuiet,
    fidelity,
    drawing,
    undo,
    undoActions: payload?.undoActions ?? [],
    historyBeforeUndo: payload?.historyBeforeUndo ?? null,
    historyAfterUndo: payload?.historyAfterUndo ?? null,
    undoVisual: payload?.undoVisual ?? null,
    summaries,
    report: payload?.report,
    topology: payload?.topology ?? null,
  };
}

// Everything that needs the device: from opening the page to the accepted
// report. `refuse` hands the device back before exiting.
async function driveOpenedCapture({
  driver,
  host,
  brush,
  theme,
  orientation,
  nonce,
  repeats,
  reduceMotion,
  refuse,
}) {
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
  if (!ready) await refuse('the page never reported the probe ready');
  if (ready.committed && ready.committed !== brush) {
    await refuse(`the engine is on ${ready.committed}, not ${brush}`);
  }
  // The device rotates, the page does not always agree. Trusting the request
  // rather than the page is how a landscape capture gets filed as portrait.
  // Theme used to be recorded from the REQUEST, so a light-labelled artifact
  // could be written while the page stayed dark. It is now set through the
  // product's Settings controls and read back before anything is measured.
  const themeProblem = readinessThemeProblem(ready, theme);
  if (themeProblem) await refuse(themeProblem);
  const workerProblem = staleServiceWorkerProblem(ready);
  if (workerProblem) await refuse(workerProblem);
  const motionProblem = reduceMotionReadinessProblem(ready, reduceMotion);
  if (motionProblem) await refuse(motionProblem);
  if (ready.geometry?.orientation && ready.geometry.orientation !== orientation) {
    await refuse(`the page is ${ready.geometry.orientation}, not the requested ${orientation}`);
  }

  const geometry = await driver.boundsFrom(ready.geometry);
  const runtimeIdentity = await driver.runtimeIdentity?.();
  console.log(`canvas ${JSON.stringify(geometry.bounds)} scale ${geometry.densityScale}`);

  await driveSplitGesturePasses({
    driver,
    geometry,
    repeats,
    refillBetweenPasses:
      brush === 'eraser'
        ? (afterStroke) => requestPageEraserRefill({ host, nonce, afterStroke })
        : null,
  });
  await sleep(GESTURE_TAIL_MS);
  const pulsed = await probeState(host).catch((error) => {
    rethrowIfBroken(error);
    return null;
  });
  const inputProblem = zeroInputProblem(pulsed?.pulse);
  if (inputProblem) await refuse(inputProblem);
  await control(host, { finish: true });

  const uploaded = await pollFor(
    async () => ((await probeState(host)).hasReport ? true : null),
    REPORT_TIMEOUT_MS
  );
  if (!uploaded) {
    const finalState = await probeState(host).catch(() => null);
    const seen = finalState?.pulse ? ` (page last pulsed ${finalState.pulse.events} events)` : '';
    await refuse(`no report was uploaded${seen}`);
  }

  // Read the same nonce-gated in-memory payload whose `hasReport` flag ended the
  // poll. A caller-local report directory can contain a same-label artifact from
  // another host or run, while the live host has already accepted the right one.
  const payload = await fetchAcceptedProbeReport(host);
  return { ready, runtimeIdentity, payload };
}

// The device is handed back — the iPad turned to the orientation it started
// in, the phone's rotation settings put back as they were found — as soon as
// the report is in hand, and on every refusal before that: `fail` exits the
// process, so no `finally` would run in its place. `exit` is injectable only so
// a test can prove the refusal path hands the device back.
export function driveHandingBack(driver, drive, exit = fail) {
  const refuse = async (message) => {
    await driver.release();
    exit(message);
  };
  return drive(refuse).finally(() => driver.release());
}

export async function captureDeviceFrames({
  platform = argFlag('platform', 'android'),
  brush = argFlag('brush', 'pen'),
  orientation = argFlag('orientation', 'PORTRAIT'),
  theme = argFlag('theme', 'light'),
  repeats = Number(argFlag('gesture-repeats', GESTURE_REPEATS)),
  undoCount = Number(argFlag('undo-count', '0')),
  undoPauseMs = Number(argFlag('undo-pause-ms', String(UNDO_ACTION_PAUSE_MS))),
  host = argFlag('host'),
  serial = argFlag('device-serial'),
  cdpPort = parsePositivePort(argFlag('cdp-port', PORT_ROLES.androidCdp.port), 'cdp-port'),
  wdaUrl = argFlag('wda-url', 'http://127.0.0.1:8100'),
  label = argFlag('label'),
  // Without --output the composed artifact (fidelity, summaries, provenance) is
  // printed and DISCARDED. The probe host may archive its accepted raw report,
  // but a capture meant to be banked or promoted must pass --output.
  output = argFlag('output'),
  allowForeignBuild = process.argv.includes('--allow-foreign-build'),
  // `argFlag` only matches `--name=value`, so a BARE flag is invisible to it and
  // reads as absent. A capture that silently ran against Safari while reporting a
  // WebView runtime is the failure this shape produces.
  nativeApp = process.argv.includes('--native-app'),
  reduceMotion = argFlag('reduce-motion') ?? null,
} = {}) {
  const reduceMotionProblem = reduceMotionSeedProblem(reduceMotion);
  if (reduceMotionProblem) fail(reduceMotionProblem);
  if (!PLATFORMS.includes(platform)) fail(`--platform must be one of ${PLATFORMS.join(', ')}`);
  if (!BRUSHES.includes(brush)) fail(`--brush must be one of ${BRUSHES.join(', ')}`);
  if (!Number.isSafeInteger(repeats) || repeats < 1) {
    fail('--gesture-repeats must be a positive integer');
  }
  if (!Number.isSafeInteger(undoCount) || undoCount < 0) {
    fail('--undo-count must be a non-negative integer');
  }
  if (!Number.isSafeInteger(undoPauseMs) || undoPauseMs < 0) {
    fail('--undo-pause-ms must be a non-negative integer');
  }
  if (undoCount > 0 && brush !== 'pen') {
    fail('--undo-count is supported only with --brush=pen');
  }
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
  const { page, servedBuild } = await assertServedPageIdentity(host, {
    brush,
    theme,
    undoCount,
    allowForeignBuild,
    nativeApp,
  });
  if (page === FLOOR_CONTROL_PAGE && reduceMotion) {
    fail('the floor control has no Reduce Motion setting — omit --reduce-motion');
  }

  const runLabel = label ?? `${platform}-${brush}-${orientation.toLowerCase()}-${theme}`;
  const hostLoadStart = sampleHostLoad();
  const nonce = mintProbeNonce(runLabel);
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
    undoCount,
    undoPauseMs,
    // Always sent: the host merges each control into the standing plan, so an
    // omitted key would inherit the previous capture's seed.
    reduceMotion,
    eraserRefillRequest: null,
    finish: false,
    reset: true,
  });

  const pageUrl = `${host}/?probe=${encodeURIComponent(nonce)}`;
  // Android Chrome loads the probe host at localhost; the iPad keeps the LAN
  // address, and a native WebView loads its own `server.url`.
  const androidPage =
    platform === 'android' && !nativeApp
      ? await reverseToLocalhost(pageUrl, adbRunner(serial))
      : { url: pageUrl, toolingHostnames: [new URL(pageUrl).hostname], release: () => {} };
  const driver =
    platform === 'android'
      ? androidDriver({
          serial,
          pageUrl: androidPage.url,
          toolingHostnames: androidPage.toolingHostnames,
          orientation,
          nativeApp,
          cdpPort,
        })
      : iosDriver({ wdaUrl, pageUrl, nativeApp, orientation });

  const { ready, runtimeIdentity, payload } = await driveHandingBack(driver, (refuse) =>
    driveOpenedCapture({
      driver,
      host,
      brush,
      theme,
      orientation,
      nonce,
      repeats,
      reduceMotion,
      refuse,
    })
  );
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
  const undo =
    undoCount > 0 ? summarizeUndoActions(payload.undoActions ?? [], payload.report.frames) : null;
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
  if (undo) {
    console.log('\nUndo response');
    console.table(undoActionRows(undo));
  }
  console.log(
    `\nFidelity: ${fidelity.passed ? 'PASS' : 'FAIL'} (${fidelity.runtime}) · ` +
      `${JSON.stringify(fidelity.checks)}`
  );
  if (!fidelity.passed) console.log(`  not passing: ${describeFidelityFailures(fidelity)}`);

  // Orientation and theme are recorded because the performance matrix validates
  // a capture against the mode it was filed under and refuses one that cannot
  // prove which mode it measured.
  const artifact = drivenCaptureArtifact({
    hostQuiet: hostQuietRecord(hostLoadStart, sampleHostLoad()),
    runLabel,
    platform,
    brush,
    orientation,
    theme,
    gestureRepeats: repeats,
    gesturePlan: gesturePlanFor(brush),
    undoCount,
    undoPauseMs,
    ready,
    nativeApp,
    nativePackage: runtimeIdentity?.nativePackage ?? null,
    requirePageIdentity,
    page,
    servedBuild,
    reduceMotion,
    dispatchedStrokes: driver.dispatchedStrokes ?? null,
    plannedStrokeStarts: driver.plannedStrokeStarts ?? null,
    fidelity,
    drawing,
    undo,
    summaries,
    payload,
  });

  if (artifact.dispatchedStrokes !== null) {
    console.log(
      `Strokes: ${trustedPointerdowns(artifact.report)} pointerdowns for ` +
        `${artifact.dispatchedStrokes} dispatched`
    );
  }

  androidPage.release();
  if (output) {
    console.log(`Wrote ${writeArtifactFile(output, artifact)}`);
  }
  return artifact;
}

// Every reason the written artifact must not be scored. The artifact is still
// written first: a refused capture is the evidence of what went wrong.
export function captureRefusal(artifact) {
  const problems = [];
  const deliveryProblem = strokeDeliveryProblem(artifact);
  if (deliveryProblem) problems.push(`Stroke delivery failed: ${deliveryProblem}.`);
  if (!artifact.fidelity?.passed) {
    problems.push('The capture failed the trusted-input fidelity gate.');
  }
  return problems.length ? `${problems.join(' ')} Do not score it.` : null;
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    const refusal = captureRefusal(await captureDeviceFrames());
    if (refusal) fail(refusal);
  });
}
