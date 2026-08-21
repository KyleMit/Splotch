import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT, fail, isMain, pollUntil, runMain, sleep } from '../../lib/proc.mjs';
import { parsePerfArgs } from '../lib/cli-args.mjs';
import { drawingGateRows, scoreDrawingRun } from '../lib/drawing-gates.mjs';
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
export const BORROWED_SESSION_CAPABILITIES_ERROR =
  '--session-id requires --capabilities-file so borrowed-session artifacts retain target provenance';
const BRUSH_SELECT_TIMEOUT_MS = 10_000;
const ROTATION_SETTLE_TIMEOUT_MS = 10_000;
const INSTALL_DISMISSED_STORAGE_KEY = 'splotch-install-dismissed';
const BRUSH_BUTTON_BY_MODE = {
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

// Calibrated against the schema-2 hand capture on the target iPad. These gate
// whether a run exercised the physical touch path; they are not lag thresholds.
export const FIDELITY_MOVES_PER_SECOND_MIN = 100;
export const FIDELITY_MOVES_PER_SECOND_MAX = 170;
export const FIDELITY_MOVE_GAP_P95_MAX_MS = 20;
export const FIDELITY_CONTACT_SIZE_MIN_PX = 40;
export const FIDELITY_CONTACT_SIZE_MAX_PX = 100;

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

export function inputFidelity(input = {}) {
  const checks = {
    trustedTouch: input.kinds === 'touch' && input.trust?.share === 1,
    cadence:
      input.movesPerSecond >= FIDELITY_MOVES_PER_SECOND_MIN &&
      input.movesPerSecond <= FIDELITY_MOVES_PER_SECOND_MAX &&
      input.moveGapP95Ms <= FIDELITY_MOVE_GAP_P95_MAX_MS,
    coalescing: input.coalescedPerMove === 0,
    pressure: input.pressure?.p50 === 0,
    contactGeometry:
      input.contactWidth?.p50 >= FIDELITY_CONTACT_SIZE_MIN_PX &&
      input.contactWidth?.p50 <= FIDELITY_CONTACT_SIZE_MAX_PX &&
      input.contactHeight?.p50 >= FIDELITY_CONTACT_SIZE_MIN_PX &&
      input.contactHeight?.p50 <= FIDELITY_CONTACT_SIZE_MAX_PX,
  };
  return { passed: Object.values(checks).every(Boolean), checks };
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
const CACHE_EVICTION_DEADLINE_MS = 5_000;

// What this guard is actually for is a service worker serving an earlier build's
// assets. That needs a worker: with no registrations and no controller, no cache
// entry can reach the page, so an unreachable CacheStorage cannot hide a stale
// bundle and the capture is safe to continue. A page that *is* controlled has to
// evict, and still fails closed.
export function cacheEvictionAcceptable(state) {
  if (!state?.ok) return false;
  if (state.cachesCleared) return true;
  return state.registrations === 0 && !state.controlled;
}

export async function clearDeviceWebCache(executeAsync) {
  const state = await executeAsync(`
    const done = arguments[arguments.length - 1];
    const withDeadline = (promise) =>
      Promise.race([
        promise.then(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), ${CACHE_EVICTION_DEADLINE_MS})),
      ]);
    const registrations = 'serviceWorker' in navigator
      ? navigator.serviceWorker.getRegistrations().catch(() => [])
      : Promise.resolve([]);
    registrations.then((found) =>
      Promise.all(found.map((registration) => registration.unregister().catch(() => false)))
        .then(() =>
          'caches' in window
            ? withDeadline(caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))))
            : true
        )
        .then((cachesCleared) =>
          done({
            ok: true,
            registrations: found.length,
            controlled: Boolean(navigator.serviceWorker && navigator.serviceWorker.controller),
            cachesCleared,
          })
        )
    ).catch((error) => done({ ok: false, message: String(error) }));
  `);
  if (!cacheEvictionAcceptable(state)) {
    throw new Error(
      `Could not clear the device web cache: ${
        state?.ok
          ? `CacheStorage did not answer within ${CACHE_EVICTION_DEADLINE_MS} ms and the page is controlled by a service worker, so a stale bundle cannot be ruled out`
          : state?.message
      }`
    );
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
        'native-webview-class',
        'brush',
        'gesture-repeats',
        'repeat-pause-ms',
        'undo-count',
        'undo-pause-ms',
        'history-settle-ms',
        'rotate-before-undo',
        'label',
        'output',
        'report-only',
        'no-serve',
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
  const cleanup = () => {
    cleanupPromise ??= (async () => {
      if (sessionId && originalOrientation) {
        await client
          .request('POST', `/session/${sessionId}/orientation`, {
            orientation: originalOrientation,
          })
          .catch(() => {});
      }
      if (sessionId && execute && restoreNativeRotationLock) {
        await switchToWebContext(client, sessionId).catch(() => null);
        await setNativeRotationLock(execute, true).catch(() => null);
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
    server = nativeApp ? null : await ensurePreviewServer(requestedAppUrl, port, !has('no-serve'));
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
        ).catch(() => false),
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
            ).catch(() => false),
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
            .catch(() => false),
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
        ).catch(() => false),
      WEBVIEW_READY_TIMEOUT_MS,
      WEBVIEW_READY_POLL_MS
    );
    if (!ready) throw new Error(`${loadedUrl} never showed a sized #drawingCanvas`);
    await clearDeviceWebCache(executeAsync);
    const serviceWorkerRegistration = await blockServiceWorkerRegistrationForMeasurement(execute);
    await ensureCampaignTheme(execute, requestedTheme);
    const theme = await readResolvedTheme(execute);
    if (undoCount > 0) {
      const debugReady = await pollUntil(
        () => execute('return !!window.__drawingDebug?.getUndoDebug;').catch(() => false),
        BRUSH_SELECT_TIMEOUT_MS,
        WEBVIEW_READY_POLL_MS
      );
      if (!debugReady) throw new Error('The production route did not expose __drawingDebug');
    }

    if (brush !== 'pen') {
      await execute(
        `document.querySelector('button[aria-label="Expand controls"]')?.click(); return true;`
      );
      const drawerReady = await pollUntil(
        () => execute(`return !!document.querySelector('#brushButton');`).catch(() => false),
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
    if (brush === 'eraser') {
      await execute(`
        for (const canvas of document.querySelectorAll('canvas[data-live-tile]')) {
          const context = canvas.getContext('2d');
          context.save();
          context.setTransform(1, 0, 0, 1, 0, 0);
          context.fillStyle = '#7c4dff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.restore();
        }
        return true;
      `);
      await sleep(AFTER_GESTURE_SETTLE_MS);
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
      .catch(() => nativeWindow);
    const orientation = await client.request('GET', `/session/${sessionId}/orientation`);
    const canvasBounds = nativeCanvasBounds({
      webGeometry,
      webViewBounds,
      nativeWindow,
      includeBrowserChrome: !nativeApp,
    });

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
    await client.request('POST', `/session/${sessionId}/context`, { name: webContext });
    await sleep(AFTER_GESTURE_SETTLE_MS);
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
        () => execute(UNDO_BUTTON_READY_SOURCE).catch(() => false),
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

    const report = await execute('return window.__probe.finish();');
    const counts = report.meta.counts;
    report.frames = await readTable(execute, 'frames', counts.frames);
    report.events = await readTable(execute, 'events', counts.events);
    report.measures = await readTable(execute, 'measures', counts.measures);
    await execute('return window.__probe.stop();');

    const summaries = summarizeRun(report);
    const drawing = scoreDrawingRun(summaries.phases);
    const undo = summarizeUndoActions(undoActions, report.frames);
    const input = summaries.phases[0]?.input ?? {};
    const fidelity = inputFidelity(input);
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
      transport: nativeApp ? 'native-capacitor-webview' : 'browser',
      theme,
      mode: `xcuitest:${label}`,
      automation: {
        appiumUrl: flag('appium-url', DEFAULT_APPIUM_URL),
        orientation,
        loadedUrl,
        webGeometry,
        webViewBounds,
        nativeWindow,
        canvasBounds,
        liveSurfaceTopology,
        gestureRepeats,
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

    console.log(`\nObserved frame beat: ${summaries.intervalMs} ms`);
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
