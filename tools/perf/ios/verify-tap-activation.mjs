// Regression harness for issue 1194: does a trusted finger tap actually activate
// a toolbar button in the native app, in both orientations?
//
// WKWebView configured with ios.contentInset reports PointerEvent client
// coordinates shifted by the top content inset while TouchEvent coordinates,
// layout and hit-testing are not. scribbleTap re-derives its activation target
// from those coordinates via elementFromPoint, so in portrait the release
// hit-tests outside the button the browser itself targeted and no control
// activates. The skew is the viewport's own `screen.height - innerHeight`, so it
// exists in portrait and not in landscape — which is the whole orientation
// asymmetry the issue was originally filed around.
//
// Four scenarios, each PASS/FAIL, driven with trusted XCUITest touch:
//
//   restore-after-LANDSCAPE-start  rotate landscape->portrait, tap undo (the bug)
//   restore-after-PORTRAIT-start   the direction that already worked
//   drag-off-cancels               press undo, slide away, release: must not undo
//   wiggle-tap-activates           press, smudge 12px, release: must still undo
//
// That last one is the discriminator. A fix that only corrects the release check
// passes the first three and still fails here, because the drag detector has
// already classified the press from the same bad coordinates.
//
// Requires a booted simulator (or attached device) plus a running Appium server,
// exactly like the capture entry points beside this file — see ./README.md.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, fail, isMain, runMain, sleep } from '../../lib/proc.mjs';
import {
  createWebDriverClient,
  appiumCapabilities,
  nativeCanvasBounds,
  isWebContext,
} from './capture-xcuitest-screen.mjs';
import { largestNativeRect } from './capture-xcuitest-actions.mjs';

const ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf';
const DEFAULT_APPIUM_URL = 'http://127.0.0.1:4723';
const DEFAULT_XCODE_CONFIG = join(ROOT, 'ios', 'local.xcconfig');
const DEFAULT_WDA_BUNDLE_ID = 'com.facebook.WebDriverAgentRunner.xctrunner';
const NATIVE_WEBVIEW_CLASS = 'XCUIElementTypeWebView';

// The WebView needs time the harness cannot observe: a rotation animation, a
// reload, and the drawer's expand transition all settle on their own clock.
const ROTATION_SETTLE_MS = 1_500;
const ORIENTATION_SETTLE_MS = 1_100;
const RELOAD_SETTLE_MS = 2_000;
const BOOT_SETTLE_MS = 800;
const DRAWER_SETTLE_MS = 650;
const GESTURE_SETTLE_MS = 300;
const ACTIVATION_SETTLE_MS = 1_400;
const READY_TIMEOUT_MS = 8_000;
const BOOT_TIMEOUT_MS = 30_000;

const TRUSTED_STROKE_MS = 260;
const CLEAR_DRAG_MS = 420;
const TAP_HOLD_MS = 80;

// Far enough to leave any button; the press must read as a drag and cancel.
const DRAG_OFF_DISTANCE_PX = 320;
// A toddler's finger smudges a few px without leaving a 55px target. Past
// scribbleTap's 8px tap tolerance, so it exercises the drag detector, but well
// inside the control — this must still activate.
const WIGGLE_X_PX = 12;
const WIGGLE_Y_PX = 6;
const WIGGLE_MS = 120;

const CANVAS_SIZED = `document.querySelector('#drawingCanvas')?.getBoundingClientRect().width > 0`;
const CANVAS_BLANK = `document.querySelector('#screenshotButton')?.disabled === true`;
const CANVAS_HAS_INK = `document.querySelector('#screenshotButton')?.disabled === false`;
const UNDO_AVAILABLE = `document.querySelector('#undoButton')?.getAttribute('aria-disabled') === 'false'`;
const DRAWER_OPEN = `(document.querySelector('.actions-panel[data-action-panel-live]') ?? document.documentElement).hasAttribute('data-drawer-open')`;

// Records whether each pointer phase reached the undo button at all, so a restore
// can never be credited to a stray dot the tap drew on the canvas instead.
const POINTER_PROBE = `
window.__tapProbe = [];
for (const type of ['pointerdown', 'pointerup']) {
  window.addEventListener(type, (e) => {
    const button = document.querySelector('#undoButton');
    window.__tapProbe.push({
      type,
      targetIsUndo: !!button && button.contains(e.target),
      clientY: Math.round(e.clientY),
    });
  }, true);
}
return true;
`;

function createDriver(client, sessionId) {
  const execute = (script, args = []) =>
    client.request('POST', `/session/${sessionId}/execute/sync`, { script, args });
  const switchTo = (name) => client.request('POST', `/session/${sessionId}/context`, { name });

  async function webContextName() {
    const contexts = await client.request('GET', `/session/${sessionId}/contexts`);
    const found = contexts.find(isWebContext);
    if (!found) throw new Error('Appium reported no WEBVIEW context');
    return found;
  }

  async function waitFor(expression, hint, timeoutMs = READY_TIMEOUT_MS) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (await execute(`return !!(${expression});`).catch(() => false)) return;
      if (Date.now() > deadline) throw new Error(`Timed out waiting for ${hint}`);
      await sleep(100);
    }
  }

  // Maps a web element's rect into native screen coordinates, the same way the
  // capture entry points do, so the gesture lands where the element renders.
  async function nativeBounds(selector) {
    const webGeometry = await execute(`
      const rect = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect();
      if (!rect) return null;
      return {
        canvas: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        viewport: { width: innerWidth, height: innerHeight }
      };
    `);
    if (!webGeometry) throw new Error(`No element matches ${selector}`);
    const webContext = await webContextName();
    await switchTo('NATIVE_APP');
    const nativeWindow = await client.request('GET', `/session/${sessionId}/window/rect`);
    const webViews = await client
      .request('POST', `/session/${sessionId}/elements`, {
        using: 'class name',
        value: NATIVE_WEBVIEW_CLASS,
      })
      .catch(() => []);
    const rects = (
      await Promise.all(
        webViews.map((webView) =>
          client
            .request(
              'GET',
              `/session/${sessionId}/element/${webView[ELEMENT_KEY] ?? webView.ELEMENT}/rect`
            )
            .catch(() => null)
        )
      )
    ).filter(Boolean);
    const bounds = nativeCanvasBounds({
      webGeometry,
      webViewBounds: largestNativeRect(rects, nativeWindow),
      nativeWindow,
      includeBrowserChrome: false,
    });
    await switchTo(webContext);
    return { bounds, nativeWindow, webContext };
  }

  async function gesture(webContext, actions) {
    await switchTo('NATIVE_APP');
    await client.request('POST', `/session/${sessionId}/actions`, {
      actions: [
        { type: 'pointer', id: 'tap-finger', parameters: { pointerType: 'touch' }, actions },
      ],
    });
    await switchTo(webContext);
  }

  const centreOf = (bounds) => ({
    x: Math.round(bounds.x + bounds.width / 2),
    y: Math.round(bounds.y + bounds.height / 2),
  });

  async function openDrawer() {
    if (await execute(`return !!(${DRAWER_OPEN});`)) return;
    await execute(
      `document.querySelector('button[aria-label="Expand controls"]')?.click(); return true;`
    );
    await waitFor(DRAWER_OPEN, 'the action drawer to expand');
    await sleep(DRAWER_SETTLE_MS);
  }

  // The undo and save buttons live inside the collapsible drawer, which is closed
  // by default — a run that skips this taps a visibility:hidden control and
  // "reproduces" nothing.
  async function reload() {
    await execute(`location.reload(); return true;`);
    await sleep(RELOAD_SETTLE_MS);
    await switchTo(await webContextName());
    await waitFor(CANVAS_SIZED, 'the drawing canvas after reload', BOOT_TIMEOUT_MS);
    await sleep(BOOT_SETTLE_MS);
    await openDrawer();
  }

  async function rotateTo(orientation) {
    const current = await client.request('GET', `/session/${sessionId}/orientation`);
    if (current === orientation) return;
    await switchTo('NATIVE_APP');
    await client.request('POST', `/session/${sessionId}/orientation`, { orientation });
    await sleep(ROTATION_SETTLE_MS);
    await switchTo(await webContextName());
    await waitFor(
      orientation === 'PORTRAIT' ? 'innerHeight > innerWidth' : 'innerWidth > innerHeight',
      `the rotation to ${orientation}`
    );
    await sleep(ORIENTATION_SETTLE_MS);
  }

  async function drawStroke() {
    const { bounds, webContext } = await nativeBounds('#drawingCanvas');
    const x = Math.round(bounds.x + bounds.width * 0.24);
    const y = Math.round(bounds.y + bounds.height * 0.38);
    await gesture(webContext, [
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
    await waitFor(UNDO_AVAILABLE, 'the stroke to enter undo history');
    await sleep(GESTURE_SETTLE_MS);
  }

  // Clear is a deliberate drag-away gesture, not a click. Clicking #clearButton
  // leaves the canvas non-blank and invalidates the whole rotation setup.
  async function dragToClear() {
    const { bounds, nativeWindow, webContext } = await nativeBounds('#clearButton');
    const start = centreOf(bounds);
    const distance = Math.min(nativeWindow.width, nativeWindow.height) * 0.48;
    await gesture(webContext, [
      { type: 'pointerMove', duration: 0, origin: 'viewport', x: start.x, y: start.y },
      { type: 'pointerDown', button: 0 },
      {
        type: 'pointerMove',
        duration: CLEAR_DRAG_MS,
        origin: 'viewport',
        x: Math.max(20, Math.round(start.x - distance * 0.72)),
        y: Math.min(nativeWindow.height - 20, Math.round(start.y + distance * 0.72)),
      },
      { type: 'pointerUp', button: 0 },
    ]);
    await waitFor(CANVAS_BLANK, 'the clear to empty the drawing');
    await sleep(GESTURE_SETTLE_MS);
  }

  return {
    execute,
    switchTo,
    webContextName,
    waitFor,
    nativeBounds,
    gesture,
    centreOf,
    openDrawer,
    reload,
    rotateTo,
    drawStroke,
    dragToClear,
  };
}

async function restoreScenario(driver, start) {
  await driver.rotateTo(start);
  await driver.reload();
  await driver.drawStroke();
  await driver.dragToClear();
  if (!(await driver.execute(`return ${CANVAS_BLANK};`))) {
    throw new Error('Setup did not produce a blank canvas');
  }
  await driver.rotateTo(start === 'LANDSCAPE' ? 'PORTRAIT' : 'LANDSCAPE');
  await driver.openDrawer();

  await driver.execute(POINTER_PROBE);
  const { bounds, webContext } = await driver.nativeBounds('#undoButton');
  const { x, y } = driver.centreOf(bounds);
  await driver.gesture(webContext, [
    { type: 'pointerMove', duration: 0, origin: 'viewport', x, y },
    { type: 'pointerDown', button: 0 },
    { type: 'pause', duration: TAP_HOLD_MS },
    { type: 'pointerUp', button: 0 },
  ]);
  await sleep(ACTIVATION_SETTLE_MS);

  const probe = await driver.execute(`return window.__tapProbe;`);
  const restored = await driver.execute(`return ${CANVAS_HAS_INK};`);
  const tappedButton = probe.some((event) => event.type === 'pointerdown' && event.targetIsUndo);
  return { pass: restored && tappedButton, restored, tappedButton, probe };
}

async function dragOffScenario(driver) {
  await driver.rotateTo('PORTRAIT');
  await driver.reload();
  await driver.drawStroke();
  const { bounds, webContext } = await driver.nativeBounds('#undoButton');
  const { x, y } = driver.centreOf(bounds);
  await driver.gesture(webContext, [
    { type: 'pointerMove', duration: 0, origin: 'viewport', x, y },
    { type: 'pointerDown', button: 0 },
    {
      type: 'pointerMove',
      duration: GESTURE_SETTLE_MS,
      origin: 'viewport',
      x: x + DRAG_OFF_DISTANCE_PX,
      y: y - DRAG_OFF_DISTANCE_PX,
    },
    { type: 'pointerUp', button: 0 },
  ]);
  await sleep(ACTIVATION_SETTLE_MS);
  const strokeSurvived = await driver.execute(`return ${CANVAS_HAS_INK};`);
  return { pass: strokeSurvived, strokeSurvived };
}

async function wiggleTapScenario(driver) {
  await driver.rotateTo('LANDSCAPE');
  await driver.reload();
  await driver.drawStroke();
  await driver.dragToClear();
  await driver.rotateTo('PORTRAIT');
  await driver.openDrawer();
  const { bounds, webContext } = await driver.nativeBounds('#undoButton');
  const { x, y } = driver.centreOf(bounds);
  await driver.gesture(webContext, [
    { type: 'pointerMove', duration: 0, origin: 'viewport', x, y },
    { type: 'pointerDown', button: 0 },
    {
      type: 'pointerMove',
      duration: WIGGLE_MS,
      origin: 'viewport',
      x: x + WIGGLE_X_PX,
      y: y + WIGGLE_Y_PX,
    },
    { type: 'pause', duration: TAP_HOLD_MS },
    { type: 'pointerUp', button: 0 },
  ]);
  await sleep(ACTIVATION_SETTLE_MS);
  const restored = await driver.execute(`return ${CANVAS_HAS_INK};`);
  return { pass: restored, restored };
}

export async function runTapActivationCheck(argv = process.argv.slice(2)) {
  const flag = (name, fallback) => {
    const hit = argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split('=')[1] : fallback;
  };
  const deviceId = flag('device-id');
  if (!deviceId) fail('Pass --device-id=<simulator or device udid>');
  const xcodeConfigFile = flag('xcode-config', DEFAULT_XCODE_CONFIG);
  if (!existsSync(xcodeConfigFile)) {
    fail(`No signing config at ${xcodeConfigFile}. Create ios/local.xcconfig with DEVELOPMENT_TEAM.`);
  }
  const label = flag('label', 'tap-activation');

  const client = createWebDriverClient(flag('appium-url', DEFAULT_APPIUM_URL));
  client.nativeApp = true;
  await client.request('GET', '/status');

  const session = await client.request('POST', '/session', {
    capabilities: {
      alwaysMatch: appiumCapabilities({
        deviceId,
        xcodeConfigFile,
        wdaBundleId: flag('wda-bundle-id', DEFAULT_WDA_BUNDLE_ID),
        nativeApp: true,
      }),
    },
  });
  const sessionId = session.sessionId ?? session.value?.sessionId;
  const results = [];

  try {
    const driver = createDriver(client, sessionId);
    await driver.switchTo(await driver.webContextName());
    await driver.waitFor(CANVAS_SIZED, 'the drawing canvas', BOOT_TIMEOUT_MS);
    // Rotation is locked by default and the lock is a persisted app setting;
    // without this every orientation scenario silently measures one orientation.
    await driver.execute(`localStorage.setItem('splotch-lock-rotation','false'); return true;`);
    await driver.reload();

    results.push({
      name: 'restore-after-LANDSCAPE-start',
      ...(await restoreScenario(driver, 'LANDSCAPE')),
    });
    results.push({
      name: 'restore-after-PORTRAIT-start',
      ...(await restoreScenario(driver, 'PORTRAIT')),
    });
    results.push({ name: 'drag-off-cancels', ...(await dragOffScenario(driver)) });
    results.push({ name: 'wiggle-tap-activates', ...(await wiggleTapScenario(driver)) });
  } finally {
    await client.request('DELETE', `/session/${sessionId}`).catch(() => {});
    console.log(`\n===== ${label} =====`);
    for (const { name, pass, ...detail } of results) {
      console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(detail)}`);
    }
  }

  const failures = results.filter((result) => !result.pass);
  console.log(
    `RESULT ${label}: ${results.length === 4 && failures.length === 0 ? 'ALL PASS' : 'NOT ALL PASS'}`
  );
  return failures.length === 0 && results.length === 4;
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    if (!(await runTapActivationCheck())) process.exit(1);
  });
}
