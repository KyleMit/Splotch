import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT, fail, isMain, pollUntil, runMain, sleep } from '../../lib/proc.mjs';
import {
  ERASER_FILL_BACKING_TIMEOUT_MS,
  eraserFillFunctionSource,
  eraserRefillArming,
  eraserRefillFunctionSource,
} from '../lib/eraser-fill.mjs';
import { CAMPAIGN_TARGETS, NATIVE_TRANSPORT, gesturePlanFor } from '../lib/campaign-plan.mjs';
import { parsePerfArgs } from '../lib/cli-args.mjs';
import { drawingGateRows, scoreDrawingRun } from '../lib/drawing-gates.mjs';
import { captureRuntime, inputFidelity } from '../lib/input-fidelity.mjs';
import {
  describeRefreshRegime,
  refreshRegimeRefusal,
  refreshRegimeVerdict,
  soleExpectedRegimeForRuntime,
} from '../lib/refresh-regime.mjs';
import { probeConfigScript } from './capture-webkit-frames.mjs';
import { ensurePreviewServer, resolveDeviceUrl } from '../lib/profile-device-session.mjs';
import { profilePath } from '../lib/profile-paths.mjs';
import {
  engineRows,
  inputRows,
  pacingRows,
  starvationRows,
  summarizeRun,
} from '../lib/real-screen-stats.mjs';
import { summarizeUndoActions, undoActionRows } from '../lib/undo-action-stats.mjs';
import { rethrowIfBroken } from '../lib/error-classification.mjs';
import { runtimeUaProblem } from '../split-capture/capture-hand-input.mjs';
import {
  bundledReportPayloadProblem,
  pullBundledReportFromDevice,
} from './bundled-report-channel.mjs';
import {
  EXPAND_CONTROLS_SOURCE,
  UNDO_ACTION_PAUSE_MS,
  UNDO_ACTION_SETTLE_MS,
  UNDO_BUTTON_READY_POLL_MS,
  UNDO_BUTTON_READY_SOURCE,
  UNDO_BUTTON_READY_TIMEOUT_MS,
  assertUndoAction,
  undoActionPromiseSource,
} from '../lib/undo-driver.mjs';
import {
  PLATFORM_OWNS_ROTATION,
  ensureCampaignTheme,
  parseCampaignOrientation,
  parseCampaignTheme,
  readResolvedTheme,
  setNativeRotationLock,
} from '../lib/campaign-state.mjs';

const APP_PATH = '/';
const PROBE_FILE = join(ROOT, 'tools', 'perf', 'probes', 'real-screen-probe.js');
const DEFAULT_APPIUM_URL = 'http://127.0.0.1:4723';
const DEFAULT_XCODE_CONFIG = join(ROOT, 'ios', 'local.xcconfig');
const DEFAULT_WDA_BUNDLE_ID = 'art.splotch.WebDriverAgentRunner';
// The bundle a native capture attaches to is the one Capacitor builds, so it is
// read from that config rather than restated here.
const NATIVE_APP_BUNDLE_ID = JSON.parse(
  readFileSync(join(ROOT, 'capacitor.config.json'), 'utf8')
).appId;
const DEFAULT_NATIVE_WEBVIEW_CLASS = 'XCUIElementTypeWebView';
const WEBVIEW_READY_TIMEOUT_MS = 30_000;
const WEBVIEW_READY_POLL_MS = 250;
const SCRIPT_TIMEOUT_MS = 30_000;
const WDA_LAUNCH_TIMEOUT_MS = 180_000;
const WDA_STARTUP_RETRIES = 1;
const PROBE_CONTACT_BUDGET_MS = 60_000;
const AFTER_GESTURE_SETTLE_MS = 500;
const TABLE_CHUNK_ROWS = 2_000;
const HAND_COUNTDOWN_SECONDS = 5;
const HAND_DEFAULT_SECONDS = 20;
export const BORROWED_SESSION_CAPABILITIES_ERROR =
  '--session-id requires --capabilities-file so borrowed-session artifacts retain target provenance';
const BRUSH_SELECT_TIMEOUT_MS = 10_000;
const ROTATION_SETTLE_TIMEOUT_MS = 10_000;
const INSTALL_DISMISSED_STORAGE_KEY = 'splotch-install-dismissed';
export const BRUSH_BUTTON_BY_MODE = {
  pen: '#penBrushButton',
  crayon: '#crayonBrushButton',
  magic: '#magicBrushButton',
  eraser: '#eraserButton',
};

// One interpolated native move emits digitizer-like samples without making WDA
// serialize hundreds of tiny action commands.
const LONG_STROKE_DURATION_MS = 2_000;
const LONG_STROKE_SEGMENTS = 4;
const LONG_STROKE_SEEDS = [0.2, 0.7];
const LONG_STROKE_WAVES = 3;
const LONG_STROKE_PAUSE_MS = 120;
const SHORT_STROKE_DURATION_MS = 240;
const SHORT_STROKE_PAUSE_MS = 90;
const SHORT_STROKE_X_PX = 45;
const SHORT_STROKE_Y_PX = 70;
const SHORT_STROKE_ORIGINS = [
  [0.18, 0.2],
  [0.35, 0.32],
  [0.53, 0.43],
  [0.7, 0.55],
  [0.24, 0.67],
  [0.42, 0.26],
  [0.59, 0.38],
  [0.76, 0.5],
];
// The eraser keeps this fixed geometry too, on purpose. The first cut of issue
// 1292 offset each repeat so later passes would cross fresh ink; review round
// 2's measurement retired the whole approach: even the optimal placement
// schedule (searched numerically over rank-1 lattices and continuous Kronecker
// generators against the exact parallel-lane metric) attains a 7 px minimum
// lane distance against a 16 px eraser on a 700x300 landscape canvas, and the
// canvas SATURATES by pass 5 — fresh-path fractions 100/55/10/20/7/0/0/0/0/0%.
// Ten identical-work passes cannot stay fresh in that geometry no matter where
// the strokes go. Fresh ink comes from refilling the tiles between passes
// instead (eraser-fill.mjs), which also restores identical geometry across
// brushes.
export const STROKES_PER_GESTURE_REPEAT = LONG_STROKE_SEEDS.length + SHORT_STROKE_ORIGINS.length;

function sanitizeLabel(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

export function nativeCanvasBounds({
  webGeometry,
  webViewBounds,
  nativeWindow,
  includeBrowserChrome = true,
}) {
  const scale = webViewBounds.width / webGeometry.viewport.width;
  // The native app's viewport-height deficit against the window must NOT be
  // added here the way Safari's browser chrome is: measured on-device (issue
  // 1237), the WKWebView deficit sits at the TOP after an in-session rotation
  // to portrait (32px, taps land that far above their web target) but at the
  // BOTTOM in landscape (20px, where uncorrected taps land true) — so a blanket
  // top-side correction re-aims working landscape taps wrong. Until the
  // per-orientation inset is measurable, native taps stay uncorrected and rely
  // on iOS touch-target snapping plus scribbleTap honoring it.
  const browserChromeHeight = includeBrowserChrome
    ? Math.max(0, nativeWindow.height - webGeometry.viewport.height * scale)
    : 0;
  return {
    x: webViewBounds.x + webGeometry.canvas.x * scale,
    y: webViewBounds.y + browserChromeHeight + webGeometry.canvas.y * scale,
    width: webGeometry.canvas.width * scale,
    height: webGeometry.canvas.height * scale,
  };
}

function addLongStroke(actions, bounds, seed) {
  actions.push({
    type: 'pointerMove',
    duration: 0,
    origin: 'viewport',
    x: bounds.x + bounds.width * 0.12,
    y: bounds.y + bounds.height * (0.28 + seed * 0.18),
  });
  actions.push({ type: 'pointerDown', button: 0 });
  for (let index = 1; index <= LONG_STROKE_SEGMENTS; index++) {
    const progress = index / LONG_STROKE_SEGMENTS;
    actions.push({
      type: 'pointerMove',
      duration: LONG_STROKE_DURATION_MS / LONG_STROKE_SEGMENTS,
      origin: 'viewport',
      x: bounds.x + bounds.width * (0.12 + progress * 0.76),
      y:
        bounds.y +
        bounds.height *
          (0.35 + seed * 0.15 + Math.sin(progress * Math.PI * 2 * LONG_STROKE_WAVES + seed) * 0.18),
    });
  }
  actions.push({ type: 'pointerUp', button: 0 });
  actions.push({ type: 'pause', duration: LONG_STROKE_PAUSE_MS });
}

function addShortStroke(actions, bounds, [xFraction, yFraction]) {
  const x = bounds.x + bounds.width * xFraction;
  const y = bounds.y + bounds.height * yFraction;
  actions.push({ type: 'pointerMove', duration: 0, origin: 'viewport', x, y });
  actions.push({ type: 'pointerDown', button: 0 });
  actions.push({
    type: 'pointerMove',
    duration: SHORT_STROKE_DURATION_MS,
    origin: 'viewport',
    x: x + SHORT_STROKE_X_PX,
    y: y + SHORT_STROKE_Y_PX,
  });
  actions.push({ type: 'pointerUp', button: 0 });
  actions.push({ type: 'pause', duration: SHORT_STROKE_PAUSE_MS });
}

export function trustedGestureActions(bounds, repeats = 1, repeatPauseMs = 0) {
  const actions = [];
  for (let repeat = 0; repeat < repeats; repeat++) {
    if (repeat > 0 && repeatPauseMs > 0) {
      actions.push({ type: 'pause', duration: repeatPauseMs });
    }
    for (const seed of LONG_STROKE_SEEDS) addLongStroke(actions, bounds, seed);
    for (const origin of SHORT_STROKE_ORIGINS) addShortStroke(actions, bounds, origin);
  }
  return actions;
}

export function appiumCapabilities({
  deviceId,
  xcodeConfigFile,
  wdaBundleId,
  allowProvisioning = false,
  nativeApp = false,
}) {
  return {
    // A native capture attaches to the app's own WebView, so it must open the app.
    // Asking for Safari here still produces a session and still switches to a web
    // context — Safari's, sitting on about:blank — and the run only fails a couple
    // of minutes later with "never showed a sized #drawingCanvas".
    ...(nativeApp
      ? { 'appium:bundleId': NATIVE_APP_BUNDLE_ID }
      : { browserName: 'Safari', 'appium:safariInitialUrl': 'about:blank' }),
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:udid': deviceId,
    'appium:xcodeConfigFile': xcodeConfigFile,
    'appium:updatedWDABundleId': wdaBundleId,
    'appium:wdaLaunchTimeout': WDA_LAUNCH_TIMEOUT_MS,
    'appium:wdaStartupRetries': WDA_STARTUP_RETRIES,
    ...(allowProvisioning ? { 'appium:allowProvisioningDeviceRegistration': true } : {}),
  };
}

// A hosted provider is addressed by a capability file and has no local device id,
// which is what the `cloud` fallback exists for. A local capability-file run —
// every native-app capture, since `appiumCapabilities` builds a Safari session —
// has no `--device-id` either, and filing it as `cloud` throws away the hardware
// identity ADR-0090 provenances a calibrated gate by. The negotiated session
// names the device it attached to, so read that before falling back.
export function capturedDeviceId(explicitDeviceId, session) {
  if (explicitDeviceId) return explicitDeviceId;
  const capabilities = session?.capabilities ?? session?.value?.capabilities;
  return capabilities?.udid ?? capabilities?.['appium:udid'] ?? 'cloud';
}

export function borrowedSessionDescriptor(sessionId, requestedCapabilities) {
  if (!requestedCapabilities) throw new Error(BORROWED_SESSION_CAPABILITIES_ERROR);
  const capabilities = requestedCapabilities;
  return {
    sessionId,
    capabilities: {
      ...capabilities,
      deviceName: capabilities.deviceName ?? capabilities['appium:deviceName'],
      platformVersion:
        capabilities.platformVersion ?? capabilities['appium:platformVersion'],
    },
  };
}

export function summarizeLiveSurfaceTopology(surfaces) {
  const sizes = new Map();
  let totalBackingPixels = 0;
  let maxBackingPixels = 0;
  for (const surface of surfaces) {
    const { width, height } = surface;
    const pixels = width * height;
    totalBackingPixels += pixels;
    maxBackingPixels = Math.max(maxBackingPixels, pixels);
    const key = `${width}x${height}`;
    const size = sizes.get(key) ?? { width, height, pixels, count: 0 };
    size.count++;
    sizes.set(key, size);
  }
  return {
    count: surfaces.length,
    sizes: [...sizes.values()],
    totalBackingPixels,
    maxBackingPixels,
    maxBackingMegapixels: Math.round((maxBackingPixels / 1_000_000) * 1_000) / 1_000,
  };
}

export function createWebDriverClient(baseUrl) {
  const endpoint = new URL(baseUrl);
  const authorization =
    endpoint.username || endpoint.password
      ? `Basic ${Buffer.from(
          `${decodeURIComponent(endpoint.username)}:${decodeURIComponent(endpoint.password)}`
        ).toString('base64')}`
      : null;
  endpoint.username = '';
  endpoint.password = '';
  const url = endpoint.toString().replace(/\/+$/, '');
  const request = async (method, path, body) => {
    let response;
    try {
      response = await fetch(`${url}${path}`, {
        method,
        headers: {
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...(authorization ? { authorization } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      throw new Error(`Could not reach Appium at ${url}`, { cause: error });
    }
    const text = await response.text();
    let result;
    try {
      result = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`${method} ${path} returned non-JSON (${response.status}): ${text}`);
    }
    if (!response.ok || result.value?.error) {
      throw new Error(result.value?.message ?? `${method} ${path} failed with ${response.status}`);
    }
    return result.value;
  };
  return { request };
}

export function capabilitiesFromFile(path) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  return parsed.capabilities?.alwaysMatch ?? parsed.alwaysMatch ?? parsed;
}

export function isWebContext(context) {
  return context === 'CHROMIUM' || context.startsWith('WEBVIEW');
}

export function nativeOrientationNeedsUnlock({
  nativeApp,
  rotateBeforeUndo,
  requestedOrientation,
  originalOrientation,
}) {
  return (
    nativeApp &&
    (rotateBeforeUndo ||
      (requestedOrientation !== null && requestedOrientation !== originalOrientation))
  );
}

export async function switchToWebContext(client, sessionId) {
  const webContext = await pollUntil(
    () =>
      client
        .request('GET', `/session/${sessionId}/contexts`)
        .then((contexts) => contexts.find(isWebContext) ?? null)
        .catch(() => null),
    WEBVIEW_READY_TIMEOUT_MS,
    WEBVIEW_READY_POLL_MS
  );
  if (!webContext) throw new Error('Appium reported no WEBVIEW context');
  await client.request('POST', `/session/${sessionId}/context`, { name: webContext });
  return webContext;
}

function profilingUrl(appUrl) {
  const url = new URL(appUrl);
  url.searchParams.set('perf-run', String(Date.now()));
  return url.toString();
}

// CacheStorage can accept a call and never settle it — Android System WebView 151
// does exactly that for `caches.keys()` inside the Capacitor app. Without a
// deadline the whole capture dies on a bare WebDriver "script timeout" that names
// neither the API nor the reason.
// What this guard is actually for is a service worker serving an earlier build's
// assets. That needs a worker, so a page with no registrations and no controller
// cannot be reached by any cache entry and is safe to measure without evicting.
export function cacheEvictionAcceptable(state) {
  if (!state?.ok) return false;
  if (state.cachesCleared || state.cachesSkipped) return true;
  return false;
}

// Touching CacheStorage in the Capacitor WebView (Android System WebView 151) wedges
// async-script callback delivery for the rest of the session: the promise never
// settles, and afterwards even a bare setTimeout never reaches the driver, so an
// in-page deadline cannot rescue it — the deadline is the thing being wedged.
// Synchronous evaluation keeps working, which is how that was pinned down.
//
// So the enumeration order is load-bearing rather than stylistic: registrations are
// read first, and `caches` is touched only when a worker exists to serve from it.
// A native app ships no service worker, which is the case that used to hang.
export async function clearDeviceWebCache(executeAsync) {
  const state = await executeAsync(`
    const done = arguments[arguments.length - 1];
    const registrations = 'serviceWorker' in navigator
      ? navigator.serviceWorker.getRegistrations().catch(() => [])
      : Promise.resolve([]);
    registrations.then((found) => {
      const controlled = Boolean(navigator.serviceWorker && navigator.serviceWorker.controller);
      if (found.length === 0 && !controlled) {
        done({ ok: true, registrations: 0, controlled: false, cachesSkipped: true });
        return;
      }
      return Promise.all(found.map((registration) => registration.unregister().catch(() => false)))
        .then((unregistered) =>
          ('caches' in window
            ? caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
            : Promise.resolve(null)
          ).then(() =>
            done({
              ok: true,
              registrations: found.length,
              controlled,
              // Honest, not optimistic: a swallowed unregister used to report
              // cachesCleared: true anyway (issue 1296), and the capture then
              // measured a page a stale worker could still be serving.
              cachesCleared: unregistered.every(Boolean),
            })
          )
        );
    }).catch((error) => done({ ok: false, message: String(error) }));
  `);
  if (!cacheEvictionAcceptable(state)) {
    throw new Error(`Could not clear the device web cache: ${state?.message ?? 'no usable result'}`);
  }
  return state;
}

export async function dismissInstallBannerForMeasurement(execute) {
  return execute(`
    localStorage.setItem(${JSON.stringify(INSTALL_DISMISSED_STORAGE_KEY)}, 'true');
    return true;
  `);
}

export async function blockServiceWorkerRegistrationForMeasurement(execute) {
  return execute(`
    if (!('serviceWorker' in navigator)) return 'unsupported';
    Object.defineProperty(navigator.serviceWorker, 'register', {
      configurable: true,
      value: () => Promise.resolve(undefined)
    });
    return 'blocked';
  `);
}

async function readTable(execute, accessor, total) {
  const rows = [];
  while (rows.length < total) {
    const slice = await execute(
      `return window.__probe.${accessor}(${rows.length}, ${TABLE_CHUNK_ROWS});`
    );
    if (!slice?.length) break;
    rows.push(...slice);
  }
  return rows;
}

async function executePagePromise(executeAsync, expression) {
  const result = await executeAsync(`
    const done = arguments[arguments.length - 1];
    Promise.resolve()
      .then(() => (${expression}))
      .then(
        (value) => done({ ok: true, value }),
        (error) => done({ ok: false, error: String(error?.message ?? error) })
      );
  `);
  if (!result?.ok) throw new Error(result?.error ?? 'The page promise returned no result');
  return result.value;
}

export async function runIpadXcuitest(argv = process.argv.slice(2)) {
  const { flag, has, port } = parsePerfArgs(
    {
      entry: true,
      extra: [
        'url',
        'device-id',
        'appium-url',
        'xcode-config',
        'wda-bundle-id',
        'allow-provisioning',
        'capabilities-file',
        'session-id',
        'native-app',
        'bundled-report',
        'hand-input',
        'seconds',
        'native-webview-class',
        'brush',
        'gesture-repeats',
        'repeat-pause-ms',
        'undo-count',
        'undo-pause-ms',
        'history-settle-ms',
        'refresh-regime',
        'rotate-before-undo',
        'label',
        'output',
        'report-only',
        'no-serve',
        'allow-foreign-build',
        'orientation',
        'theme',
      ],
    },
    argv
  );
  const deviceId = flag('device-id');
  const capabilitiesFile = flag('capabilities-file');
  const borrowedSessionId = flag('session-id');
  if (!deviceId && !capabilitiesFile && !borrowedSessionId) {
    fail('Pass --device-id=, --capabilities-file=, or --session-id=');
  }
  if (borrowedSessionId && !capabilitiesFile) {
    fail(BORROWED_SESSION_CAPABILITIES_ERROR);
  }
  const xcodeConfigFile = flag('xcode-config', DEFAULT_XCODE_CONFIG);
  if (!capabilitiesFile && !borrowedSessionId && !existsSync(xcodeConfigFile)) {
    fail(
      `No signing config at ${xcodeConfigFile}. Create ios/local.xcconfig with ` +
        'DEVELOPMENT_TEAM = <your Apple team id>.'
    );
  }

  const nativeApp = has('native-app');
  const bundledReport = has('bundled-report');
  const handInput = has('hand-input');
  if (bundledReport && (!nativeApp || !deviceId || capabilitiesFile || borrowedSessionId)) {
    fail('--bundled-report requires a local --device-id= capture with --native-app');
  }
  if (handInput && !bundledReport) fail('--hand-input requires --bundled-report');
  const handSeconds = Number.parseInt(flag('seconds', String(HAND_DEFAULT_SECONDS)), 10);
  if (!Number.isSafeInteger(handSeconds) || handSeconds < 1) {
    fail('--seconds must be a positive integer');
  }
  const requestedOrientation = parseCampaignOrientation(flag('orientation'));
  const requestedTheme = parseCampaignTheme(flag('theme'));
  const requestedAppUrl = nativeApp ? null : resolveDeviceUrl(flag('url'), port, APP_PATH);
  const gestureRepeats = Number.parseInt(flag('gesture-repeats', '1'), 10);
  if (!Number.isSafeInteger(gestureRepeats) || gestureRepeats < 1) {
    fail('--gesture-repeats must be a positive integer');
  }
  const repeatPauseMs = Number.parseInt(flag('repeat-pause-ms', '0'), 10);
  if (!Number.isSafeInteger(repeatPauseMs) || repeatPauseMs < 0) {
    fail('--repeat-pause-ms must be a non-negative integer');
  }
  const undoCount = Number.parseInt(flag('undo-count', '0'), 10);
  if (!Number.isSafeInteger(undoCount) || undoCount < 0) {
    fail('--undo-count must be a non-negative integer');
  }
  const undoPauseMs = Number.parseInt(flag('undo-pause-ms', String(UNDO_ACTION_PAUSE_MS)), 10);
  if (!Number.isSafeInteger(undoPauseMs) || undoPauseMs < 0) {
    fail('--undo-pause-ms must be a non-negative integer');
  }
  const historySettleMs = Number.parseInt(flag('history-settle-ms', '0'), 10);
  if (!Number.isSafeInteger(historySettleMs) || historySettleMs < 0) {
    fail('--history-settle-ms must be a non-negative integer');
  }
  const brush = flag('brush', 'pen');
  const brushSelector = BRUSH_BUTTON_BY_MODE[brush];
  if (!brushSelector) {
    fail(`--brush must be one of ${Object.keys(BRUSH_BUTTON_BY_MODE).join(', ')}`);
  }
  const client = createWebDriverClient(flag('appium-url', DEFAULT_APPIUM_URL));
  const requestedCapabilities = capabilitiesFile
    ? capabilitiesFromFile(capabilitiesFile)
    : borrowedSessionId
      ? null
      : appiumCapabilities({
          deviceId,
          xcodeConfigFile,
          wdaBundleId: flag('wda-bundle-id', DEFAULT_WDA_BUNDLE_ID),
          allowProvisioning: has('allow-provisioning'),
          nativeApp,
        });
  let server;
  let sessionId = borrowedSessionId;
  let ownsSession = false;
  let originalOrientation;
  let execute;
  let restoreNativeRotationLock = false;
  // Three-valued on purpose: null means the rotation path was never exercised
  // (the device already sat in the requested orientation), which is not the same
  // claim as the product owning an in-app lock.
  let platformOwnsRotation = null;
  let cleanupPromise;
  let bundledReportNonce = null;
  const cleanup = () => {
    cleanupPromise ??= (async () => {
      if (sessionId && originalOrientation) {
        await client
          .request('POST', `/session/${sessionId}/orientation`, {
            orientation: originalOrientation,
          })
          .catch((error) =>
            console.warn(`cleanup: orientation restore failed (${error.message})`)
          );
      }
      if (sessionId && execute && restoreNativeRotationLock) {
        // A silent failure here leaves the iPad rotation-unlocked, which
        // changes what the NEXT cell measures with no record anywhere
        // (issue 1296) — the warning is the record.
        await switchToWebContext(client, sessionId).catch((error) =>
          console.warn(`cleanup: web-context switch failed (${error.message})`)
        );
        await setNativeRotationLock(execute, true).catch((error) =>
          console.warn(
            `cleanup: rotation-lock restore failed (${error.message}) — the device may measure the next cell unlocked`
          )
        );
      }
      if (sessionId && ownsSession) {
        await client.request('DELETE', `/session/${sessionId}`).catch(() => {});
      }
      server?.stop();
    })();
    return cleanupPromise;
  };
  let interrupting = false;
  const onInterrupt = (exitCode) => {
    if (interrupting) return;
    interrupting = true;
    void cleanup().finally(() => process.exit(exitCode));
  };
  const onSigint = () => onInterrupt(130);
  const onSigterm = () => onInterrupt(143);
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);
  try {
    server = nativeApp
      ? null
      : await ensurePreviewServer(requestedAppUrl, port, !has('no-serve'), {
          allowForeignBuild: has('allow-foreign-build'),
        });
    await client.request('GET', '/status');
    const session = sessionId
      ? borrowedSessionDescriptor(sessionId, requestedCapabilities)
      : await client.request('POST', '/session', {
          capabilities: {
            alwaysMatch: requestedCapabilities,
          },
        });
    if (!sessionId) {
      sessionId = session.sessionId;
      ownsSession = true;
    }
    execute = (script, args = []) =>
      client.request('POST', `/session/${sessionId}/execute/sync`, { script, args });
    const executeAsync = (script, args = []) =>
      client.request('POST', `/session/${sessionId}/execute/async`, { script, args });
    if (nativeApp) {
      await switchToWebContext(client, sessionId);
    } else {
      await client.request('POST', `/session/${sessionId}/url`, { url: requestedAppUrl });
    }
    await client.request('POST', `/session/${sessionId}/timeouts`, {
      script: SCRIPT_TIMEOUT_MS,
    });
    const initialReady = await pollUntil(
      () =>
        execute(
          "const canvas = document.querySelector('#drawingCanvas'); return !!canvas && canvas.width > 0;"
        ).catch((error) => {
        rethrowIfBroken(error);
        return false;
      }),
      WEBVIEW_READY_TIMEOUT_MS,
      WEBVIEW_READY_POLL_MS
    );
    if (!initialReady) {
      throw new Error(
        `${nativeApp ? 'The native app' : requestedAppUrl} never showed a sized #drawingCanvas`
      );
    }
    originalOrientation = await client.request('GET', `/session/${sessionId}/orientation`);
    const needsRotationUnlock = nativeOrientationNeedsUnlock({
      nativeApp,
      rotateBeforeUndo: has('rotate-before-undo'),
      requestedOrientation,
      originalOrientation,
    });
    if (needsRotationUnlock) {
      const initialRotationLock = await setNativeRotationLock(execute, false);
      // No in-app lock to release means nothing to bypass: rotating the device is
      // the only orientation path the product offers on this platform, so ADR-0090's
      // persisted-setting rule is satisfied rather than skipped.
      platformOwnsRotation = initialRotationLock === PLATFORM_OWNS_ROTATION;
      restoreNativeRotationLock = platformOwnsRotation ? false : initialRotationLock;
      if (restoreNativeRotationLock) {
        await execute('location.reload(); return true;').catch(() => null);
        await switchToWebContext(client, sessionId);
        const unlockedReady = await pollUntil(
          () =>
            execute(
              "const canvas = document.querySelector('#drawingCanvas'); return !!canvas && canvas.width > 0;"
            ).catch((error) => {
        rethrowIfBroken(error);
        return false;
      }),
          WEBVIEW_READY_TIMEOUT_MS,
          WEBVIEW_READY_POLL_MS
        );
        if (!unlockedReady) {
          throw new Error('The native app did not reload after releasing its orientation lock');
        }
      }
    }
    if (requestedOrientation && requestedOrientation !== originalOrientation) {
      await client.request('POST', `/session/${sessionId}/orientation`, {
        orientation: requestedOrientation,
      });
      const rotated = await pollUntil(
        () =>
          execute('return { width: innerWidth, height: innerHeight };')
            .then((size) =>
              requestedOrientation === 'PORTRAIT'
                ? size.height > size.width
                : size.width > size.height
            )
            .catch((error) => {
        rethrowIfBroken(error);
        return false;
      }),
        ROTATION_SETTLE_TIMEOUT_MS,
        WEBVIEW_READY_POLL_MS
      );
      if (!rotated) throw new Error(`The device did not settle into ${requestedOrientation}`);
      await sleep(AFTER_GESTURE_SETTLE_MS);
    }
    await clearDeviceWebCache(executeAsync);
    await dismissInstallBannerForMeasurement(execute);
    const appUrl = nativeApp ? await execute('return location.href;') : requestedAppUrl;
    const loadedUrl = profilingUrl(appUrl);
    if (nativeApp) {
      await execute(`location.replace(${JSON.stringify(loadedUrl)}); return true;`).catch(
        () => null
      );
      await switchToWebContext(client, sessionId);
    } else {
      await client.request('POST', `/session/${sessionId}/url`, { url: loadedUrl });
    }
    const ready = await pollUntil(
      () =>
        execute(
          "const canvas = document.querySelector('#drawingCanvas'); return !!canvas && canvas.width > 0;"
        ).catch((error) => {
        rethrowIfBroken(error);
        return false;
      }),
      WEBVIEW_READY_TIMEOUT_MS,
      WEBVIEW_READY_POLL_MS
    );
    if (!ready) throw new Error(`${loadedUrl} never showed a sized #drawingCanvas`);
    const armedPageUrl = await execute('return location.href;');
    if (bundledReport) {
      const channelReady = await execute('return !!window.__bundledCaptureReport;');
      if (!channelReady) {
        throw new Error(
          'The bundled report seam is absent; install a PUBLIC_ENABLE_DEV_HARNESS native build'
        );
      }
      bundledReportNonce = randomUUID();
      await executePagePromise(
        executeAsync,
        `window.__bundledCaptureReport.arm(${JSON.stringify(bundledReportNonce)})`
      );
    }
    await clearDeviceWebCache(executeAsync);
    const serviceWorkerRegistration = await blockServiceWorkerRegistrationForMeasurement(execute);
    await ensureCampaignTheme(execute, requestedTheme);
    const theme = await readResolvedTheme(execute);
    if (undoCount > 0) {
      const debugReady = await pollUntil(
        () => execute('return !!window.__drawingDebug?.getUndoDebug;').catch((error) => {
        rethrowIfBroken(error);
        return false;
      }),
        BRUSH_SELECT_TIMEOUT_MS,
        WEBVIEW_READY_POLL_MS
      );
      if (!debugReady) throw new Error('The production route did not expose __drawingDebug');
    }

    // Every brush is selected, pen included. The tool choice is persisted, and
    // captures share an origin, so a run that assumed pen was the default drew
    // its "pen" strokes with whatever the previous capture had selected — an
    // iPad campaign ordered `crayon pen magic eraser` reported a pen cell that
    // was crayon's number to two decimal places, with crayon's engine cost.
    {
      await execute(
        `document.querySelector('button[aria-label="Expand controls"]')?.click(); return true;`
      );
      const drawerReady = await pollUntil(
        () => execute(`return !!document.querySelector('#brushButton');`).catch((error) => {
        rethrowIfBroken(error);
        return false;
      }),
        BRUSH_SELECT_TIMEOUT_MS,
        WEBVIEW_READY_POLL_MS
      );
      if (!drawerReady) throw new Error('Action drawer did not expose #brushButton');
      await execute(`document.querySelector('#brushButton')?.click(); return true;`);
      const brushReady = await pollUntil(
        () =>
          execute(`return !!document.querySelector(${JSON.stringify(brushSelector)});`).catch(
            () => false
          ),
        BRUSH_SELECT_TIMEOUT_MS,
        WEBVIEW_READY_POLL_MS
      );
      if (!brushReady) throw new Error(`Brush menu did not expose ${brushSelector}`);
      await execute(
        `document.querySelector(${JSON.stringify(brushSelector)})?.click(); return true;`
      );
      const brushCommitted = await pollUntil(
        () =>
          execute(`return window.__committedBrushMode?.() === ${JSON.stringify(brush)};`).catch(
            () => false
          ),
        BRUSH_SELECT_TIMEOUT_MS,
        WEBVIEW_READY_POLL_MS
      );
      if (!brushCommitted) throw new Error(`Drawing engine did not commit ${brush} mode`);
    }
    // The fill is verified rather than trusted (issue 1302): waits out deferred
    // tile-backing realization, proves the painted pixels are opaque, and fails
    // the capture instead of banking a normal-looking artifact that erased
    // blank paper. Shared with the split-capture bootstrap, and re-run after
    // the settle — a deferred clear or resize inside that window wipes paint a
    // point-in-time verification already blessed.
    let eraserFill = null;
    if (brush === 'eraser') {
      const fillVerified = async () => {
        const fill = await pollUntil(
          async () => {
            const result = await execute(
              `${eraserFillFunctionSource()}\nreturn fillEraserInk();`
            ).catch((error) => {
              throw new Error(`the eraser fill failed in the page: ${error?.message ?? error}`);
            });
            return result?.pending ? null : result;
          },
          ERASER_FILL_BACKING_TIMEOUT_MS,
          WEBVIEW_READY_POLL_MS
        );
        if (!fill) throw new Error('live tile backings never realized for the eraser fill');
        if (fill.transparentTiles.length) {
          throw new Error(
            `the eraser fill left tiles transparent: ${fill.transparentTiles.join(', ')}`
          );
        }
        return fill;
      };
      eraserFill = await fillVerified();
      await sleep(AFTER_GESTURE_SETTLE_MS);
      // Verify WITHOUT painting first (fillEraserInk(true)): a wipe inside the
      // settle window is instability evidence to record, not silently repaint.
      const afterSettle = await execute(
        `${eraserFillFunctionSource()}\nreturn fillEraserInk(true);`
      );
      if (afterSettle?.pending || afterSettle?.transparentTiles?.length) {
        eraserFill = {
          ...(await fillVerified()),
          repairedAfterSettle: true,
          settleWipe: afterSettle,
        };
      }
      // The page refills between gesture passes so every pass erases real ink
      // (issue 1292); the refill log is read back after the sweep.
      const arming = eraserRefillArming(gestureRepeats, STROKES_PER_GESTURE_REPEAT);
      await execute(
        `${eraserFillFunctionSource()}\n${eraserRefillFunctionSource()}\n` +
          `armEraserRefill(${arming.everyStrokes}, ` +
          `${arming.totalStrokes}, fillEraserInk); return true;`
      );
    }

    await execute(
      probeConfigScript({
        phases: 'blank',
        contactMs: PROBE_CONTACT_BUDGET_MS,
        hud: false,
      })
    );
    const probeInstalled = await execute(
      `${readFileSync(PROBE_FILE, 'utf8')}\nreturn !!window.__probe;`
    );
    if (!probeInstalled) {
      throw new Error(
        'The real-screen probe did not install; verify #drawingCanvas exists and no stale probe is active.'
      );
    }

    const webGeometry = await execute(
      "const r = document.querySelector('#drawingCanvas').getBoundingClientRect(); return {canvas:{x:r.x,y:r.y,width:r.width,height:r.height},viewport:{width:innerWidth,height:innerHeight}};"
    );
    const contexts = await client.request('GET', `/session/${sessionId}/contexts`);
    const webContext = contexts.find(isWebContext);
    if (!webContext) throw new Error(`Appium reported no WEBVIEW context: ${contexts.join(', ')}`);

    await client.request('POST', `/session/${sessionId}/context`, { name: 'NATIVE_APP' });
    const nativeWindow = await client.request('GET', `/session/${sessionId}/window/rect`);
    const webViewBounds = await client
      .request('POST', `/session/${sessionId}/element`, {
        using: 'class name',
        value: flag('native-webview-class', DEFAULT_NATIVE_WEBVIEW_CLASS),
      })
      .then((webView) => {
        const webViewId = webView['element-6066-11e4-a52e-4f735466cecf'] ?? webView.ELEMENT;
        return client.request('GET', `/session/${sessionId}/element/${webViewId}/rect`);
      })
      .catch((error) => {
        // Substituting the whole native window for the WebView rect changes
        // the canvas geometry every gesture is computed from — plausible
        // numbers, wrong frame. Fine when they coincide, but never silent
        // (issue 1296).
        console.warn(`WebView rect unavailable (${error.message}); using the native window rect`);
        return nativeWindow;
      });
    const orientation = await client.request('GET', `/session/${sessionId}/orientation`);
    const canvasBounds = nativeCanvasBounds({
      webGeometry,
      webViewBounds,
      nativeWindow,
      includeBrowserChrome: !nativeApp,
    });

    if (handInput) {
      console.log(`\nDraw ${brush} strokes on the iPad for ~${handSeconds}s.`);
      for (let tick = HAND_COUNTDOWN_SECONDS; tick > 0; tick -= 1) {
        console.log(`  starting in ${tick}…`);
        await sleep(1_000);
      }
      console.log('  GO — drawing window open');
      await sleep(handSeconds * 1_000);
      console.log('  window closed');
    } else {
      await client.request('POST', `/session/${sessionId}/actions`, {
        actions: [
          {
            type: 'pointer',
            id: 'finger',
            parameters: { pointerType: 'touch' },
            actions: trustedGestureActions(canvasBounds, gestureRepeats, repeatPauseMs),
          },
        ],
      });
    }
    await client.request('POST', `/session/${sessionId}/context`, { name: webContext });
    await sleep(AFTER_GESTURE_SETTLE_MS);
    const eraserRefills =
      brush === 'eraser' ? await execute('return window.__eraserRefills ?? null;') : null;
    if (historySettleMs > 0) await sleep(historySettleMs);
    let rotation = null;
    if (has('rotate-before-undo')) {
      const before = await execute('return { width: innerWidth, height: innerHeight };');
      const target = orientation === 'LANDSCAPE' ? 'PORTRAIT' : 'LANDSCAPE';
      await client.request('POST', `/session/${sessionId}/orientation`, { orientation: target });
      const settled = await pollUntil(
        () =>
          execute('return { width: innerWidth, height: innerHeight };')
            .then((size) => {
              const targetReached =
                target === 'PORTRAIT' ? size.height > size.width : size.width > size.height;
              return targetReached && (size.width !== before.width || size.height !== before.height)
                ? size
                : null;
            })
            .catch(() => null),
        ROTATION_SETTLE_TIMEOUT_MS,
        WEBVIEW_READY_POLL_MS
      );
      if (!settled) throw new Error(`The iPad did not settle into ${target}`);
      await sleep(AFTER_GESTURE_SETTLE_MS);
      const visualSettledMs = await executeAsync(`
        const done = arguments[arguments.length - 1];
        const startedAt = performance.now();
        requestAnimationFrame(() =>
          requestAnimationFrame((at) => done(at - startedAt))
        );
      `);
      rotation = { from: orientation, to: target, before, after: settled, visualSettledMs };
    }
    const historyBeforeUndo =
      undoCount > 0 ? await execute('return window.__drawingDebug.getUndoDebug();') : null;

    const undoActions = [];
    if (undoCount > 0) {
      await execute(EXPAND_CONTROLS_SOURCE);
      const undoReady = await pollUntil(
        () => execute(UNDO_BUTTON_READY_SOURCE).catch((error) => {
        rethrowIfBroken(error);
        return false;
      }),
        UNDO_BUTTON_READY_TIMEOUT_MS,
        UNDO_BUTTON_READY_POLL_MS
      );
      if (!undoReady) throw new Error('Action drawer did not expose an enabled #undoButton');
      for (let index = 0; index < undoCount; index++) {
        const action = await executeAsync(`
          const done = arguments[arguments.length - 1];
          ${undoActionPromiseSource(index)}.then(done, () => done(null));
        `);
        assertUndoAction(action, index);
        undoActions.push(action);
        await sleep(undoPauseMs);
      }
      await sleep(UNDO_ACTION_SETTLE_MS);
    }

    let report;
    let reportChannel = null;
    let bundledPayload = null;
    if (bundledReport) {
      const write = await executePagePromise(
        executeAsync,
        `window.__bundledCaptureReport.collect(${JSON.stringify(bundledReportNonce)})`
      );
      const pulled = await pullBundledReportFromDevice({
        deviceId,
        bundleId: NATIVE_APP_BUNDLE_ID,
        nonce: bundledReportNonce,
      });
      const payloadProblem = bundledReportPayloadProblem(pulled.payload, {
        nonce: bundledReportNonce,
        bytes: write.bytes,
        pageUrl: armedPageUrl,
      });
      if (payloadProblem) throw new Error(`The pulled bundled report is invalid: ${payloadProblem}`);
      bundledPayload = pulled.payload;
      report = bundledPayload.report;
      reportChannel = {
        transport: 'capacitor-preferences-devicectl',
        nonce: bundledReportNonce,
        bytes: pulled.bytes,
        source: pulled.source,
        counts: write.counts,
      };
      await executePagePromise(
        executeAsync,
        `window.__bundledCaptureReport.clear(${JSON.stringify(bundledReportNonce)})`
      );
    } else {
      report = await execute('return window.__probe.finish();');
      const counts = report.meta.counts;
      report.frames = await readTable(execute, 'frames', counts.frames);
      report.events = await readTable(execute, 'events', counts.events);
      report.measures = await readTable(execute, 'measures', counts.measures);
    }
    await execute('window.__probe.stop(); return true;');

    const summaries = summarizeRun(report);
    const drawing = scoreDrawingRun(summaries.phases);
    const undo = summarizeUndoActions(undoActions, report.frames);
    const input = summaries.phases[0]?.input ?? {};
    // Read from the negotiated session rather than from the flags: this command
    // drives Android through a capabilities file as well as the iPad, so the
    // platform is a property of the session that was actually opened.
    const runtime = captureRuntime(
      session.capabilities?.platformName ?? session.capabilities?.['appium:platformName'],
      nativeApp
    );
    if (bundledPayload) {
      const uaProblem = runtimeUaProblem(runtime, bundledPayload.userAgent);
      if (uaProblem) throw new Error(uaProblem);
    }
    const fidelity = inputFidelity(input, runtime);
    // Only for a locally driven physical device: a simulator declares no
    // expectation, and imposing the device's on it would fail captures that are
    // fine. `--refresh-regime=` overrides for anything this cannot resolve.
    const expectedRegime =
      flag('refresh-regime', null) ??
      (deviceId && !capabilitiesFile
        ? soleExpectedRegimeForRuntime(CAMPAIGN_TARGETS, runtime)
        : null);
    const regime = refreshRegimeVerdict(
      summaries.intervalMs,
      expectedRegime,
      summaries.regimeMixture
    );
    const liveSurfaceTopology = summarizeLiveSurfaceTopology(
      await execute('return window.__drawingDebug.getLiveSurfaceTopology();')
    );
    const label = sanitizeLabel(flag('label', brush));
    const output = flag('output') ?? join(profilePath('ipad-xcuitest', label), 'real-screen.json');
    mkdirSync(dirname(output), { recursive: true });
    const artifact = {
      device: {
        name: session.capabilities?.deviceName ?? 'iPad',
        os: session.capabilities?.platformVersion ?? 'unknown',
        id: capturedDeviceId(deviceId, session),
      },
      appUrl,
      transport: nativeApp ? NATIVE_TRANSPORT : 'browser',
      theme,
      // The brush the ENGINE committed, not the one requested — the selection
      // above polls __committedBrushMode and throws unless they agree, so by
      // here they do. Recorded because a reader that cannot find it falls back
      // to guessing from the path, and `brushOf` guesses 'pen' (issue 1305's
      // rescore path). A crayon capture whose label carried no brush token was
      // therefore filed as pen and dropped by the one-per-target-x-brush
      // retention, silently, on 2026-08-27.
      brush,
      // Same top-level home the split artifact uses for these fields, so the
      // shared reader needs no second location (the review caught gesturePlan
      // reproducing the gestureRepeats top-level/automation split).
      gesturePlan: handInput ? null : gesturePlanFor(brush),
      // The frame beat this capture actually presented at, and whether that is
      // the regime its runtime is held to. Recorded because lostFrameTimeShare
      // is charged against the beat, so two captures in different regimes are
      // not comparable — and a reader cannot reconstruct that from the score.
      refreshRegime: regime,
      // The verified-fill evidence (issue 1302); null for every other brush.
      eraserFill,
      // Per-pass refill evidence (issue 1292), read back from the page.
      eraserRefills,
      mode: `xcuitest:${label}`,
      handCapture: handInput,
      ...(handInput ? { runtime, reading: null, drawSeconds: handSeconds } : {}),
      ...(bundledPayload
        ? {
            nativeApp: true,
            pageDelivery: 'bundled',
            pageIdentity: 'proven-by-container-nonce',
            pageUrl: bundledPayload.pageUrl,
            userAgent: bundledPayload.userAgent,
            reportChannel,
          }
        : {}),
      automation: {
        appiumUrl: flag('appium-url', DEFAULT_APPIUM_URL),
        orientation,
        loadedUrl,
        webGeometry,
        webViewBounds,
        nativeWindow,
        canvasBounds,
        liveSurfaceTopology,
        gestureRepeats: handInput ? null : gestureRepeats,
        repeatPauseMs,
        undoCount,
        undoPauseMs,
        historySettleMs,
        rotation,
        platformOwnsRotation,
        pwaEffects: {
          installBanner: 'dismissed',
          serviceWorkerRegistration,
        },
      },
      fidelity,
      drawing,
      undo,
      undoActions,
      historyBeforeUndo,
      summaries,
      report,
    };
    writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`);

    // Classified but not judged: this command is given a device id, not a matrix
    // row, so it cannot know which regime the cell it is filling is scored against
    // (the same limit ADR-0137's exception table has) — but where the RUNTIME's
    // targets declare exactly one expectation, that expectation is unambiguous
    // and the capture is judged against it rather than merely printing a number.
    //
    // Unarmed, this check reported "unestablished" and recorded nothing, and a
    // 2026-08-27 Safari capture that presented at 120 Hz inside a 60 Hz cell
    // scored 2.25% against siblings at 0.6% — the beat, not the app. The campaign
    // runner already refuses that as off-refresh-regime; this path did not.
    console.log(`\nObserved frame beat: ${describeRefreshRegime(regime)}`);
    if (expectedRegime && !regime.matched) {
      console.log(
        `  ^ NOT the ${expectedRegime} this runtime is expected to hold. ` +
          'lostFrameTimeShare is charged against the beat, so this number is not ' +
          'comparable with a capture taken in the expected regime.'
      );
    }
    console.log('\nFrame pacing');
    console.table(pacingRows(summaries.phases));
    console.log('\nTrusted input fidelity');
    console.table(inputRows(summaries.phases));
    console.log('\nEngine work');
    console.table(engineRows(summaries.phases));
    console.log('\nRender starvation');
    console.table(starvationRows(summaries.phases));
    console.log('\nDrawing acceptance gates');
    console.table(drawingGateRows(drawing));
    if (undoCount > 0) {
      console.log('\nUndo response');
      console.table(undoActionRows(undo));
      console.log('\nHistory before undo');
      console.table([historyBeforeUndo]);
    }
    console.log(
      `\nFidelity: ${fidelity.passed ? 'PASS' : 'FAIL'} · ${JSON.stringify(fidelity.checks)}`
    );
    console.log(`Wrote ${output}`);
    if (!fidelity.passed && !has('report-only')) {
      throw new Error(
        'The capture failed the trusted-input fidelity gate; do not use its lag score.'
      );
    }
    // Ordered AFTER fidelity for the same reason the campaign runner orders it
    // there: a capture that was barely driven has a meaningless beat as well as
    // a meaningless number, and naming the regime would send the next session
    // after the wrong thing.
    //
    // This REFUSES rather than warns. lostFrameTimeShare is a share of the beat,
    // so a capture that held a different regime is not comparable with the cell
    // it is filling — a 2026-08-27 Safari capture presenting at 120 Hz among
    // 60 Hz siblings scored 2.25% against their ~0.6%, and warning alone let it
    // be written, exit zero, and be averaged in by hand.
    const regimeRefusal = refreshRegimeRefusal(regime, {
      expected: expectedRegime,
      reportOnly: has('report-only'),
    });
    if (regimeRefusal) throw new Error(regimeRefusal);
    if (!has('report-only') && (!drawing.passed || (undoCount > 0 && !undo.passed))) {
      throw new Error(
        [
          !drawing.passed ? 'drawing frame gates' : null,
          undoCount > 0 && !undo.passed ? 'undo response gates' : null,
        ]
          .filter(Boolean)
          .join(' and ') + ' failed'
      );
    }
    return artifact;
  } finally {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
    await cleanup();
  }
}

if (isMain(import.meta.url)) runMain(runIpadXcuitest);
