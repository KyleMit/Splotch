import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT, fail, isMain, pollUntil, runMain, sleep } from '../lib/proc.mjs';
import { parsePerfArgs } from './args.mjs';
import { probeConfigScript } from './ipad-frames.mjs';
import { ensurePreviewServer, resolveDeviceUrl } from './ipad-session.mjs';
import { profilePath } from './paths.mjs';
import {
  engineRows,
  inputRows,
  pacingRows,
  starvationRows,
  summarizeRun,
} from './real-screen-stats.mjs';

const APP_PATH = '/';
const PROBE_FILE = join(ROOT, 'scripts', 'perf', 'real-screen-probe.js');
const DEFAULT_APPIUM_URL = 'http://127.0.0.1:4723';
const DEFAULT_XCODE_CONFIG = join(ROOT, 'ios', 'local.xcconfig');
const DEFAULT_WDA_BUNDLE_ID = 'art.splotch.WebDriverAgentRunner';
const WEBVIEW_READY_TIMEOUT_MS = 30_000;
const WEBVIEW_READY_POLL_MS = 250;
const WDA_LAUNCH_TIMEOUT_MS = 180_000;
const WDA_STARTUP_RETRIES = 1;
const PROBE_CONTACT_BUDGET_MS = 60_000;
const AFTER_GESTURE_SETTLE_MS = 500;
const TABLE_CHUNK_ROWS = 2_000;
const BRUSH_SELECT_TIMEOUT_MS = 10_000;
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

export function nativeCanvasBounds({ webGeometry, webViewBounds, nativeWindow }) {
  const scale = webViewBounds.width / webGeometry.viewport.width;
  const browserChromeHeight = Math.max(
    0,
    nativeWindow.height - webGeometry.viewport.height * scale
  );
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
}) {
  return {
    browserName: 'Safari',
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:udid': deviceId,
    'appium:xcodeConfigFile': xcodeConfigFile,
    'appium:updatedWDABundleId': wdaBundleId,
    'appium:wdaLaunchTimeout': WDA_LAUNCH_TIMEOUT_MS,
    'appium:wdaStartupRetries': WDA_STARTUP_RETRIES,
    'appium:safariInitialUrl': 'about:blank',
    ...(allowProvisioning ? { 'appium:allowProvisioningDeviceRegistration': true } : {}),
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

function createWebDriverClient(baseUrl) {
  const url = baseUrl.replace(/\/+$/, '');
  const request = async (method, path, body) => {
    let response;
    try {
      response = await fetch(`${url}${path}`, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
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
        'brush',
        'gesture-repeats',
        'repeat-pause-ms',
        'label',
        'output',
        'no-serve',
      ],
    },
    argv
  );
  const deviceId = flag('device-id');
  if (!deviceId) fail('Pass the physical iPad UDID with --device-id=');
  const xcodeConfigFile = flag('xcode-config', DEFAULT_XCODE_CONFIG);
  if (!existsSync(xcodeConfigFile)) {
    fail(
      `No signing config at ${xcodeConfigFile}. Create ios/local.xcconfig with ` +
        'DEVELOPMENT_TEAM = <your Apple team id>.'
    );
  }

  const appUrl = resolveDeviceUrl(flag('url'), port, APP_PATH);
  const gestureRepeats = Number.parseInt(flag('gesture-repeats', '1'), 10);
  if (!Number.isSafeInteger(gestureRepeats) || gestureRepeats < 1) {
    fail('--gesture-repeats must be a positive integer');
  }
  const repeatPauseMs = Number.parseInt(flag('repeat-pause-ms', '0'), 10);
  if (!Number.isSafeInteger(repeatPauseMs) || repeatPauseMs < 0) {
    fail('--repeat-pause-ms must be a non-negative integer');
  }
  const server = await ensurePreviewServer(appUrl, port, !has('no-serve'));
  const client = createWebDriverClient(flag('appium-url', DEFAULT_APPIUM_URL));
  let sessionId;
  try {
    await client.request('GET', '/status');
    const session = await client.request('POST', '/session', {
      capabilities: {
        alwaysMatch: appiumCapabilities({
          deviceId,
          xcodeConfigFile,
          wdaBundleId: flag('wda-bundle-id', DEFAULT_WDA_BUNDLE_ID),
          allowProvisioning: has('allow-provisioning'),
        }),
      },
    });
    sessionId = session.sessionId;
    const execute = (script, args = []) =>
      client.request('POST', `/session/${sessionId}/execute/sync`, { script, args });

    await client.request('POST', `/session/${sessionId}/url`, { url: appUrl });
    const ready = await pollUntil(
      () =>
        execute(
          "const canvas = document.querySelector('#drawingCanvas'); return !!canvas && canvas.width > 0;"
        ).catch(() => false),
      WEBVIEW_READY_TIMEOUT_MS,
      WEBVIEW_READY_POLL_MS
    );
    if (!ready) throw new Error(`${appUrl} never showed a sized #drawingCanvas`);

    const brush = flag('brush', 'pen');
    const brushSelector = BRUSH_BUTTON_BY_MODE[brush];
    if (!brushSelector) {
      fail(`--brush must be one of ${Object.keys(BRUSH_BUTTON_BY_MODE).join(', ')}`);
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
    await execute(`${readFileSync(PROBE_FILE, 'utf8')}\nreturn !!window.__probe;`);

    const webGeometry = await execute(
      "const r = document.querySelector('#drawingCanvas').getBoundingClientRect(); return {canvas:{x:r.x,y:r.y,width:r.width,height:r.height},viewport:{width:innerWidth,height:innerHeight}};"
    );
    const contexts = await client.request('GET', `/session/${sessionId}/contexts`);
    const webContext = contexts.find((context) => context.startsWith('WEBVIEW'));
    if (!webContext) throw new Error(`Appium reported no WEBVIEW context: ${contexts.join(', ')}`);

    await client.request('POST', `/session/${sessionId}/context`, { name: 'NATIVE_APP' });
    const webView = await client.request('POST', `/session/${sessionId}/element`, {
      using: 'class name',
      value: 'XCUIElementTypeWebView',
    });
    const webViewId = webView['element-6066-11e4-a52e-4f735466cecf'] ?? webView.ELEMENT;
    const webViewBounds = await client.request(
      'GET',
      `/session/${sessionId}/element/${webViewId}/rect`
    );
    const nativeWindow = await client.request('GET', `/session/${sessionId}/window/rect`);
    const orientation = await client.request('GET', `/session/${sessionId}/orientation`);
    const canvasBounds = nativeCanvasBounds({ webGeometry, webViewBounds, nativeWindow });

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

    const report = await execute('return window.__probe.finish();');
    const counts = report.meta.counts;
    report.frames = await readTable(execute, 'frames', counts.frames);
    report.events = await readTable(execute, 'events', counts.events);
    report.measures = await readTable(execute, 'measures', counts.measures);
    await execute('return window.__probe.stop();');

    const summaries = summarizeRun(report);
    const input = summaries.phases[0]?.input ?? {};
    const fidelity = inputFidelity(input);
    const label = sanitizeLabel(flag('label', brush));
    const output = flag('output') ?? join(profilePath('ipad-xcuitest', label), 'real-screen.json');
    mkdirSync(dirname(output), { recursive: true });
    const artifact = {
      device: {
        name: session.capabilities?.deviceName ?? 'iPad',
        os: session.capabilities?.platformVersion ?? 'unknown',
        id: deviceId,
      },
      appUrl,
      mode: `xcuitest:${label}`,
      automation: {
        appiumUrl: flag('appium-url', DEFAULT_APPIUM_URL),
        orientation,
        webGeometry,
        webViewBounds,
        nativeWindow,
        canvasBounds,
        gestureRepeats,
        repeatPauseMs,
      },
      fidelity,
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
    console.log(
      `\nFidelity: ${fidelity.passed ? 'PASS' : 'FAIL'} · ${JSON.stringify(fidelity.checks)}`
    );
    console.log(`Wrote ${output}`);
    if (!fidelity.passed) {
      throw new Error(
        'The capture failed the trusted-input fidelity gate; do not use its lag score.'
      );
    }
    return artifact;
  } finally {
    if (sessionId) {
      await client.request('DELETE', `/session/${sessionId}`).catch(() => {});
    }
    server?.stop();
  }
}

if (isMain(import.meta.url)) runMain(runIpadXcuitest);
