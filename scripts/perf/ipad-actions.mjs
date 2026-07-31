import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT, fail, isMain, pollUntil, runMain, sleep } from '../lib/proc.mjs';
import { actionFailures, actionRows, summarizeActions } from './action-stats.mjs';
import { parsePerfArgs } from './args.mjs';
import {
  appiumCapabilities,
  clearDeviceWebCache,
  createWebDriverClient,
  nativeCanvasBounds,
} from './ipad-xcuitest.mjs';
import { ensurePreviewServer, resolveDeviceUrl } from './ipad-session.mjs';
import { profilePath } from './paths.mjs';

const APP_PATH = '/';
const ACTION_PROBE_FILE = join(ROOT, 'scripts', 'perf', 'action-probe.js');
const DEFAULT_APPIUM_URL = 'http://127.0.0.1:4723';
const DEFAULT_XCODE_CONFIG = join(ROOT, 'ios', 'local.xcconfig');
const DEFAULT_WDA_BUNDLE_ID = 'art.splotch.WebDriverAgentRunner';
const READY_TIMEOUT_MS = 30_000;
const POLL_MS = 50;
const SCRIPT_TIMEOUT_MS = 45_000;
const ACTION_SETTLE_MS = 650;
const ANIMATED_ACTION_SETTLE_MS = 1_100;
const REPEAT_SETTLE_MS = 500;
const TRUSTED_STROKE_MS = 650;
const CLEAR_DRAG_MS = 450;
const ROTATION_NATIVE_SETTLE_MS = 1_500;
const ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf';
const ALL_ACTIONS = new Set([
  'drawer',
  'palette',
  'brushes',
  'stroke-width',
  'parent-center',
  'parent-sections',
  'theme',
  'coloring',
  'screenshot',
  'undo',
  'clear',
  'rotation',
]);

function positiveInteger(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) fail(`--${name} must be a positive integer`);
  return parsed;
}

function selectedActions(value) {
  if (!value) return ALL_ACTIONS;
  const actions = new Set(value.split(',').filter(Boolean));
  const unknown = [...actions].filter((action) => !ALL_ACTIONS.has(action));
  if (unknown.length) fail(`Unknown --actions entries: ${unknown.join(', ')}`);
  return actions;
}

function capabilitiesFromFile(path) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  return parsed.capabilities?.alwaysMatch ?? parsed.alwaysMatch ?? parsed;
}

function sessionCapabilities({ deviceId, xcodeConfigFile, wdaBundleId, allowProvisioning, file }) {
  if (file) return capabilitiesFromFile(file);
  if (!deviceId) fail('Pass --device-id= for a local iPad or --capabilities-file= for a cloud one');
  if (!existsSync(xcodeConfigFile)) {
    fail(
      `No signing config at ${xcodeConfigFile}. Create ios/local.xcconfig with ` +
        'DEVELOPMENT_TEAM = <your Apple team id>.'
    );
  }
  return appiumCapabilities({
    deviceId,
    xcodeConfigFile,
    wdaBundleId,
    allowProvisioning,
  });
}

function profilingUrl(appUrl, repeat) {
  const url = new URL(appUrl);
  url.searchParams.set('perf-actions', `${Date.now()}-${repeat}`);
  return url.toString();
}

async function waitForReady(execute, expression, hint, timeoutMs = READY_TIMEOUT_MS) {
  const readyAt = await pollUntil(
    () => execute(`return (${expression}) ? performance.now() : null;`).catch(() => null),
    timeoutMs,
    POLL_MS
  );
  if (!readyAt) throw new Error(`Timed out waiting for ${hint}`);
  return readyAt;
}

async function clickWebElement(client, sessionId, selector) {
  const result = await client.request('POST', `/session/${sessionId}/element`, {
    using: 'css selector',
    value: selector,
  });
  const elementId = result[ELEMENT_KEY] ?? result.ELEMENT;
  await client.request('POST', `/session/${sessionId}/element/${elementId}/click`);
}

async function measureClick({
  client,
  sessionId,
  execute,
  label,
  selector,
  ready,
  readyHint,
  settleMs = ACTION_SETTLE_MS,
  eventTypes,
  activation = 'native',
}) {
  const nativeTarget =
    activation === 'native'
      ? await nativeBoundsForSelector(client, sessionId, execute, selector)
      : null;
  await execute(
    `return window.__actionProbe.begin(${JSON.stringify(label)}, ${JSON.stringify(
      selector
    )}, ${JSON.stringify(eventTypes ?? ['pointerup', 'click'])});`
  );
  if (nativeTarget) {
    const x = Math.round(nativeTarget.bounds.x + nativeTarget.bounds.width / 2);
    const y = Math.round(nativeTarget.bounds.y + nativeTarget.bounds.height / 2);
    await performNativeGesture(client, sessionId, nativeTarget.webContext, [
      { type: 'pointerMove', duration: 0, origin: 'viewport', x, y },
      { type: 'pointerDown', button: 0 },
      { type: 'pause', duration: 80 },
      { type: 'pointerUp', button: 0 },
    ]);
  } else {
    await clickWebElement(client, sessionId, selector);
  }
  let readyAt;
  try {
    readyAt = await waitForReady(execute, ready, readyHint ?? label);
  } catch (error) {
    const state = await execute(`
      const target = document.querySelector(${JSON.stringify(selector)});
      const rect = target?.getBoundingClientRect();
      return {
        target: target ? {
          tag: target.tagName,
          text: target.textContent?.trim(),
          connected: target.isConnected,
          rect: rect && { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        } : null,
        dialogs: [...document.querySelectorAll('dialog')].map((dialog) => ({
          id: dialog.id,
          open: dialog.open
        })),
        overlay: {
          hidden: document.querySelector('#coloringOverlay')?.hidden,
          src: document.querySelector('#coloringOverlay')?.getAttribute('src'),
          ready: document.querySelector('#coloringOverlay')?.classList.contains('overlay-ready')
        }
      };
    `);
    throw new Error(`${error.message}\nAction state: ${JSON.stringify(state)}`, {
      cause: error,
    });
  }
  await sleep(settleMs);
  return execute(`return window.__actionProbe.finish(${readyAt});`);
}

async function ensureState(execute, condition, activation) {
  if (await execute(`return !!(${condition});`)) return;
  await execute(`${activation}; return true;`);
  await waitForReady(execute, condition, condition);
  await sleep(ACTION_SETTLE_MS);
}

async function closeDialogs(execute) {
  await execute(`
    for (const dialog of document.querySelectorAll('dialog[open]')) {
      dialog.querySelector('button[aria-label="Close"]')?.click();
    }
    return true;
  `);
  await sleep(ACTION_SETTLE_MS);
}

async function nativeBoundsForSelector(client, sessionId, execute, selector) {
  const webGeometry = await execute(`
    const rect = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect();
    if (!rect) return null;
    return {
      canvas: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      viewport: { width: innerWidth, height: innerHeight }
    };
  `);
  if (!webGeometry) throw new Error(`No native-gesture target matches ${selector}`);
  const contexts = await client.request('GET', `/session/${sessionId}/contexts`);
  const webContext = contexts.find((context) => context.startsWith('WEBVIEW'));
  await client.request('POST', `/session/${sessionId}/context`, { name: 'NATIVE_APP' });
  const webView = await client.request('POST', `/session/${sessionId}/element`, {
    using: 'class name',
    value: 'XCUIElementTypeWebView',
  });
  const webViewId = webView[ELEMENT_KEY] ?? webView.ELEMENT;
  const webViewBounds = await client.request(
    'GET',
    `/session/${sessionId}/element/${webViewId}/rect`
  );
  const nativeWindow = await client.request('GET', `/session/${sessionId}/window/rect`);
  const bounds = nativeCanvasBounds({ webGeometry, webViewBounds, nativeWindow });
  await client.request('POST', `/session/${sessionId}/context`, { name: webContext });
  return { bounds, nativeWindow, webContext };
}

async function nativeAccessibilityBounds(client, sessionId, name) {
  const contexts = await client.request('GET', `/session/${sessionId}/contexts`);
  const webContext = contexts.find((context) => context.startsWith('WEBVIEW'));
  await client.request('POST', `/session/${sessionId}/context`, { name: 'NATIVE_APP' });
  try {
    const element = await client.request('POST', `/session/${sessionId}/element`, {
      using: 'accessibility id',
      value: name,
    });
    const elementId = element[ELEMENT_KEY] ?? element.ELEMENT;
    const bounds = await client.request('GET', `/session/${sessionId}/element/${elementId}/rect`);
    const nativeWindow = await client.request('GET', `/session/${sessionId}/window/rect`);
    return { bounds, nativeWindow, webContext };
  } finally {
    await client.request('POST', `/session/${sessionId}/context`, { name: webContext });
  }
}

async function performNativeGesture(client, sessionId, webContext, actions) {
  await client.request('POST', `/session/${sessionId}/context`, { name: 'NATIVE_APP' });
  await client.request('POST', `/session/${sessionId}/actions`, {
    actions: [
      {
        type: 'pointer',
        id: 'action-finger',
        parameters: { pointerType: 'touch' },
        actions,
      },
    ],
  });
  await client.request('POST', `/session/${sessionId}/context`, { name: webContext });
}

async function addTrustedStroke(client, sessionId, execute) {
  const { bounds, webContext } = await nativeBoundsForSelector(
    client,
    sessionId,
    execute,
    '#drawingCanvas'
  );
  const x = Math.round(bounds.x + bounds.width * 0.24);
  const y = Math.round(bounds.y + bounds.height * 0.38);
  await performNativeGesture(client, sessionId, webContext, [
    { type: 'pointerMove', duration: 0, origin: 'viewport', x, y },
    { type: 'pointerDown', button: 0 },
    {
      type: 'pointerMove',
      duration: TRUSTED_STROKE_MS,
      origin: 'viewport',
      x: Math.round(x + bounds.width * 0.42),
      y: Math.round(y + bounds.height * 0.16),
    },
    { type: 'pointerUp', button: 0 },
  ]);
  await waitForReady(
    execute,
    `document.querySelector('#undoButton')?.getAttribute('aria-disabled') === 'false'`,
    'the trusted stroke to enter undo history'
  );
  await sleep(ACTION_SETTLE_MS);
}

async function measureClear(client, sessionId, execute, label = 'clear drawing') {
  const { bounds, nativeWindow, webContext } = await nativeAccessibilityBounds(
    client,
    sessionId,
    'Clear drawing'
  ).catch(() => nativeBoundsForSelector(client, sessionId, execute, '#clearButton'));
  const startX = Math.round(bounds.x + bounds.width / 2);
  const startY = Math.round(bounds.y + bounds.height / 2);
  const distance = Math.min(nativeWindow.width, nativeWindow.height) * 0.48;
  const endX = Math.max(20, Math.round(startX - distance * 0.72));
  const endY = Math.min(nativeWindow.height - 20, Math.round(startY + distance * 0.72));
  await execute(
    `return window.__actionProbe.begin(${JSON.stringify(label)}, '#clearButton', ['pointerdown']);`
  );
  await performNativeGesture(client, sessionId, webContext, [
    { type: 'pointerMove', duration: 0, origin: 'viewport', x: startX, y: startY },
    { type: 'pointerDown', button: 0 },
    {
      type: 'pointerMove',
      duration: CLEAR_DRAG_MS,
      origin: 'viewport',
      x: endX,
      y: endY,
    },
    { type: 'pointerUp', button: 0 },
  ]);
  let readyAt;
  try {
    readyAt = await waitForReady(
      execute,
      `document.querySelector('#screenshotButton')?.disabled === true`,
      'clear to empty the drawing',
      5_000
    );
  } catch (error) {
    const state = await execute(`
      const button = document.querySelector('#clearButton');
      const rect = button?.getBoundingClientRect();
      return {
        nativeBounds: ${JSON.stringify(bounds)},
        nativeWindow: ${JSON.stringify(nativeWindow)},
        end: { x: ${endX}, y: ${endY} },
        button: {
          rect: rect && { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          classes: button?.className
        },
        progress: getComputedStyle(document.documentElement).getPropertyValue('--clear-progress'),
        undoDisabled: document.querySelector('#undoButton')?.getAttribute('aria-disabled'),
        action: window.__actionProbe.finish(performance.now())
      };
    `);
    throw new Error(`${error.message}\nClear state: ${JSON.stringify(state)}`, {
      cause: error,
    });
  }
  await sleep(ANIMATED_ACTION_SETTLE_MS);
  return execute(`return window.__actionProbe.finish(${readyAt});`);
}

async function measureRotation(client, sessionId, execute, from, to, label) {
  await execute(
    `return window.__actionProbe.beginExternal(${JSON.stringify(label)}, ['orientationchange', 'resize']);`
  );
  await client.request('POST', `/session/${sessionId}/context`, { name: 'NATIVE_APP' });
  await client.request('POST', `/session/${sessionId}/orientation`, { orientation: to });
  await sleep(ROTATION_NATIVE_SETTLE_MS);
  const contexts = await client.request('GET', `/session/${sessionId}/contexts`);
  const webContext = contexts.find((context) => context.startsWith('WEBVIEW'));
  await client.request('POST', `/session/${sessionId}/context`, { name: webContext });
  const readyAt = await waitForReady(
    execute,
    to === 'PORTRAIT' ? 'innerHeight > innerWidth' : 'innerWidth > innerHeight',
    `${from} to ${to} rotation`,
    READY_TIMEOUT_MS
  );
  await sleep(ANIMATED_ACTION_SETTLE_MS);
  return execute(`return window.__actionProbe.finish(${readyAt});`);
}

async function runActionSweep({ client, sessionId, execute, actions, originalOrientation }) {
  const samples = [];
  const record = async (promise) => samples.push(await promise);

  if (actions.has('drawer')) {
    await ensureState(
      execute,
      `!document.documentElement.hasAttribute('data-drawer-open')`,
      `document.querySelector('button[aria-label="Collapse controls"]')?.click()`
    );
    await record(
      measureClick({
        client,
        sessionId,
        execute,
        label: 'expand action drawer',
        selector: 'button[aria-label="Expand controls"]',
        ready: `document.documentElement.hasAttribute('data-drawer-open')`,
      })
    );
    await record(
      measureClick({
        client,
        sessionId,
        execute,
        label: 'collapse action drawer',
        selector: 'button[aria-label="Collapse controls"]',
        ready: `!document.documentElement.hasAttribute('data-drawer-open')`,
      })
    );
  }

  await ensureState(
    execute,
    `document.documentElement.hasAttribute('data-drawer-open')`,
    `document.querySelector('button[aria-label="Expand controls"]')?.click()`
  );

  if (actions.has('palette')) {
    const color = await execute(
      `return document.querySelector('.color-swatch:not(.active):not(.gradient-swatch)')?.dataset.color;`
    );
    const selector = `.color-swatch[data-color=${JSON.stringify(color)}]`;
    await record(
      measureClick({
        client,
        sessionId,
        execute,
        label: 'change ink color',
        selector,
        ready: `document.querySelector(${JSON.stringify(selector)})?.classList.contains('active') === true`,
      })
    );
  }

  if (actions.has('brushes')) {
    await record(
      measureClick({
        client,
        sessionId,
        execute,
        label: 'open brush menu',
        selector: '#brushButton',
        ready: `document.querySelector('#brushButton')?.getAttribute('aria-expanded') === 'true'`,
      })
    );
    const brushSelections = [
      {
        label: 'select crayon brush',
        selector: '#crayonBrushButton',
        ready: `document.documentElement.dataset.brush === 'crayon'`,
      },
      {
        label: 'select Magic brush',
        selector: '#magicBrushButton',
        ready: `document.documentElement.dataset.brush === 'magic'`,
      },
      {
        label: 'select eraser',
        selector: '#eraserButton',
        ready: `document.documentElement.dataset.brush === 'eraser'`,
      },
      {
        label: 'select pen brush',
        selector: '#penBrushButton',
        ready: `!document.documentElement.hasAttribute('data-brush')`,
      },
    ];
    for (const [index, selection] of brushSelections.entries()) {
      if (index > 0) {
        await execute(`document.querySelector('#brushButton')?.click(); return true;`);
        await waitForReady(
          execute,
          `document.querySelector('#brushButton')?.getAttribute('aria-expanded') === 'true'`,
          'brush menu to reopen'
        );
      }
      await record(
        measureClick({
          client,
          sessionId,
          execute,
          ...selection,
        })
      );
    }
  }

  if (actions.has('stroke-width')) {
    await record(
      measureClick({
        client,
        sessionId,
        execute,
        label: 'open stroke-width menu',
        selector: '#strokeWidthButton',
        ready: `document.querySelector('#strokeWidthButton')?.getAttribute('aria-expanded') === 'true'`,
      })
    );
    await record(
      measureClick({
        client,
        sessionId,
        execute,
        label: 'change stroke width',
        selector: '.stroke-width-menu button[aria-pressed="false"]',
        ready: `document.querySelector('.stroke-width-menu button[aria-pressed="true"]') !== null && document.querySelector('#strokeWidthButton')?.getAttribute('aria-expanded') === 'false'`,
      })
    );
  }

  if (actions.has('parent-center') || actions.has('parent-sections') || actions.has('theme')) {
    await closeDialogs(execute);
    await record(
      measureClick({
        client,
        sessionId,
        execute,
        label: 'open Parent Center',
        selector: 'button[aria-label="Parent Center"]',
        ready: `document.querySelector('#parentHelpModal')?.open === true`,
        settleMs: ANIMATED_ACTION_SETTLE_MS,
      })
    );
  }

  if (actions.has('parent-sections')) {
    const sectionCount = await execute(
      `return document.querySelectorAll('#parentHelpModal .pc-nav-item').length;`
    );
    for (let index = 2; index <= sectionCount; index++) {
      const selector = `#parentHelpModal .pc-nav-item:nth-child(${index})`;
      const label = await execute(
        `return document.querySelector(${JSON.stringify(selector)})?.textContent?.trim();`
      );
      await record(
        measureClick({
          client,
          sessionId,
          execute,
          label: `open Parent Center section: ${label}`,
          selector,
          ready: `document.querySelector(${JSON.stringify(selector)})?.getAttribute('aria-current') === 'page'`,
          activation: 'webdriver',
        })
      );
    }
    await execute(`document.querySelector('#parentHelpModal .pc-nav-item')?.click(); return true;`);
    await waitForReady(
      execute,
      `document.querySelector('#themeOption-light') !== null`,
      'Appearance section'
    );
  }

  if (actions.has('theme')) {
    await execute(`document.querySelector('#themeOption-dark')?.click(); return true;`);
    await waitForReady(
      execute,
      `document.documentElement.dataset.theme === 'dark'`,
      'dark theme preparation'
    );
    await sleep(ACTION_SETTLE_MS);
    await record(
      measureClick({
        client,
        sessionId,
        execute,
        label: 'switch dark theme to light',
        selector: '#themeOption-light',
        ready: `document.documentElement.dataset.theme === 'light'`,
        settleMs: ANIMATED_ACTION_SETTLE_MS,
        activation: 'webdriver',
      })
    );
    await record(
      measureClick({
        client,
        sessionId,
        execute,
        label: 'switch light theme to dark',
        selector: '#themeOption-dark',
        ready: `document.documentElement.dataset.theme === 'dark'`,
        settleMs: ANIMATED_ACTION_SETTLE_MS,
        activation: 'webdriver',
      })
    );
  }

  if (actions.has('parent-center') || actions.has('parent-sections') || actions.has('theme')) {
    await record(
      measureClick({
        client,
        sessionId,
        execute,
        label: 'close Parent Center',
        selector: '#parentHelpModal button[aria-label="Close"]',
        ready: `document.querySelector('#parentHelpModal')?.open !== true`,
        settleMs: ANIMATED_ACTION_SETTLE_MS,
        activation: 'webdriver',
      })
    );
  }

  if (actions.has('coloring')) {
    await record(
      measureClick({
        client,
        sessionId,
        execute,
        label: 'open coloring books',
        selector: '#coloringBookButton',
        ready: `document.querySelector('#coloring-book-dialog')?.open === true`,
        settleMs: ANIMATED_ACTION_SETTLE_MS,
      })
    );
    await record(
      measureClick({
        client,
        sessionId,
        execute,
        label: 'open coloring book',
        selector: '#coloring-book-dialog button[aria-label$="coloring book"]',
        ready: `document.querySelector('#coloring-book-dialog button[aria-label$="coloring page"]') !== null`,
        settleMs: ANIMATED_ACTION_SETTLE_MS,
        activation: 'webdriver',
      })
    );
    await record(
      measureClick({
        client,
        sessionId,
        execute,
        label: 'select coloring page',
        selector: '#coloring-book-dialog button[aria-label$="coloring page"]',
        ready: `document.querySelector('#coloring-book-dialog')?.open !== true && document.querySelector('#coloringOverlay')?.classList.contains('overlay-ready')`,
        settleMs: ANIMATED_ACTION_SETTLE_MS,
        activation: 'webdriver',
      })
    );
    await execute(`document.querySelector('#coloringBookButton')?.click(); return true;`);
    await waitForReady(
      execute,
      `document.querySelector('#coloring-book-dialog')?.open === true`,
      'coloring books to reopen'
    );
    await record(
      measureClick({
        client,
        sessionId,
        execute,
        label: 'clear coloring page',
        selector: '#coloring-book-dialog button[aria-label="Clear Page"]',
        ready: `document.querySelector('#coloring-book-dialog')?.open !== true && document.querySelector('#coloringOverlay')?.hidden === true`,
        settleMs: ANIMATED_ACTION_SETTLE_MS,
        activation: 'webdriver',
      })
    );
  }

  if (actions.has('screenshot') || actions.has('undo') || actions.has('clear')) {
    await addTrustedStroke(client, sessionId, execute);
  }

  if (actions.has('screenshot')) {
    await execute(`
      window.__actionDownloadReadyAt = null;
      window.__actionOriginalAnchorClick ??= HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        window.__actionDownloadReadyAt = performance.now();
      };
      return true;
    `);
    await record(
      measureClick({
        client,
        sessionId,
        execute,
        label: 'save screenshot',
        selector: '#screenshotButton',
        ready: `Number.isFinite(window.__actionDownloadReadyAt)`,
        settleMs: ANIMATED_ACTION_SETTLE_MS,
      })
    );
    await execute(`
      HTMLAnchorElement.prototype.click = window.__actionOriginalAnchorClick;
      delete window.__actionOriginalAnchorClick;
      return true;
    `);
  }

  if (actions.has('undo')) {
    await record(
      measureClick({
        client,
        sessionId,
        execute,
        label: 'undo latest stroke',
        selector: '#undoButton',
        ready: `document.querySelector('#undoButton')?.getAttribute('aria-disabled') === 'true'`,
        settleMs: ANIMATED_ACTION_SETTLE_MS,
      })
    );
  }

  if (actions.has('clear')) {
    if (
      await execute(
        `return document.querySelector('#undoButton')?.getAttribute('aria-disabled') === 'true';`
      )
    ) {
      await addTrustedStroke(client, sessionId, execute);
    }
    await record(measureClear(client, sessionId, execute));
  }

  if (actions.has('rotation')) {
    const canvasEmpty = await execute(
      `return document.querySelector('#screenshotButton')?.disabled === true;`
    );
    if (canvasEmpty && actions.has('clear')) {
      const current = await client.request('GET', `/session/${sessionId}/orientation`);
      const other = current === 'LANDSCAPE' ? 'PORTRAIT' : 'LANDSCAPE';
      await record(
        measureRotation(
          client,
          sessionId,
          execute,
          current,
          other,
          `empty after clear: ${current} to ${other} rotation`
        )
      );
      await record(
        measureClick({
          client,
          sessionId,
          execute,
          label: 'undo clear after blank rotation',
          selector: '#undoButton',
          ready: `document.querySelector('#screenshotButton')?.disabled === false`,
          settleMs: ANIMATED_ACTION_SETTLE_MS,
        })
      );
      await record(
        measureClick({
          client,
          sessionId,
          execute,
          label: 'undo restored stroke after blank rotation',
          selector: '#undoButton',
          ready: `document.querySelector('#screenshotButton')?.disabled === true`,
          settleMs: ANIMATED_ACTION_SETTLE_MS,
        })
      );
      await addTrustedStroke(client, sessionId, execute);
      await record(
        measureClear(client, sessionId, execute, 'clear restored drawing after blank rotation')
      );
      await record(
        measureRotation(
          client,
          sessionId,
          execute,
          other,
          originalOrientation,
          `empty after clear: ${other} to ${originalOrientation} rotation`
        )
      );
    }
    if (canvasEmpty) {
      await addTrustedStroke(client, sessionId, execute);
    }
    const current = await client.request('GET', `/session/${sessionId}/orientation`);
    const other = current === 'LANDSCAPE' ? 'PORTRAIT' : 'LANDSCAPE';
    await record(
      measureRotation(
        client,
        sessionId,
        execute,
        current,
        other,
        `with ink: ${current} to ${other} rotation`
      )
    );
    await record(
      measureRotation(
        client,
        sessionId,
        execute,
        other,
        originalOrientation,
        `with ink: ${other} to ${originalOrientation} rotation`
      )
    );
  }

  return samples;
}

export async function runIpadActions(argv = process.argv.slice(2)) {
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
        'actions',
        'repeats',
        'label',
        'output',
        'report-only',
        'no-serve',
      ],
    },
    argv
  );
  const appUrl = resolveDeviceUrl(flag('url'), port, APP_PATH);
  const server = await ensurePreviewServer(appUrl, port, !has('no-serve'));
  const client = createWebDriverClient(flag('appium-url', DEFAULT_APPIUM_URL));
  const repeats = positiveInteger(flag('repeats', '3'), 'repeats');
  const actions = selectedActions(flag('actions'));
  let sessionId = flag('session-id');
  let ownsSession = false;
  let originalOrientation;
  let session;

  try {
    await client.request('GET', '/status');
    if (sessionId) {
      session = await client.request('GET', `/session/${sessionId}`);
    } else {
      const capabilities = sessionCapabilities({
        deviceId: flag('device-id'),
        xcodeConfigFile: flag('xcode-config', DEFAULT_XCODE_CONFIG),
        wdaBundleId: flag('wda-bundle-id', DEFAULT_WDA_BUNDLE_ID),
        allowProvisioning: has('allow-provisioning'),
        file: flag('capabilities-file'),
      });
      session = await client.request('POST', '/session', {
        capabilities: { alwaysMatch: capabilities },
      });
      sessionId = session.sessionId;
      ownsSession = true;
    }
    const execute = (script, args = []) =>
      client.request('POST', `/session/${sessionId}/execute/sync`, { script, args });
    const executeAsync = (script, args = []) =>
      client.request('POST', `/session/${sessionId}/execute/async`, { script, args });
    await client.request('POST', `/session/${sessionId}/timeouts`, {
      script: SCRIPT_TIMEOUT_MS,
    });
    originalOrientation = await client.request('GET', `/session/${sessionId}/orientation`);

    await client.request('POST', `/session/${sessionId}/url`, { url: appUrl });
    const initialReady = await pollUntil(
      () =>
        execute(
          "const canvas = document.querySelector('#drawingCanvas'); return !!canvas && canvas.width > 0;"
        ).catch(() => false),
      READY_TIMEOUT_MS,
      POLL_MS
    );
    if (!initialReady) throw new Error(`${appUrl} never showed a sized #drawingCanvas`);
    await clearDeviceWebCache(executeAsync);

    const samples = [];
    for (let repeat = 1; repeat <= repeats; repeat++) {
      const loadedUrl = profilingUrl(appUrl, repeat);
      await client.request('POST', `/session/${sessionId}/url`, { url: loadedUrl });
      const ready = await pollUntil(
        () =>
          execute(
            "const canvas = document.querySelector('#drawingCanvas'); return !!canvas && canvas.width > 0;"
          ).catch(() => false),
        READY_TIMEOUT_MS,
        POLL_MS
      );
      if (!ready) throw new Error(`${loadedUrl} never showed a sized #drawingCanvas`);
      await execute(readFileSync(ACTION_PROBE_FILE, 'utf8'));
      await sleep(REPEAT_SETTLE_MS);
      console.log(`\nAction sweep ${repeat}/${repeats}`);
      samples.push(
        ...(await runActionSweep({
          client,
          sessionId,
          execute,
          actions,
          originalOrientation,
        }))
      );
    }

    const summaries = summarizeActions(samples);
    const failures = actionFailures(summaries);
    const output =
      flag('output') ??
      join(profilePath('ipad-actions', flag('label', 'full-suite')), 'actions.json');
    mkdirSync(dirname(output), { recursive: true });
    const artifact = {
      device: {
        name: session.capabilities?.deviceName ?? session.value?.capabilities?.deviceName ?? 'iPad',
        os:
          session.capabilities?.platformVersion ??
          session.value?.capabilities?.platformVersion ??
          'unknown',
        id: flag('device-id') ?? 'cloud',
      },
      appUrl,
      appiumUrl: flag('appium-url', DEFAULT_APPIUM_URL),
      actions: [...actions],
      repeats,
      samples,
      summaries,
      passed: failures.length === 0,
    };
    writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`);
    console.log('\nDiscrete action response');
    console.table(actionRows(summaries));
    console.log(`\nWrote ${output}`);
    if (failures.length && !has('report-only')) {
      throw new Error(
        `Action frame gates failed: ${failures.map((summary) => summary.label).join(', ')}`
      );
    }
    return artifact;
  } finally {
    if (sessionId && originalOrientation) {
      await client
        .request('POST', `/session/${sessionId}/orientation`, {
          orientation: originalOrientation,
        })
        .catch(() => {});
    }
    if (sessionId && ownsSession) {
      await client.request('DELETE', `/session/${sessionId}`).catch(() => {});
    }
    server?.stop();
  }
}

if (isMain(import.meta.url)) runMain(runIpadActions);
