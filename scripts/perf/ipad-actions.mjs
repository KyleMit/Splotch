import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT, fail, isMain, pollUntil, runMain, sleep } from '../lib/proc.mjs';
import {
  MIN_GATED_SAMPLES,
  WARMUP_REPEATS,
  actionFailures,
  actionRows,
  summarizeActions,
} from './action-stats.mjs';
import { parsePerfArgs } from './args.mjs';
import {
  appiumCapabilities,
  capabilitiesFromFile,
  clearDeviceWebCache,
  createWebDriverClient,
  isWebContext,
  nativeCanvasBounds,
  switchToWebContext,
} from './ipad-xcuitest.mjs';
import { ensurePreviewServer, resolveDeviceUrl } from './ipad-session.mjs';
import { profilePath } from './paths.mjs';

const APP_PATH = '/';
const ACTION_PROBE_FILE = join(ROOT, 'scripts', 'perf', 'action-probe.js');
const ACTION_PANEL_STATE_TARGET = `(document.querySelector('.actions-panel[data-action-panel-live]') ?? document.documentElement)`;
const DEFAULT_APPIUM_URL = 'http://127.0.0.1:4723';
const DEFAULT_XCODE_CONFIG = join(ROOT, 'ios', 'local.xcconfig');
const DEFAULT_WDA_BUNDLE_ID = 'art.splotch.WebDriverAgentRunner';
const DEFAULT_NATIVE_WEBVIEW_CLASS = 'XCUIElementTypeWebView';
const READY_TIMEOUT_MS = 30_000;
const POLL_MS = 50;
const SCRIPT_TIMEOUT_MS = 45_000;
const ACTION_SETTLE_MS = 650;
const ANIMATED_ACTION_SETTLE_MS = 1_100;
const IDLE_CONTROL_MS = 5_000;
const REPEAT_SETTLE_MS = 500;
const TRUSTED_STROKE_MS = 650;
const CLEAR_DRAG_MS = 450;
const ROTATION_NATIVE_SETTLE_MS = 1_500;
const MAX_SETUP_RECOVERY_ATTEMPTS = 3;
const ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf';
const ALL_ACTIONS = new Set([
  'idle',
  'drawer',
  'palette',
  'color-picker',
  'brushes',
  'stroke-width',
  'parent-center',
  'parent-sections',
  'parent-settings',
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

export function selectedActions(value) {
  if (!value) return ALL_ACTIONS;
  const actions = new Set(value.split(',').filter(Boolean));
  const unknown = [...actions].filter((action) => !ALL_ACTIONS.has(action));
  if (unknown.length) fail(`Unknown --actions entries: ${unknown.join(', ')}`);
  return actions;
}

function actionPanelHasAttribute(attribute) {
  return `${ACTION_PANEL_STATE_TARGET}.hasAttribute(${JSON.stringify(attribute)}) === true`;
}

function actionPanelLacksAttribute(attribute) {
  return `${ACTION_PANEL_STATE_TARGET}.hasAttribute(${JSON.stringify(attribute)}) === false`;
}

function actionPanelDatasetEquals(key, value) {
  return `${ACTION_PANEL_STATE_TARGET}.dataset[${JSON.stringify(key)}] === ${JSON.stringify(value)}`;
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

export function profilingUrl(appUrl, repeat) {
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

async function clickSetupElement(execute, selector) {
  await execute(`
    const target = document.querySelector(${JSON.stringify(selector)});
    if (!target) throw new Error(${JSON.stringify(`Missing setup target ${selector}`)});
    target.click();
    return true;
  `);
}

async function setNativeRotationLock(execute, locked) {
  await clickSetupElement(execute, 'button[aria-label="Parent Center"]');
  await waitForReady(
    execute,
    `document.querySelector('#parentHelpModal')?.open === true`,
    'Parent Center for rotation setup'
  );
  if (!(await execute(`return document.querySelector('#lockRotationToggle') !== null;`))) {
    const appearanceSelector = await execute(`
      if (document.querySelector('#parentHelpModal .pc-nav-item')) {
        return '#parentHelpModal .pc-nav-item:first-child';
      }
      if (document.querySelector('#parentHelpModal .hub-row')) {
        return '#parentHelpModal .hub-list li:first-child .hub-row';
      }
      return null;
    `);
    if (appearanceSelector) {
      await clickSetupElement(execute, appearanceSelector);
      await waitForReady(
        execute,
        `document.querySelector('#themeOption-light') !== null`,
        'Appearance section for rotation setup'
      );
    }
  }
  const initial = await execute(`
    const toggle = document.querySelector('#lockRotationToggle');
    return toggle ? toggle.getAttribute('aria-checked') === 'true' : null;
  `);
  if (initial !== null && initial !== locked) {
    await clickSetupElement(execute, '#lockRotationToggle');
    await waitForReady(
      execute,
      `document.querySelector('#lockRotationToggle')?.getAttribute('aria-checked') === '${locked}'`,
      `rotation lock to become ${locked ? 'enabled' : 'disabled'}`
    );
  }
  await clickSetupElement(execute, '#parentHelpModal button[aria-label="Close"]');
  await waitForReady(
    execute,
    `document.querySelector('#parentHelpModal')?.open !== true`,
    'Parent Center to close after rotation setup'
  );
  await sleep(ANIMATED_ACTION_SETTLE_MS);
  return initial;
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
    activation === 'native' && !client.webdriverClicks
      ? await nativeBoundsForSelector(client, sessionId, execute, selector)
      : null;
  await ensureActionProbe(execute);
  await execute(
    `return window.__actionProbe.begin(${JSON.stringify(label)}, ${JSON.stringify(
      selector
    )}, ${JSON.stringify(eventTypes ?? ['pointerup', 'click'])});`
  );
  const activationMode = nativeTarget ? 'native-touch' : 'webdriver-element-click';
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
    throw new Error(
      `${error.message}\nAction state: ${JSON.stringify({ ...state, nativeTarget })}`,
      {
        cause: error,
      }
    );
  }
  await sleep(settleMs);
  const sample = await execute(`return window.__actionProbe.finish(${readyAt});`);
  return { ...sample, activation: activationMode };
}

async function measureIdle(execute) {
  await ensureActionProbe(execute);
  await execute(`
    window.__actionProbe.beginExternal('idle frame control', []);
    window.__actionProbe.markExternalAction();
    return true;
  `);
  await sleep(IDLE_CONTROL_MS);
  const sample = await execute(`return window.__actionProbe.finish(null);`);
  return { ...sample, activation: 'driver' };
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
  const webContext = contexts.find(isWebContext);
  await client.request('POST', `/session/${sessionId}/context`, { name: 'NATIVE_APP' });
  const nativeWindow = await client.request('GET', `/session/${sessionId}/window/rect`);
  const webViewBounds = await client
    .request('POST', `/session/${sessionId}/element`, {
      using: 'class name',
      value: client.nativeWebViewClass ?? DEFAULT_NATIVE_WEBVIEW_CLASS,
    })
    .then((webView) => {
      const webViewId = webView[ELEMENT_KEY] ?? webView.ELEMENT;
      return client.request('GET', `/session/${sessionId}/element/${webViewId}/rect`);
    })
    .catch(() => nativeWindow);
  const bounds = nativeCanvasBounds({
    webGeometry,
    webViewBounds,
    nativeWindow,
    includeBrowserChrome: client.includeBrowserChrome ?? !client.nativeApp,
  });
  await client.request('POST', `/session/${sessionId}/context`, { name: webContext });
  return { bounds, nativeWindow, webContext };
}

async function nativeAccessibilityBounds(client, sessionId, name) {
  const contexts = await client.request('GET', `/session/${sessionId}/contexts`);
  const webContext = contexts.find(isWebContext);
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

async function installActionProbe(execute) {
  await execute(readFileSync(ACTION_PROBE_FILE, 'utf8'));
}

async function ensureActionProbe(execute) {
  const ready = await execute(`return typeof window.__actionProbe?.begin === 'function';`).catch(
    () => false
  );
  if (!ready) await installActionProbe(execute);
}

// Exported so the script regression test can pin this state boundary independently of Appium.
export async function canvasHasInk(execute) {
  return execute(`return document.querySelector('#screenshotButton')?.disabled === false;`);
}

async function ensureStableTrustedStroke(client, sessionId, execute) {
  for (let attempt = 0; attempt < MAX_SETUP_RECOVERY_ATTEMPTS; attempt++) {
    const ready = await pollUntil(
      () =>
        execute(
          "const canvas = document.querySelector('#drawingCanvas'); return !!canvas && canvas.width > 0;"
        ).catch(() => false),
      READY_TIMEOUT_MS,
      POLL_MS
    );
    if (!ready) throw new Error('The drawing canvas did not recover after native setup');
    await ensureActionProbe(execute);
    const hasInk = await canvasHasInk(execute);
    if (!hasInk) await addTrustedStroke(client, sessionId, execute);
    await sleep(POLL_MS);
    const stable = await execute(`
      return typeof window.__actionProbe?.begin === 'function' &&
        document.querySelector('#screenshotButton')?.disabled === false;
    `).catch(() => false);
    if (stable) return;
  }
  throw new Error('The native WebView did not retain the action probe and setup stroke');
}

async function measureClear(client, sessionId, execute, label = 'clear drawing') {
  const { bounds, nativeWindow, webContext } =
    client.nativeApp || client.useWebGeometryForClear
      ? await nativeBoundsForSelector(client, sessionId, execute, '#clearButton')
      : await nativeAccessibilityBounds(client, sessionId, 'Clear drawing').catch(() =>
          nativeBoundsForSelector(client, sessionId, execute, '#clearButton')
        );
  const startX = Math.round(bounds.x + bounds.width / 2);
  const startY = Math.round(bounds.y + bounds.height / 2);
  const distance = Math.min(nativeWindow.width, nativeWindow.height) * 0.48;
  const endX = Math.max(20, Math.round(startX - distance * 0.72));
  const endY = Math.min(nativeWindow.height - 20, Math.round(startY + distance * 0.72));
  await ensureActionProbe(execute);
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
  const sample = await execute(`return window.__actionProbe.finish(${readyAt});`);
  return { ...sample, activation: 'native-touch' };
}

async function measureRotation(client, sessionId, execute, from, to, label) {
  await ensureActionProbe(execute);
  await execute(
    `return window.__actionProbe.beginExternal(${JSON.stringify(label)}, ['orientationchange', 'resize']);`
  );
  await client.request('POST', `/session/${sessionId}/context`, { name: 'NATIVE_APP' });
  await client.request('POST', `/session/${sessionId}/orientation`, { orientation: to });
  await sleep(ROTATION_NATIVE_SETTLE_MS);
  const contexts = await client.request('GET', `/session/${sessionId}/contexts`);
  const webContext = contexts.find(isWebContext);
  await client.request('POST', `/session/${sessionId}/context`, { name: webContext });
  const readyAt = await waitForReady(
    execute,
    to === 'PORTRAIT' ? 'innerHeight > innerWidth' : 'innerWidth > innerHeight',
    `${from} to ${to} rotation`,
    READY_TIMEOUT_MS
  );
  await sleep(ANIMATED_ACTION_SETTLE_MS);
  const sample = await execute(`return window.__actionProbe.finish(${readyAt});`);
  return { ...sample, activation: 'native-system' };
}

export async function runActionSweep({ client, sessionId, execute, actions, originalOrientation }) {
  const samples = [];
  const record = async (promise) => samples.push(await promise);
  const recordToggleRoundTrip = async ({
    label,
    selector,
    readyFor,
    stateAttribute = 'aria-checked',
    baseline,
  }) => {
    const stateExpression = (enabled) =>
      `document.querySelector(${JSON.stringify(selector)})?.getAttribute(${JSON.stringify(stateAttribute)}) === '${enabled}'${readyFor ? ` && (${readyFor(enabled)})` : ''}`;
    const initial = await execute(
      `return document.querySelector(${JSON.stringify(selector)})?.getAttribute(${JSON.stringify(stateAttribute)}) === 'true';`
    );
    const setState = async (target, hint) => {
      const current = await execute(`return ${stateExpression(target)};`);
      if (current) return;
      await clickSetupElement(execute, selector);
      await waitForReady(execute, stateExpression(target), hint);
      await sleep(ANIMATED_ACTION_SETTLE_MS);
    };
    try {
      await setState(baseline, `${label} baseline`);
      for (const next of [!baseline, baseline]) {
        await record(
          measureClick({
            client,
            sessionId,
            execute,
            label: `${next ? 'enable' : 'disable'} ${label}`,
            selector,
            ready: stateExpression(next),
            settleMs: ANIMATED_ACTION_SETTLE_MS,
            activation: 'webdriver',
          })
        );
      }
    } finally {
      await setState(initial, `${label} original state`);
    }
  };

  if (actions.has('idle')) {
    await record(measureIdle(execute));
  }

  if (actions.has('drawer')) {
    await ensureState(
      execute,
      actionPanelLacksAttribute('data-drawer-open'),
      `document.querySelector('button[aria-label="Collapse controls"]')?.click()`
    );
    await record(
      measureClick({
        client,
        sessionId,
        execute,
        label: 'expand action drawer',
        selector: 'button[aria-label="Expand controls"]',
        ready: actionPanelHasAttribute('data-drawer-open'),
      })
    );
    await record(
      measureClick({
        client,
        sessionId,
        execute,
        label: 'collapse action drawer',
        selector: 'button[aria-label="Collapse controls"]',
        ready: actionPanelLacksAttribute('data-drawer-open'),
      })
    );
  }

  await ensureState(
    execute,
    actionPanelHasAttribute('data-drawer-open'),
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

  if (actions.has('color-picker')) {
    await record(
      measureClick({
        client,
        sessionId,
        execute,
        label: 'open custom color picker',
        selector: '.gradient-swatch',
        ready: `document.querySelector('#color-picker')?.open === true`,
        settleMs: ANIMATED_ACTION_SETTLE_MS,
      })
    );
    const colorGrid = await execute(`return innerWidth > innerHeight ? 'landscape' : 'portrait';`);
    await record(
      measureClick({
        client,
        sessionId,
        execute,
        label: 'select custom color',
        selector: `#color-picker .grid.${colorGrid} .hexagon:not(.selected)`,
        ready: `document.querySelector('#color-picker')?.open !== true && document.querySelector('.gradient-swatch')?.classList.contains('active') === true`,
        settleMs: ANIMATED_ACTION_SETTLE_MS,
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
        ready: actionPanelDatasetEquals('brush', 'crayon'),
      },
      {
        label: 'select Magic brush',
        selector: '#magicBrushButton',
        ready: actionPanelDatasetEquals('brush', 'magic'),
      },
      {
        label: 'select eraser',
        selector: '#eraserButton',
        ready: actionPanelDatasetEquals('brush', 'eraser'),
      },
      {
        label: 'select pen brush',
        selector: '#penBrushButton',
        ready: actionPanelLacksAttribute('data-brush'),
      },
    ];
    for (const [index, selection] of brushSelections.entries()) {
      if (index > 0) {
        await clickSetupElement(execute, '#brushButton');
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

  if (
    actions.has('parent-center') ||
    actions.has('parent-sections') ||
    actions.has('parent-settings') ||
    actions.has('theme')
  ) {
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

  if (
    actions.has('parent-center') ||
    actions.has('parent-sections') ||
    actions.has('parent-settings') ||
    actions.has('theme')
  ) {
    await waitForReady(
      execute,
      `document.querySelector('#parentHelpModal .pc-nav-item') !== null || document.querySelector('#parentHelpModal .hub-list') !== null`,
      'Parent Center navigation'
    );
  }
  const parentCenterUsesSidebar = await execute(
    `return document.querySelector('#parentHelpModal .pc-nav-item') !== null;`
  );
  const parentSectionSelector = (section) =>
    parentCenterUsesSidebar
      ? `#parentHelpModal .pc-nav-item[data-section=${JSON.stringify(section)}]`
      : `#parentHelpModal .hub-row[data-section=${JSON.stringify(section)}]`;
  const ensureParentHub = async () => {
    if (
      parentCenterUsesSidebar ||
      (await execute(`return !!document.querySelector('.hub-list');`))
    ) {
      return;
    }
    await clickSetupElement(execute, '#parentHelpModal .pc-back');
    await waitForReady(
      execute,
      `document.querySelector('.hub-list') !== null`,
      'Parent Center hub'
    );
  };
  const openParentSection = async (section, ready, hint) => {
    await ensureParentHub();
    await clickSetupElement(execute, parentSectionSelector(section));
    await waitForReady(execute, ready, hint);
  };

  if (actions.has('parent-sections')) {
    const sectionIds = await execute(`
      return [...document.querySelectorAll(
        ${JSON.stringify(
          parentCenterUsesSidebar ? '#parentHelpModal .pc-nav-item' : '#parentHelpModal .hub-row'
        )}
      )].map((element) => element.dataset.section).filter(Boolean);
    `);
    for (const section of sectionIds.slice(1)) {
      await ensureParentHub();
      const selector = parentSectionSelector(section);
      const label = await execute(
        `return document.querySelector(${JSON.stringify(
          parentCenterUsesSidebar ? selector : `${selector} .hub-title`
        )})?.textContent?.trim();`
      );
      await record(
        measureClick({
          client,
          sessionId,
          execute,
          label: `open Parent Center section: ${label}`,
          selector,
          ready: parentCenterUsesSidebar
            ? `document.querySelector(${JSON.stringify(selector)})?.getAttribute('aria-current') === 'page'`
            : `document.querySelector('#parentHelpModal .pc-back') !== null`,
          activation: 'webdriver',
        })
      );
    }
    await openParentSection(
      'appearance',
      `document.querySelector('#themeOption-light') !== null`,
      'Appearance section'
    );
  }

  if (actions.has('theme')) {
    await openParentSection(
      'appearance',
      `document.querySelector('#themeOption-light') !== null`,
      'Appearance section'
    );
    await clickSetupElement(execute, '#themeOption-dark');
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

  if (actions.has('parent-settings')) {
    await openParentSection(
      'sound',
      `document.querySelector('#soundToggle') !== null`,
      'Sound section'
    );
    await recordToggleRoundTrip({
      label: 'drawing sounds',
      selector: '#soundToggle',
      baseline: true,
      readyFor: (enabled) =>
        `document.querySelector('#soundVolumeLabel') ${enabled ? '!== null' : '=== null'}`,
    });

    await openParentSection(
      'saving',
      `document.querySelector('#saveOnDeleteToggle') !== null`,
      'Saving section'
    );
    await recordToggleRoundTrip({
      label: 'auto-save on delete',
      selector: '#saveOnDeleteToggle',
      baseline: false,
    });

    await openParentSection(
      'controls',
      `document.querySelector('#advancedControlsToggle') !== null`,
      'Controls & Buttons section'
    );
    await recordToggleRoundTrip({
      label: 'advanced controls',
      selector: '#advancedControlsToggle',
      baseline: true,
      readyFor: (enabled) =>
        `document.querySelector('#screenshotToggle') ${enabled ? '!== null' : '=== null'}`,
    });
    await recordToggleRoundTrip({
      label: 'screenshot action button',
      selector: '#screenshotToggle',
      stateAttribute: 'aria-pressed',
      baseline: true,
      readyFor: (enabled) =>
        enabled
          ? actionPanelLacksAttribute('data-off-screenshot')
          : actionPanelHasAttribute('data-off-screenshot'),
    });
  }

  if (
    actions.has('parent-center') ||
    actions.has('parent-sections') ||
    actions.has('parent-settings') ||
    actions.has('theme')
  ) {
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
    await clickSetupElement(execute, '#coloringBookButton');
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
      if (globalThis.Capacitor?.isNativePlatform?.()) {
        window.__actionOriginalScreenshotSaveSink = window.__screenshotSaveSink;
        window.__screenshotSaveSink = function () {
          window.__actionDownloadReadyAt = performance.now();
          return Promise.resolve();
        };
      }
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
      if (window.__actionOriginalScreenshotSaveSink) {
        window.__screenshotSaveSink = window.__actionOriginalScreenshotSaveSink;
      } else {
        delete window.__screenshotSaveSink;
      }
      delete window.__actionOriginalScreenshotSaveSink;
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
    await ensureStableTrustedStroke(client, sessionId, execute);
    await record(measureClear(client, sessionId, execute));
  }

  if (actions.has('rotation')) {
    if (!actions.has('clear')) {
      await ensureStableTrustedStroke(client, sessionId, execute);
      await record(measureClear(client, sessionId, execute, 'clear drawing for blank rotation'));
    }
    const canvasEmpty = await execute(
      `return document.querySelector('#screenshotButton')?.disabled === true;`
    );
    if (!canvasEmpty) throw new Error('Rotation setup did not produce a blank canvas');
    const blankCurrent = await client.request('GET', `/session/${sessionId}/orientation`);
    const blankOther = blankCurrent === 'LANDSCAPE' ? 'PORTRAIT' : 'LANDSCAPE';
    await record(
      measureRotation(
        client,
        sessionId,
        execute,
        blankCurrent,
        blankOther,
        `empty after clear: ${blankCurrent} to ${blankOther} rotation`
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
    await ensureStableTrustedStroke(client, sessionId, execute);
    await record(
      measureClear(client, sessionId, execute, 'clear restored drawing after blank rotation')
    );
    await record(
      measureRotation(
        client,
        sessionId,
        execute,
        blankOther,
        originalOrientation,
        `empty after clear: ${blankOther} to ${originalOrientation} rotation`
      )
    );
    await ensureStableTrustedStroke(client, sessionId, execute);
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
        'native-app',
        'native-webview-class',
        'webdriver-clicks',
        'orientation',
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
  const nativeApp = has('native-app');
  const requestedAppUrl = nativeApp ? null : resolveDeviceUrl(flag('url'), port, APP_PATH);
  const server = nativeApp
    ? null
    : await ensurePreviewServer(requestedAppUrl, port, !has('no-serve'));
  const client = createWebDriverClient(flag('appium-url', DEFAULT_APPIUM_URL));
  client.nativeApp = nativeApp;
  client.nativeWebViewClass = flag('native-webview-class', DEFAULT_NATIVE_WEBVIEW_CLASS);
  client.webdriverClicks = has('webdriver-clicks');
  const repeats = positiveInteger(flag('repeats', '4'), 'repeats');
  if (repeats < WARMUP_REPEATS + MIN_GATED_SAMPLES) {
    fail(`--repeats must provide one warmup and ${MIN_GATED_SAMPLES} scored samples`);
  }
  const actions = selectedActions(flag('actions'));
  let sessionId = flag('session-id');
  let ownsSession = false;
  let originalOrientation;
  let restoreOrientation;
  let session;
  let execute;
  let restoreNativeRotationLock;

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
    execute = (script, args = []) =>
      client.request('POST', `/session/${sessionId}/execute/sync`, { script, args });
    const executeAsync = (script, args = []) =>
      client.request('POST', `/session/${sessionId}/execute/async`, { script, args });
    restoreOrientation = await client.request('GET', `/session/${sessionId}/orientation`);
    const requestedOrientation = flag('orientation')?.toUpperCase();
    if (requestedOrientation && requestedOrientation !== restoreOrientation) {
      if (!['PORTRAIT', 'LANDSCAPE'].includes(requestedOrientation)) {
        fail('--orientation must be PORTRAIT or LANDSCAPE');
      }
      await client.request('POST', `/session/${sessionId}/orientation`, {
        orientation: requestedOrientation,
      });
      await sleep(ROTATION_NATIVE_SETTLE_MS);
    }
    originalOrientation = await client.request('GET', `/session/${sessionId}/orientation`);

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
      READY_TIMEOUT_MS,
      POLL_MS
    );
    if (!initialReady) {
      throw new Error(
        `${nativeApp ? 'The native app' : requestedAppUrl} never showed a sized #drawingCanvas`
      );
    }
    await clearDeviceWebCache(executeAsync);
    if (nativeApp && actions.has('rotation')) {
      restoreNativeRotationLock = (await setNativeRotationLock(execute, false)) === true;
      await execute(`location.reload(); return true;`).catch(() => null);
      await switchToWebContext(client, sessionId);
      const unlockedReady = await pollUntil(
        () =>
          execute(
            "const canvas = document.querySelector('#drawingCanvas'); return !!canvas && canvas.width > 0;"
          ).catch(() => false),
        READY_TIMEOUT_MS,
        POLL_MS
      );
      if (!unlockedReady) throw new Error('The native app did not reload after unlocking rotation');
    }
    const appUrl = nativeApp ? await execute('return location.href;') : requestedAppUrl;

    const samples = [];
    const expectedLabels = new Set();
    for (let repeat = 1; repeat <= repeats; repeat++) {
      const loadedUrl = profilingUrl(appUrl, repeat);
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
        READY_TIMEOUT_MS,
        POLL_MS
      );
      if (!ready) throw new Error(`${loadedUrl} never showed a sized #drawingCanvas`);
      await installActionProbe(execute);
      await sleep(REPEAT_SETTLE_MS);
      console.log(`\nAction sweep ${repeat}/${repeats}`);
      const sweep = await runActionSweep({
        client,
        sessionId,
        execute,
        actions,
        originalOrientation,
      });
      if (repeat <= WARMUP_REPEATS) {
        for (const sample of sweep) expectedLabels.add(sample.label);
      }
      samples.push(
        ...sweep.map((sample) => ({
          ...sample,
          repeat,
          warmup: repeat <= WARMUP_REPEATS,
        }))
      );
    }

    const summaries = summarizeActions(samples, expectedLabels);
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
      transport: nativeApp ? 'native-capacitor-webview' : 'browser',
      uiActivation: client.webdriverClicks ? 'webdriver-element-click' : 'native-touch',
      appiumUrl: flag('appium-url', DEFAULT_APPIUM_URL),
      actions: [...actions],
      repeats,
      orientation: originalOrientation,
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
    if (sessionId && execute && restoreNativeRotationLock) {
      await switchToWebContext(client, sessionId).catch(() => null);
      await setNativeRotationLock(execute, true).catch(() => null);
    }
    if (sessionId && restoreOrientation) {
      await client
        .request('POST', `/session/${sessionId}/orientation`, {
          orientation: restoreOrientation,
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
