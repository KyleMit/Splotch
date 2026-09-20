import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT, fail, isMain, pollUntil, runMain, sleep } from '../../lib/proc.mjs';
import {
  IOS_ACTION_GATE_ALLOWANCES,
  MIN_GATED_SAMPLES,
  WARMUP_REPEATS,
  actionFailures,
  actionRows,
  inkRotationActionLabel,
  rotationActionLabel,
  rotationFirstFrameNa,
  summarizeActions,
} from '../lib/action-stats.mjs';
import { captureRuntime } from '../lib/input-fidelity.mjs';
import { DEVICE_CLASSES, NATIVE_TRANSPORT } from '../lib/campaign-plan.mjs';
import { parsePerfArgs } from '../lib/cli-args.mjs';
import { frameStampEpochOf } from '../lib/frame-stamps.mjs';
import {
  BORROWED_SESSION_CAPABILITIES_ERROR,
  appiumCapabilities,
  borrowedSessionDescriptor,
  capabilitiesFromFile,
  capturedDeviceId,
  blockServiceWorkerRegistrationForMeasurement,
  clearDeviceWebCache,
  createWebDriverClient,
  executePagePromise,
  nativeCanvasBounds,
  selectWebContext,
  switchToWebContext,
} from './capture-xcuitest-screen.mjs';
import { ensurePreviewServer, resolveDeviceUrl } from '../lib/profile-device-session.mjs';
import {
  assertServedBuildIsFresh,
  entryModulePath,
  loadedPageEntryProblem,
} from '../lib/profile-preview.mjs';
import { profilePath } from '../lib/profile-paths.mjs';
import { rethrowIfBroken } from '../lib/error-classification.mjs';
import {
  assertPickerNeverOpened,
  firstOpenListedMessage,
  listedBookChoices,
  loadSweepDocumentWithColoringBooks,
  prepareColoringBooks,
} from '../lib/coloring-books-ready.mjs';
import {
  PLATFORM_OWNS_ROTATION,
  SETTINGS_SECTION_ROWS,
  RESOLVED_THEME_EXPRESSION,
  clickSetupElement,
  settingsShellIsCompact as isCompactSettingsShell,
  ensureCampaignTheme,
  parseCampaignTheme,
  readResolvedTheme,
  releaseNativeRotationLock,
  restoreNativeRotationLock,
  settingsSectionRow,
  themeRoundTripPlan,
} from '../lib/campaign-state.mjs';
import {
  COLORING_FIRST_OPEN_ACTION_LABEL,
  COLORING_REOPEN_ACTION_LABEL,
  COLORING_SCROLL_ACTION_LABEL,
  FULL_ACTION_GROUPS,
  compactSettingsActionLabel,
  retiredActionLabelProblem,
} from '../lib/action-applicability.mjs';

const APP_PATH = '/';
const ACTION_PROBE_FILE = join(ROOT, 'tools', 'perf', 'probes', 'action-probe.js');
const ACTION_PANEL_STATE_TARGET = `(document.querySelector('.actions-panel[data-action-panel-live]') ?? document.documentElement)`;
const DEFAULT_APPIUM_URL = 'http://127.0.0.1:4723';
const DEFAULT_XCODE_CONFIG = join(ROOT, 'ios', 'local.xcconfig');
const DEFAULT_WDA_BUNDLE_ID = 'art.splotch.WebDriverAgentRunner';
const DEFAULT_NATIVE_WEBVIEW_CLASS = 'XCUIElementTypeWebView';
// A live Safari or Capacitor WebView covers most of the native window; Appium
// can retain tiny detached WebView nodes that must not define touch geometry.
const MIN_WEBVIEW_WINDOW_AREA_FRACTION = 0.5;
const READY_TIMEOUT_MS = 30_000;
const POLL_MS = 50;
// How long a tap target may keep moving after its surface reports open, before
// the sweep declares the fly-in stuck. The animations themselves are a few
// hundred ms; ten seconds is a hang, not a slow frame.
const TARGET_SETTLE_TIMEOUT_MS = 10_000;
const SCRIPT_TIMEOUT_MS = 45_000;
const ACTION_SETTLE_MS = 650;
const ANIMATED_ACTION_SETTLE_MS = 1_100;
const SCREENSHOT_ACTION_SETTLE_MS = 3_000;
const IDLE_CONTROL_MS = 5_000;
const REPEAT_SETTLE_MS = 500;
const TRUSTED_STROKE_MS = 650;
const CLEAR_DRAG_MS = 450;
const COLORING_SCROLL_MS = 450;
const COLORING_SCROLL_DISTANCE_PX = 400;
// The picker is centred, so its centre column is the screen's. Android drops a
// native touch that starts under untrusted overlay windows whose combined
// opacity passes the platform's obscuring limit, and a one-pixel centre-line
// overlay (a navigation-gesture accessibility service draws one) makes the
// exact centre column the one place an injected swipe can be refused outright.
// Only the native-touch route passes through that check, so only it is moved.
// The offset is in CSS pixels and scaled to the route's native units, which
// keeps it inside the narrowest picker gutter (--space-2) on every device.
const COLORING_SCROLL_OFF_CENTRE_CSS_PX = 2;
const ROTATION_NATIVE_SETTLE_MS = 1_500;
const MAX_SETUP_RECOVERY_ATTEMPTS = 3;
// A capped walk back through history: enough to empty a sweep's own strokes,
// never an unbounded loop against a button that refuses to disable.
const MAX_UNDO_EXHAUST_TAPS = 12;
// A closed stroke-width menu is UNMOUNTED, not hidden (since 478c88ba8), so
// "closed" is the trigger collapsing and the menu element being gone.
export const STROKE_WIDTH_MENU_CLOSED = `document.querySelector('#strokeWidthButton')?.getAttribute('aria-expanded') === 'false' && document.querySelector('.stroke-width-menu') === null`;
// The waiting print's ready cue, by animation name: the wiggle that settles the
// print and the badge that pops on it. The spinner is deliberately absent — it
// loops forever while the picture is still being made, so it can never finish.
const AI_READY_CUE_ANIMATIONS = ['polaroidWiggle', 'badgePop'];
// polaroidWiggle is 150ms + 2 x 2.6s; this is that with room for a slow device.
const AI_READY_CUE_TIMEOUT_MS = 9_000;
// Svelte scopes component keyframes, so the running animation is named
// `svelte-<hash>-polaroidWiggle` in a built bundle and `polaroidWiggle` only in
// source. Matching the source name alone recognised nothing, the wait fell
// through its grace window, and the sample was truncated exactly as before —
// with a source-scanning test still passing (issue #1870 review, round two).
export function isAiReadyCueAnimation(name, cueNames = AI_READY_CUE_ANIMATIONS) {
  if (typeof name !== 'string') return false;
  return cueNames.some((cue) => name === cue || name.endsWith(`-${cue}`));
}
// How long to wait for the cue to exist at all before releasing a build that
// does not play one (a reduced-motion device, or a product that drops it).
const AI_READY_CUE_GRACE_MS = 1_000;
// A run that is going to offer its waiting state does so in a second or two;
// beyond this the flow has failed and the cue is unreachable on this target.
const AI_RUN_READY_TIMEOUT_MS = 8_000;
const ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf';
const ALL_ACTIONS = new Set(FULL_ACTION_GROUPS);

function webContextForClient(client, contexts) {
  const webContext = selectWebContext(contexts, { nativeApp: client.nativeApp });
  if (!webContext) {
    throw new Error(`Appium reported no unambiguous WEBVIEW context: ${contexts.join(', ')}`);
  }
  return webContext;
}

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

export function stableActionPlan(recorded, next) {
  if (!recorded) return next;
  const canonical = (plan) => ({
    ...plan,
    actionGroups: [...plan.actionGroups].sort(),
    applicableLabels: [...plan.applicableLabels].sort(),
    notApplicable: [...plan.notApplicable].sort((left, right) =>
      left.label.localeCompare(right.label)
    ),
    blocked: [...(plan.blocked ?? [])].sort((left, right) => left.label.localeCompare(right.label)),
  });
  if (JSON.stringify(canonical(recorded)) !== JSON.stringify(canonical(next))) {
    const recordedApplicable = new Set(recorded.applicableLabels);
    const nextApplicable = new Set(next.applicableLabels);
    const recordedLabels = new Set([
      ...recorded.applicableLabels,
      ...recorded.notApplicable.map(({ label }) => label),
    ]);
    const nextLabels = new Set([
      ...next.applicableLabels,
      ...next.notApplicable.map(({ label }) => label),
    ]);
    const added = [...nextLabels].filter((label) => !recordedLabels.has(label));
    const removed = [...recordedLabels].filter((label) => !nextLabels.has(label));
    const moved = [...nextLabels].filter(
      (label) =>
        recordedLabels.has(label) && recordedApplicable.has(label) !== nextApplicable.has(label)
    );
    const labelChanges = [
      added.length ? `+${added.join(', ')}` : null,
      removed.length ? `-${removed.join(', ')}` : null,
      moved.length ? `~${moved.join(', ')}` : null,
    ].filter(Boolean);
    const detail = labelChanges.length
      ? labelChanges.join(' ')
      : 'context, action groups, or recorded reasons changed';
    throw new Error(`The applicable action plan changed between scored repeats: ${detail}`);
  }
  return recorded;
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

function sessionCapabilities({
  deviceId,
  xcodeConfigFile,
  wdaBundleId,
  allowProvisioning,
  file,
  nativeApp,
}) {
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
    nativeApp,
  });
}

function resolvedSessionCapabilities(session) {
  return session.capabilities ?? session.value?.capabilities ?? {};
}

export async function createActionSession(client, sessionId, capabilities) {
  if (sessionId) return borrowedSessionDescriptor(sessionId, capabilities);
  return client.request('POST', '/session', {
    capabilities: { alwaysMatch: capabilities },
  });
}

export function validateBorrowedActionSession(sessionId, capabilitiesFile) {
  if (sessionId && !capabilitiesFile) throw new Error(BORROWED_SESSION_CAPABILITIES_ERROR);
}

function capabilityValue(capabilities, name) {
  return capabilities?.[name] ?? capabilities?.[`appium:${name}`];
}

export function isPhysicalAppleUdid(value) {
  return /^(?:[0-9a-f]{8}-[0-9a-f]{16}|[0-9a-f]{40})$/i.test(String(value ?? ''));
}

// XCUITest returns no `deviceName` for a physical device — the session names only
// udid, platformName, platformVersion and browserName — so a ledger scoped to iPads
// could never reach one, and ADR-0090's exception sat unreachable. Nothing in the
// session carries a device class, and screen size cannot supply it either: an iPad
// mini is 744 px wide, below any tablet breakpoint that would exclude a phone. The
// campaign is the layer that knows which device it queued, so it says so, and a
// Simulator's `deviceName` still answers for a hand-run capture.
// Read from the negotiated session rather than from flags: this command drives
// Android through a capabilities file as well as the iPad, so the platform is
// a property of the session that was actually opened.
export function sessionPlatformName({ requestedCapabilities, session }) {
  const sessionCapabilities = resolvedSessionCapabilities(session);
  return String(
    capabilityValue(sessionCapabilities, 'platformName') ??
      capabilityValue(requestedCapabilities, 'platformName') ??
      ''
  ).toLowerCase();
}

function physicalIosWebIdentity({ nativeApp, deviceId, requestedCapabilities, session }) {
  const sessionCapabilities = resolvedSessionCapabilities(session);
  const deviceName = String(
    capabilityValue(sessionCapabilities, 'deviceName') ??
      capabilityValue(requestedCapabilities, 'deviceName') ??
      ''
  ).toLowerCase();
  const physicalDevice = [
    deviceId,
    capabilityValue(sessionCapabilities, 'udid'),
    capabilityValue(requestedCapabilities, 'udid'),
  ].some(isPhysicalAppleUdid);
  const isPhysicalIosWeb =
    !nativeApp && sessionPlatformName({ requestedCapabilities, session }) === 'ios' && physicalDevice;
  return {
    isPhysicalIosWeb,
    namesIpad: deviceName.includes('ipad'),
    namesIphone: deviceName.includes('iphone'),
  };
}

export function parseDeviceClass(value) {
  if (value === undefined || DEVICE_CLASSES.includes(value)) return value;
  throw new Error(`--device-class must be one of ${DEVICE_CLASSES.join(', ')}`);
}

export function actionGateAllowances(classification) {
  const { isPhysicalIosWeb, namesIpad } = physicalIosWebIdentity(classification);
  const isTablet = classification.deviceClass === 'tablet' || namesIpad;
  return isPhysicalIosWeb && isTablet ? IOS_ACTION_GATE_ALLOWANCES : {};
}

// Physical identity alone must not imply a tablet — an iPhone is a legitimate
// capture on base gates — so an unclassified session is announced, not inferred.
// A device name that names neither an iPad nor an iPhone classifies nothing: it
// records base gates exactly as silently as no name at all.
export function unclassifiedDeviceWarning(classification) {
  const { isPhysicalIosWeb, namesIpad, namesIphone } = physicalIosWebIdentity(classification);
  const isClassified =
    DEVICE_CLASSES.includes(classification.deviceClass) || namesIpad || namesIphone;
  if (!isPhysicalIosWeb || isClassified) return null;
  return '[ipad-actions] Physical iOS Safari capture without --device-class: base gates will be recorded';
}

export function settingsSectionMeasurement(section, label, settingsModalUsesSidebar) {
  const selector = settingsSectionRow(section);
  const sectionReady = settingsModalUsesSidebar
    ? `document.querySelector(${JSON.stringify(selector)})?.getAttribute('aria-current') === 'location'`
    : `document.querySelector('#settingsModal .settings-back') !== null`;
  if (section !== 'parentCenter') {
    return { label: `open Settings section: ${label}`, ready: sectionReady };
  }
  return {
    label: 'open Parent Center',
    ready: `document.querySelector('#parentalGate')?.open === true || (${sectionReady})`,
  };
}

export function settingsSectionLabelSelector(section, settingsModalUsesSidebar) {
  const selector = settingsSectionRow(section);
  return settingsModalUsesSidebar
    ? `${selector} [data-toc-label]`
    : `${selector} .hub-title`;
}

export function settingsSectionSetupReady(section, ready, settingsModalUsesSidebar) {
  if (!settingsModalUsesSidebar) return ready;
  const selector = settingsSectionRow(section);
  return `(${ready}) && document.querySelector(${JSON.stringify(selector)})?.getAttribute('aria-current') === 'location'`;
}

export async function runToggleRoundTrip({
  baseline,
  initial,
  setState,
  recordState,
  whileAtBaseline,
  baselineHint = 'baseline',
  originalStateHint = 'original state',
}) {
  try {
    await setState(baseline, baselineHint);
    for (const next of [!baseline, baseline]) await recordState(next);
    await whileAtBaseline?.();
  } finally {
    await setState(initial, originalStateHint);
  }
}

export async function runScreenshotToggleAtDrawerBaseline({
  openSavingSection,
  recordScreenshotToggle,
  reopenControlsSection,
}) {
  await openSavingSection();
  try {
    await recordScreenshotToggle();
  } finally {
    await reopenControlsSection();
  }
}

export function coloringSelectionSteps(hasBookChoice) {
  const steps = [];
  if (hasBookChoice) {
    steps.push({
      label: 'open coloring book',
      selector: '#coloring-book-dialog button[aria-label$="coloring book"]',
      ready: `document.querySelector('#coloring-book-dialog button[aria-label$="coloring page"]') !== null`,
      settleMs: ANIMATED_ACTION_SETTLE_MS,
      activation: 'webdriver',
    });
  }
  steps.push({
    label: 'select coloring page',
    selector: '#coloring-book-dialog button[aria-label$="coloring page"]',
    ready: `document.querySelector('#coloring-book-dialog')?.open !== true && document.querySelector('#coloringOverlay')?.classList.contains('overlay-ready') && document.querySelector('#coloringOverlay')?.naturalWidth > 0`,
    settleMs: ANIMATED_ACTION_SETTLE_MS,
    activation: 'webdriver',
  });
  return steps;
}

async function openColoringPickerForSetup(execute) {
  await clickSetupElement(execute, '#coloringBookButton');
  await waitForReady(
    execute,
    `document.querySelector('#coloring-book-dialog')?.open === true`,
    'coloring books to open for setup'
  );
}

async function closeColoringPickerForSetup(execute) {
  await closeDialogs(execute);
  await waitForReady(
    execute,
    `document.querySelector('#coloring-book-dialog')?.open !== true`,
    'coloring books to close after setup'
  );
  await sleep(ANIMATED_ACTION_SETTLE_MS);
}

// The runner-facing half of the first-open contract: a sweep that includes
// `coloring` settles its books in a preparation document and hands the sweep a
// document the picker has never opened in.
export async function loadActionSweepDocument({ actions, execute, executePromise, loadDocument }) {
  if (!actions.has('coloring')) {
    await loadDocument();
    return { listedColoringBooks: null, preparationMs: null, documentLoads: 1 };
  }
  return loadSweepDocumentWithColoringBooks({
    loadDocument,
    execute,
    executePromise,
    prepare: () =>
      prepareColoringBooks({
        execute,
        executePromise,
        openPicker: () => openColoringPickerForSetup(execute),
        closePicker: () => closeColoringPickerForSetup(execute),
      }),
  });
}

export function logColoringPreparation({ listedColoringBooks, preparationMs, documentLoads }) {
  if (preparationMs === null) return;
  console.log(
    `Coloring books prepared in ${preparationMs} ms: ${listedColoringBooks} listed; the sweep runs in document ${documentLoads} of this repeat`
  );
}

async function showColoringBookChoices(execute) {
  const drilledIntoBook = await execute(
    `return document.querySelector('#coloring-book-dialog .coloring-back-button') !== null;`
  );
  if (!drilledIntoBook) return;
  await clickSetupElement(execute, '#coloring-book-dialog .coloring-back-button');
  await waitForReady(
    execute,
    `document.querySelector('#coloring-book-dialog button[aria-label$="coloring book"]') !== null`,
    'coloring book choices'
  );
  await sleep(ANIMATED_ACTION_SETTLE_MS);
}

export function coloringClearActivation() {
  return 'native-accessibility';
}

export function coloringScrollTransport(client) {
  return client.useWheelForScroll === true
    ? { eventTypes: ['wheel'], activation: 'trusted-wheel' }
    : { eventTypes: ['pointerdown'], activation: 'native-touch' };
}

export function customColorSelectionEventTypes() {
  return ['pointerdown'];
}

export function visibleInactiveSwatchColorExpression() {
  return `
    const swatch = [...document.querySelectorAll('.color-swatch:not(.active):not(.gradient-swatch)')]
      .find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
    return swatch?.dataset.color;
  `;
}

export function screenshotActivation(nativeApp) {
  return nativeApp ? 'native-accessibility-click' : 'native';
}

export function activationModeFor({ activation, webdriverClicks, hasNativeTarget }) {
  if (webdriverClicks) return 'webdriver-script-click';
  if (hasNativeTarget) return 'native-touch';
  if (activation === 'native-accessibility-click') return 'native-accessibility-click';
  return 'webdriver-element-click';
}

export function nativeAccessibilityFallbackWarning(label, activation, activationMode) {
  if (activation !== 'native-accessibility' || activationMode !== 'webdriver-element-click') {
    return null;
  }
  return `[ipad-actions] ${label} fell back from native accessibility to WebDriver element click`;
}

export function uiActivationLabel(samples) {
  return [...new Set(samples.map((sample) => sample.activation))].join('+');
}

export function largestNativeRect(rects, fallback) {
  if (!rects.length) return fallback;
  const largest = rects.reduce((largest, rect) =>
    rect.width * rect.height > largest.width * largest.height ? rect : largest
  );
  const largestArea = largest.width * largest.height;
  const fallbackArea = fallback.width * fallback.height;
  return largestArea >= fallbackArea * MIN_WEBVIEW_WINDOW_AREA_FRACTION ? largest : fallback;
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

// A fly-in moves its tap targets between coordinate resolution and the tap,
// and a fast transport (CDP touch) lands while they are still moving. Tap only
// once the target's rect holds still across consecutive polls.
async function waitForTargetToHoldStill(execute, selector, failure) {
  const stable = await pollUntil(
    () =>
      execute(
        `const el = document.querySelector(${JSON.stringify(selector)});
         if (!el) return false;
         const r = el.getBoundingClientRect();
         const key = [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10)).join(',');
         const probes = (window.__targetRectProbes ??= {});
         const prev = probes[${JSON.stringify(selector)}];
         probes[${JSON.stringify(selector)}] = key;
         return prev === key && r.width > 0;`
      ).catch((error) => {
        rethrowIfBroken(error);
        return false;
      }),
    TARGET_SETTLE_TIMEOUT_MS,
    POLL_MS
  );
  if (!stable) throw new Error(failure);
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
  let nativeTarget = null;
  if (!client.webdriverClicks) {
    if (activation === 'native') {
      nativeTarget = await nativeBoundsForSelector(client, sessionId, execute, selector);
    } else if (activation === 'native-accessibility') {
      nativeTarget = await nativeAccessibilityBoundsForSelector(
        client,
        sessionId,
        execute,
        selector
      ).catch(() => null);
    }
  }
  await ensureActionProbe(execute);
  await execute(
    `return window.__actionProbe.begin(${JSON.stringify(label)}, ${JSON.stringify(
      selector
    )}, ${JSON.stringify(eventTypes ?? ['pointerup', 'click'])});`
  );
  const activationMode = activationModeFor({
    activation,
    webdriverClicks: client.webdriverClicks,
    hasNativeTarget: nativeTarget !== null,
  });
  const fallbackWarning = nativeAccessibilityFallbackWarning(label, activation, activationMode);
  if (fallbackWarning) console.warn(fallbackWarning);
  if (activationMode === 'native-touch') {
    const x = Math.round(nativeTarget.bounds.x + nativeTarget.bounds.width / 2);
    const y = Math.round(nativeTarget.bounds.y + nativeTarget.bounds.height / 2);
    await performNativeGesture(client, sessionId, nativeTarget.webContext, [
      { type: 'pointerMove', duration: 0, origin: 'viewport', x, y },
      { type: 'pointerDown', button: 0 },
      { type: 'pause', duration: 80 },
      { type: 'pointerUp', button: 0 },
    ]);
  } else if (activationMode === 'native-accessibility-click') {
    await clickNativeAccessibilityElement(client, sessionId, execute, selector);
  } else if (activationMode === 'webdriver-script-click') {
    await clickSetupElement(execute, selector);
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
      // finish() harvests the armed action even after a timeout, and its record
      // answers the question the timeout cannot: eventType 'uncaptured' means the
      // activation never reached the target, while a captured event with no
      // canvas mutations means the handler ran and the product did nothing.
      let probe = null;
      try { probe = window.__actionProbe?.finish(); } catch (probeError) { probe = { error: String(probeError) }; }
      return {
        probe: probe && {
          armedEvents: probe.armedEvents,
          eventType: probe.eventType,
          trusted: probe.trusted,
          activities: probe.activities,
          canvasMutations: probe.canvasMutations,
          measures: probe.measures?.map((m) => m.name),
          error: probe.error
        },
        undoDisabled: document.querySelector('#undoButton')?.getAttribute('aria-disabled'),
        screenshotDisabled: document.querySelector('#screenshotButton')?.disabled,
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

// A scroll timeout alone cannot say whether the gesture never arrived or arrived
// and moved nothing. The armed probe's record separates them: eventType
// 'uncaptured' means no pointerdown reached the dialog, while a trusted captured
// event beside an unmoved scrollTop means the page received the touch and did
// not scroll.
function unscrolledColoringDialogState(execute, selector) {
  return execute(`
    const dialog = document.querySelector(${JSON.stringify(selector)});
    let probe = null;
    try { probe = window.__actionProbe?.finish(); } catch (probeError) { probe = { error: String(probeError) }; }
    return {
      probe: probe && {
        armedEvents: probe.armedEvents,
        eventType: probe.eventType,
        trusted: probe.trusted,
        error: probe.error
      },
      dialog: dialog ? {
        open: dialog.open,
        scrollTop: dialog.scrollTop,
        scrollHeight: dialog.scrollHeight,
        clientHeight: dialog.clientHeight,
        overflowY: getComputedStyle(dialog).overflowY
      } : null,
      openDialogs: [...document.querySelectorAll('dialog[open]')].map((open) => open.id)
    };
  `);
}

// Exported to exercise dispatch and captured provenance together without a physical device.
export async function measureColoringPageScroll(client, sessionId, execute) {
  const selector = '#coloring-book-dialog';
  const scrollability = await execute(`
    const dialog = document.querySelector(${JSON.stringify(selector)});
    return {
      dialogOpen: !!dialog?.open,
      scrollable: !!dialog?.open && dialog.scrollHeight > dialog.clientHeight,
      cssWidth: dialog?.getBoundingClientRect().width
    };
  `);
  if (!scrollability.dialogOpen) {
    throw new Error('The coloring-book dialog closed before its scrollability check');
  }
  if (!scrollability.scrollable) {
    return {
      sample: null,
      notApplicableReason: 'the coloring-page grid fits without scrolling in this target mode',
    };
  }

  const transport = coloringScrollTransport(client);
  const useWheel = transport.activation === 'trusted-wheel';
  let scrollDelivery = null;
  let touchGesture = null;
  await ensureActionProbe(execute);
  await execute(
    `return window.__actionProbe.begin(${JSON.stringify(COLORING_SCROLL_ACTION_LABEL)}, ${JSON.stringify(selector)}, ${JSON.stringify(
      transport.eventTypes
    )});`
  );
  if (useWheel) {
    await client.scrollElementWithWheel(selector, COLORING_SCROLL_DISTANCE_PX);
  } else {
    const { bounds, webContext } = await nativeBoundsForSelector(
      client,
      sessionId,
      execute,
      selector
    );
    const nativeUnitsPerCssPx = bounds.width / scrollability.cssWidth;
    const offCentre = client.cdp ? 0 : COLORING_SCROLL_OFF_CENTRE_CSS_PX * nativeUnitsPerCssPx;
    const x = Math.round(bounds.x + bounds.width / 2 + offCentre);
    const startY = Math.round(bounds.y + bounds.height * 0.75);
    const endY = Math.round(bounds.y + bounds.height * 0.3);
    touchGesture = { x, startY, endY };
    if (client.cdp) {
      await client.scrollTouchGesture({ x, startY, endY, durationMs: COLORING_SCROLL_MS });
      scrollDelivery = 'cdp-synthesized-scroll';
    } else {
      await performNativeGesture(client, sessionId, webContext, [
        { type: 'pointerMove', duration: 0, origin: 'viewport', x, y: startY },
        { type: 'pointerDown', button: 0 },
        {
          type: 'pointerMove',
          duration: COLORING_SCROLL_MS,
          origin: 'viewport',
          x,
          y: endY,
        },
        { type: 'pointerUp', button: 0 },
      ]);
    }
  }
  let readyAt;
  try {
    readyAt = await waitForReady(
      execute,
      `document.querySelector(${JSON.stringify(selector)})?.scrollTop > 0`,
      'coloring pages to scroll'
    );
  } catch (error) {
    const state = await unscrolledColoringDialogState(execute, selector).catch((stateError) => ({
      stateReadError: String(stateError),
    }));
    throw new Error(`${error.message}\nScroll state: ${JSON.stringify({ ...state, touchGesture })}`, {
      cause: error,
    });
  }
  await sleep(ACTION_SETTLE_MS);
  const sample = await execute(`return window.__actionProbe.finish(${readyAt});`);
  await execute(`document.querySelector(${JSON.stringify(selector)}).scrollTop = 0; return true;`);
  await sleep(ACTION_SETTLE_MS);
  return {
    sample: {
      ...sample,
      activation: transport.activation,
      ...(scrollDelivery ? { scrollDelivery } : {}),
    },
    notApplicableReason: null,
  };
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
  // Defensive scroll reset with reporting. The 32px post-rotation touch offset
  // (issue 1237) is NOT visible here — scrollX/scrollY and visualViewport all
  // read zero while taps land 32px high, so this reset cannot be its fix (see
  // docs/scratchpad/2026-08-25-native-rotation-undo-tap.md). It exists so that
  // if web-visible displacement ever DOES appear, the capture log names it and
  // the tap math measures from the app's intended origin instead of silently
  // absorbing it.
  const webGeometry = await execute(`
    const displaced = {
      x: scrollX, y: scrollY,
      vvLeft: visualViewport?.offsetLeft ?? 0, vvTop: visualViewport?.offsetTop ?? 0
    };
    if (displaced.x || displaced.y) scrollTo(0, 0);
    const rect = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect();
    if (!rect) return null;
    return {
      canvas: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      viewport: { width: innerWidth, height: innerHeight },
      displaced
    };
  `);
  if (!webGeometry) throw new Error(`No native-gesture target matches ${selector}`);
  const { displaced } = webGeometry;
  if (displaced && (displaced.x || displaced.y || displaced.vvLeft || displaced.vvTop)) {
    const reset = displaced.x || displaced.y ? 'scroll reset applied' : 'visual-viewport only, no reset';
    console.warn(
      `web content displaced before ${selector} tap: ${JSON.stringify(displaced)} — ${reset}`
    );
  }
  const contexts = await client.request('GET', `/session/${sessionId}/contexts`);
  const webContext = webContextForClient(client, contexts);
  await client.request('POST', `/session/${sessionId}/context`, { name: 'NATIVE_APP' });
  const nativeWindow = await client.request('GET', `/session/${sessionId}/window/rect`);
  const webViews = await client
    .request('POST', `/session/${sessionId}/elements`, {
      using: 'class name',
      value: client.nativeWebViewClass ?? DEFAULT_NATIVE_WEBVIEW_CLASS,
    })
    .catch(() => []);
  const webViewRects = (
    await Promise.all(
      webViews.map((webView) => {
        const webViewId = webView[ELEMENT_KEY] ?? webView.ELEMENT;
        return client
          .request('GET', `/session/${sessionId}/element/${webViewId}/rect`)
          .catch(() => null);
      })
    )
  ).filter(Boolean);
  const webViewBounds = largestNativeRect(webViewRects, nativeWindow);
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
  const webContext = webContextForClient(client, contexts);
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

async function nativeAccessibilityBoundsForSelector(client, sessionId, execute, selector) {
  const name = await execute(
    `return document.querySelector(${JSON.stringify(selector)})?.getAttribute('aria-label');`
  );
  if (!name) throw new Error(`No accessible native-gesture target matches ${selector}`);
  return nativeAccessibilityBounds(client, sessionId, name);
}

async function clickNativeAccessibilityElement(client, sessionId, execute, selector) {
  const name = await execute(
    `return document.querySelector(${JSON.stringify(selector)})?.getAttribute('aria-label');`
  );
  if (!name) throw new Error(`No accessible native click target matches ${selector}`);
  const contexts = await client.request('GET', `/session/${sessionId}/contexts`);
  const webContext = webContextForClient(client, contexts);
  await client.request('POST', `/session/${sessionId}/context`, { name: 'NATIVE_APP' });
  try {
    const element = await client.request('POST', `/session/${sessionId}/element`, {
      using: 'accessibility id',
      value: name,
    });
    const elementId = element[ELEMENT_KEY] ?? element.ELEMENT;
    await client.request('POST', `/session/${sessionId}/element/${elementId}/click`);
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
        ).catch((error) => {
        rethrowIfBroken(error);
        return false;
      }),
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
    `).catch((error) => {
        rethrowIfBroken(error);
        return false;
      });
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
  // Anchored at `resize` only: which of orientationchange/resize arrives first
  // is a per-runtime race, and the loser of that race is the browser's own
  // rotation transition — a window the page cannot paint into. ADR-0142 holds
  // the measurements and the per-runtime meaning of the first-frame gate under
  // this anchor. The orientation events still land in the sample's activities.
  await execute(
    `return window.__actionProbe.beginExternal(${JSON.stringify(label)}, ['resize']);`
  );
  await client.request('POST', `/session/${sessionId}/context`, { name: 'NATIVE_APP' });
  await client.request('POST', `/session/${sessionId}/orientation`, { orientation: to });
  await sleep(ROTATION_NATIVE_SETTLE_MS);
  const contexts = await client.request('GET', `/session/${sessionId}/contexts`);
  const webContext = webContextForClient(client, contexts);
  await client.request('POST', `/session/${sessionId}/context`, { name: webContext });
  const readyAt = await waitForReady(
    execute,
    to === 'PORTRAIT' ? 'innerHeight > innerWidth' : 'innerWidth > innerHeight',
    rotationActionLabel(from, to),
    READY_TIMEOUT_MS
  );
  await sleep(ANIMATED_ACTION_SETTLE_MS);
  const sample = await execute(`return window.__actionProbe.finish(${readyAt});`);
  return { ...sample, activation: 'native-system' };
}

// Enough of the stub's URL log to show what the run fetched without letting a
// chatty page bloat every artifact.
const AI_RUN_RECORDED_URLS = 20;

// The AI waiting print is reached through the __aiGenerate dev seam (ADR-0109)
// with the generate endpoint answered inside the page, so the cue runs on every
// target without a network round trip, a key, or the parental gate. The mocked
// response is held until the run releases it: that is what separates the waiting
// cue (arrival, wiggle) from the badge that lands when the picture arrives.
async function installAiGenerationStub(execute) {
  return execute(`
    window.__perfAiOriginalFetch ??= window.fetch.bind(window);
    window.__perfAiRelease = false;
    window.__perfAiSeenUrls = [];
    window.fetch = async function (input, init) {
      const url = typeof input === 'string' ? input : (input?.url ?? String(input));
      window.__perfAiSeenUrls.push(url.slice(0, 120));
      if (!url.includes('/api/generate-image')) return window.__perfAiOriginalFetch(input, init);
      while (!window.__perfAiRelease) await new Promise((resolve) => setTimeout(resolve, 50));
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 384;
      const context = canvas.getContext('2d');
      context.fillStyle = '#b9d9ff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#ff9ec3';
      context.beginPath();
      context.arc(256, 192, 120, 0, Math.PI * 2);
      context.fill();
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      return new Response(blob, { status: 200, headers: { 'content-type': 'image/jpeg' } });
    };
    return true;
  `);
}

async function removeAiGenerationStub(execute) {
  return execute(`
    if (window.__perfAiOriginalFetch) window.fetch = window.__perfAiOriginalFetch;
    delete window.__perfAiOriginalFetch;
    delete window.__perfAiRelease;
    delete window.__perfAiSeenUrls;
    delete window.__perfAiRunError;
    return true;
  `);
}

// The waiting print is the minimized face of a run (AiWaitingPolaroid renders
// only while aiGenerationState.minimized), so the measured activation is the
// "Keep drawing while you wait" button inside the AI dialog, not the seam call.
// Returns the run's state rather than throwing: a target where the generation
// flow cannot reach its waiting state records the gap and lets the rest of the
// sweep run, which is what a capture needs from a cue it cannot reach.
async function startAiRun(execute) {
  await execute(`
    window.__perfAiSeenUrls = [];
    window.__perfAiRunError = null;
    Promise.resolve(window.__aiGenerate({ style: 'Magical' })).catch((error) => {
      window.__perfAiRunError = String((error && (error.message || error)) || error).slice(0, 200);
    });
    return true;
  `);
  try {
    await waitForReady(
      execute,
      `document.querySelector('.ai-keep-drawing button') !== null`,
      'the AI run to offer "Keep drawing while you wait"',
      AI_RUN_READY_TIMEOUT_MS
    );
  } catch (error) {
    // Only "the waiting state never arrived" is an unreachable cue; a broken
    // script or selector must still fail the sweep (issue 1296's rule).
    rethrowIfBroken(error);
    return { offered: false, state: await aiRunState(execute) };
  }
  await sleep(ACTION_SETTLE_MS);
  const offered = await execute(
    `return document.querySelector('.ai-keep-drawing button') !== null;`
  );
  return offered ? { offered: true } : { offered: false, state: await aiRunState(execute) };
}

// A completed waiting print proves the UI ran, not how. Its artifact has to show
// the page was a secure context with the crypto APIs the free-generation path
// calls, and that every generate request it made was answered by the in-page
// stub, never the network (issue #1870: a LAN http:// page has neither API).
// Pure so the refusal can be tested without a device.
export function aiRunEvidenceProblem(state) {
  if (!state || typeof state !== 'object') return 'the page returned no AI run state';
  if (state.secureContext !== true) return `the page was not a secure context (${state.origin})`;
  if (state.randomUUID !== 'function') return `crypto.randomUUID was ${state.randomUUID}`;
  if (state.subtleCrypto !== 'object') return `crypto.subtle was ${state.subtleCrypto}`;
  if (state.runError) return `the run reported ${state.runError}`;
  if (state.failedUi) return `the dialog showed its error face (${state.message})`;
  if (!(state.generateCalls >= 1)) {
    return 'no generate request reached the in-page stub, so the print was not the mocked run';
  }
  return null;
}

async function aiRunState(execute) {
  return execute(`
    const q = (selector) => document.querySelector(selector);
    const text = (selector) => {
      const node = q(selector);
      return node ? String(node.textContent).trim().slice(0, 90) : null;
    };
    return {
      failedUi: text('.ai-result-error') !== null,
      message: text('.ai-result-error'),
      requests: (window.__perfAiSeenUrls || []).length,
      urls: (window.__perfAiSeenUrls || []).slice(0, ${AI_RUN_RECORDED_URLS}),
      generateCalls: (window.__perfAiSeenUrls || []).filter((url) =>
        url.includes('/api/generate-image')
      ).length,
      runError: window.__perfAiRunError || null,
      // The usual answer when a device fails a flow the desktop passes: the
      // device dials a LAN IP, which is not a trustworthy origin, so
      // secure-context-only APIs are missing from the same build.
      secureContext: window.isSecureContext === true,
      randomUUID: typeof crypto.randomUUID,
      subtleCrypto: typeof crypto.subtle,
      origin: location.origin,
    };
  `);
}

async function measureAiWaitingBadge(execute) {
  await ensureActionProbe(execute);
  await execute(`
    window.__actionProbe.beginExternal('finish AI waiting print', []);
    window.__actionProbe.markExternalAction();
    window.__perfAiRelease = true;
    return true;
  `);
  const readyAt = await waitForReady(
    execute,
    `document.querySelector('.polaroid-badge') !== null`,
    'the AI waiting print to show its badge'
  );
  // The ready cue is the longest in the app — polaroidWiggle runs 2.6s twice
  // after a 150ms delay, and the badge pops for 560ms — and #1870 is asking
  // precisely whether a cue that now runs longer costs more per frame. A fixed
  // settle would stop the sample a second in and score none of it, so the window
  // closes when the cue's own animations do. The spinner is excluded by name: it
  // loops forever while the picture is still being made.
  await execute(`
    const cueNames = ${JSON.stringify(AI_READY_CUE_ANIMATIONS)};
    const deadline = performance.now() + ${AI_READY_CUE_TIMEOUT_MS};
    const isCue = (name) =>
      typeof name === 'string' && cueNames.some((cue) => name === cue || name.endsWith('-' + cue));
    const cuesNow = () =>
      (document.querySelector('.ai-waiting-polaroid')?.getAnimations?.({ subtree: true }) ?? [])
        .filter((animation) => isCue(animation.animationName));
    window.__perfAiCueSettled = false;
    window.__perfAiCueSeen = 0;
    // Re-queried rather than snapshotted: the badge's animation does not exist
    // yet in the turn the badge appears, and a one-shot read settles instantly
    // on an empty list — which scored 124 frames of a cue that runs for five
    // seconds. A cue that never appears still releases, at the grace deadline.
    void (async () => {
      const grace = performance.now() + ${AI_READY_CUE_GRACE_MS};
      for (;;) {
        const cues = cuesNow();
        window.__perfAiCueSeen = Math.max(window.__perfAiCueSeen, cues.length);
        if (cues.length > 0) {
          await Promise.allSettled(cues.map((animation) => animation.finished));
          if (cuesNow().length === 0) break;
        } else if (window.__perfAiCueSeen > 0 || performance.now() > grace) {
          break;
        }
        if (performance.now() > deadline) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      window.__perfAiCueSettled = true;
    })();
    return true;
  `);
  await waitForReady(
    execute,
    `window.__perfAiCueSettled === true`,
    'the AI ready cue to finish',
    AI_READY_CUE_TIMEOUT_MS
  );
  await sleep(ACTION_SETTLE_MS);
  const sample = await execute(`return window.__actionProbe.finish(${readyAt});`);
  await execute(`delete window.__perfAiCueSettled; delete window.__perfAiCueSeen; return true;`);
  return { ...sample, activation: 'driver' };
}

// Undo at the end of history answers with the shake-and-flash instead of undoing
// (ActionsPanel.handleUndoClick), so the cue needs an exhausted history to reach.
async function exhaustUndoHistory(execute) {
  for (let attempt = 0; attempt < MAX_UNDO_EXHAUST_TAPS; attempt += 1) {
    if (await execute(`return document.querySelector('#undoButton')?.getAttribute('aria-disabled') === 'true';`))
      return true;
    await clickSetupElement(execute, '#undoButton');
    await sleep(ANIMATED_ACTION_SETTLE_MS);
  }
  return execute(
    `return document.querySelector('#undoButton')?.getAttribute('aria-disabled') === 'true';`
  );
}

async function closeColoringPage(execute) {
  await clickSetupElement(execute, '#coloringBookButton');
  await waitForReady(
    execute,
    `document.querySelector('#coloring-book-dialog')?.open === true`,
    'coloring books to put the page back'
  );
  await sleep(ANIMATED_ACTION_SETTLE_MS);
  await clickSetupElement(
    execute,
    '#coloring-book-dialog button[aria-label^="Clear active coloring page:"]'
  );
  await waitForReady(
    execute,
    `document.querySelector('#coloring-book-dialog')?.open !== true && document.querySelector('#coloringOverlay')?.hidden === true`,
    'the coloring page to be put back'
  );
  await sleep(ANIMATED_ACTION_SETTLE_MS);
}

async function openColoringPageForClear(execute) {
  await clickSetupElement(execute, '#coloringBookButton');
  await waitForReady(
    execute,
    `document.querySelector('#coloring-book-dialog')?.open === true`,
    'coloring books for the coloring-page clear'
  );
  await sleep(ANIMATED_ACTION_SETTLE_MS);
  await showColoringBookChoices(execute);
  const hasBookChoice = await execute(
    `return document.querySelector('#coloring-book-dialog button[aria-label$="coloring book"]') !== null;`
  );
  for (const step of coloringSelectionSteps(hasBookChoice)) {
    await clickSetupElement(execute, step.selector);
    await waitForReady(execute, step.ready, step.label);
    await sleep(ANIMATED_ACTION_SETTLE_MS);
  }
  return execute(
    `return document.querySelector('#coloringOverlay')?.hidden === false && document.querySelector('#coloringOverlay')?.naturalWidth > 0;`
  );
}

// Every runActionSweep caller finalizes its verdict through these two, so
// blocked coverage fails a capture on every target rather than only on the one
// whose runner happened to remember it. The rival review of the change that
// introduced blocked coverage found the desktop and Android runners still
// passing it — and Android serves an http LAN origin by default, the very
// insecure-origin condition that blocks the AI cue (issue #1870).
export function actionCaptureVerdict({ failures, actionPlan }) {
  const blockedCoverage = actionPlan?.blocked ?? [];
  return { blockedCoverage, passed: failures.length === 0 && blockedCoverage.length === 0 };
}

export function reportActionCaptureVerdict({ failures, blockedCoverage, reportOnly }) {
  if (blockedCoverage.length) {
    console.log('\nBLOCKED coverage — required actions this capture could not measure');
    console.table(blockedCoverage.map(({ label, reason }) => ({ action: label, reason })));
  }
  if ((failures.length || blockedCoverage.length) && !reportOnly) {
    const reasons = [
      failures.length && `Action frame gates failed: ${failures.map((s) => s.label).join(', ')}`,
      blockedCoverage.length &&
        `Blocked coverage: ${blockedCoverage.map(({ label }) => label).join(', ')}`,
    ].filter(Boolean);
    throw new Error(reasons.join('; '));
  }
}

// The menu closing is the product's visible answer to a pick, but a tap that
// missed the option closes it too, so closing alone proves nothing about the
// width. The product's own menu is the proof: reopened, it marks the active
// size. Unmeasured, and it leaves the menu closed and the new size active,
// exactly as the pick itself did, for whatever group runs next.
// Exported for its behavioural test; the sweep is its only production caller.
export async function verifyStrokeWidthPicked(execute, pickedSize) {
  await clickSetupElement(execute, '#strokeWidthButton');
  await waitForReady(
    execute,
    `document.querySelector('#strokeWidthButton')?.getAttribute('aria-expanded') === 'true' && document.querySelector('.stroke-width-menu button[aria-pressed="true"]') !== null`,
    'the stroke-width menu to reopen for verification'
  );
  const active = await execute(
    `return document.querySelector('.stroke-width-menu button[aria-pressed="true"]')?.getAttribute('aria-label') ?? null;`
  );
  await clickSetupElement(execute, '#strokeWidthButton');
  await waitForReady(
    execute,
    STROKE_WIDTH_MENU_CLOSED,
    'the stroke-width menu to close after verification'
  );
  await sleep(ACTION_SETTLE_MS);
  if (active !== pickedSize) {
    throw new Error(
      `The stroke width did not change: the sweep tapped ${pickedSize}, and the menu now marks ${active ?? 'no size'} as active`
    );
  }
}

export async function runActionSweep({
  client,
  sessionId,
  execute,
  actions,
  originalOrientation,
  baselineTheme = 'dark',
  listedColoringBooks = null,
}) {
  const samples = [];
  const applicableLabels = new Set();
  const notApplicable = new Map();
  // Not the same thing as notApplicable, and the distinction is the point: a
  // not-applicable action is one this target mode's plan never offers, while a
  // BLOCKED action is required coverage the run could not obtain. Blocked
  // coverage fails the capture, so a sweep that could not reach a cue can never
  // be read as a green campaign (issue #1870).
  const blocked = new Map();
  const record = async (promise) => {
    const sample = await promise;
    const retired = retiredActionLabelProblem(sample.label);
    if (retired) throw new Error(retired);
    applicableLabels.add(sample.label);
    samples.push(sample);
  };
  const recordToggleRoundTrip = async ({
    label,
    selector,
    readyFor,
    stateAttribute = 'aria-checked',
    baseline,
    whileAtBaseline,
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
    await runToggleRoundTrip({
      baseline,
      initial,
      setState,
      recordState: (next) =>
        record(
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
        ),
      whileAtBaseline,
      baselineHint: `${label} baseline`,
      originalStateHint: `${label} original state`,
    });
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
    const color = await execute(visibleInactiveSwatchColorExpression());
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
    // The first non-selected hexagon can carry a hue the PALETTE also carries
    // (the landscape transpose's first cell is the palette pink), and the app
    // deliberately routes an exact palette hue to its palette swatch instead
    // of the gradient swatch — so a ready condition demanding the gradient
    // swatch can never come true for that pick. Completion is judged by what
    // BOTH routings do: the picker closes and the selection ring moves.
    const hexSelector = `#color-picker .grid.${colorGrid} .hexagon:not(.selected)`;
    // The dialog's fly-in moves the hexagon between coordinate resolution and
    // the native tap. In a short landscape viewport the displacement is large
    // enough that the tap lands on the backdrop and light-dismisses the picker
    // with no selection — both landscape action cells of the 2026-08-26
    // android recapture failed here deterministically, with the transition-
    // cancel storm on record. Tap only once the target holds still across
    // consecutive polls.
    const preRingedSwatch = await execute(
      `return [...document.querySelectorAll('.color-swatch')].findIndex((s) => (s.getAttribute('style') || '').includes('box-shadow'));`
    );
    await waitForTargetToHoldStill(
      execute,
      hexSelector,
      'the custom color grid never settled after the picker opened'
    );
    await record(
      measureClick({
        client,
        sessionId,
        execute,
        label: 'select custom color',
        selector: hexSelector,
        ready:
          `document.querySelector('#color-picker')?.open !== true && ` +
          `[...document.querySelectorAll('.color-swatch')].findIndex((s) => (s.getAttribute('style') || '').includes('box-shadow')) !== ${preRingedSwatch}`,
        settleMs: ANIMATED_ACTION_SETTLE_MS,
        eventTypes: customColorSelectionEventTypes(),
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
        // The options fly in after the menu reports open; over CDP touch a pen
        // pick measured mid-flight landed on the crayon option (issue #1870).
        await waitForTargetToHoldStill(
          execute,
          selection.selector,
          `the ${selection.label} target never settled after the brush menu reopened`
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
    // The picked size is named before the tap so the proof afterwards is about
    // THIS pick. Picking closes the menu, and since 478c88ba8 a closed menu is
    // unmounted rather than hidden, so the old readiness — a pressed option
    // inside the menu AND the menu closed — could never be true again: the tap
    // landed and changed the width, and the sweep timed out on every engine.
    const pickedSize = await execute(
      `return document.querySelector('.stroke-width-menu button[aria-pressed="false"]')?.getAttribute('aria-label') ?? null;`
    );
    if (!pickedSize) throw new Error('The stroke-width menu offered no size to change to');
    await record(
      measureClick({
        client,
        sessionId,
        execute,
        label: 'change stroke width',
        selector: `.stroke-width-menu button[aria-label=${JSON.stringify(pickedSize)}]`,
        ready: STROKE_WIDTH_MENU_CLOSED,
      })
    );
    await verifyStrokeWidthPicked(execute, pickedSize);
  }

  const settingsInScope =
    actions.has('settings') ||
    actions.has('settings-sections') ||
    actions.has('settings-controls') ||
    actions.has('theme');

  if (settingsInScope) {
    await closeDialogs(execute);
    await record(
      measureClick({
        client,
        sessionId,
        execute,
        label: 'open Settings',
        selector: 'button[aria-label="Settings"]',
        ready: `document.querySelector('#settingsModal')?.open === true`,
        settleMs: ANIMATED_ACTION_SETTLE_MS,
      })
    );
  }

  // A landscape phone gets CompactShell, which by design replaces the section list
  // with quick toggles and a pointer to portrait (COMPACT_QUERY in
  // SettingsModal.svelte). Waiting for section rows there times out against a
  // product that is behaving correctly, and takes the whole sweep down with it —
  // including every action that has nothing to do with Settings.
  const settingsShellIsCompact = settingsInScope ? await isCompactSettingsShell(execute) : false;
  if (settingsInScope && !settingsShellIsCompact) {
    await waitForReady(
      execute,
      `document.querySelector('${SETTINGS_SECTION_ROWS}') !== null`,
      'Settings navigation'
    );
  }
  // The wide shell is the one that stacks every section in a single scrolling
  // pane, so the pane's presence is what says which shell is up — the rows
  // themselves are addressed identically in both.
  const settingsModalUsesSidebar = await execute(
    `return document.querySelector('#settingsModal .settings-pane') !== null;`
  );
  const ensureSettingsHub = async () => {
    if (
      settingsModalUsesSidebar ||
      (await execute(`return !!document.querySelector('.hub-list');`))
    ) {
      return;
    }
    await clickSetupElement(execute, '#settingsModal .settings-back');
    await waitForReady(execute, `document.querySelector('.hub-list') !== null`, 'Settings hub');
  };
  const openSettingsSection = async (section, ready, hint) => {
    await ensureSettingsHub();
    await clickSetupElement(execute, settingsSectionRow(section));
    await waitForReady(
      execute,
      settingsSectionSetupReady(section, ready, settingsModalUsesSidebar),
      hint
    );
  };

  if (actions.has('settings-sections') && !settingsShellIsCompact) {
    const sectionIds = await execute(`
      return [...document.querySelectorAll('${SETTINGS_SECTION_ROWS}')]
        .map((element) => element.dataset.section).filter(Boolean);
    `);
    for (const section of sectionIds.slice(1)) {
      await ensureSettingsHub();
      const selector = settingsSectionRow(section);
      const label = await execute(
        `return document.querySelector(${JSON.stringify(
          settingsSectionLabelSelector(section, settingsModalUsesSidebar)
        )})?.textContent?.trim();`
      );
      const measurement = settingsSectionMeasurement(section, label, settingsModalUsesSidebar);
      await record(
        measureClick({
          client,
          sessionId,
          execute,
          label: measurement.label,
          selector,
          // The wide sidebar is a table of contents over one continuous pane, so a
          // click scrolls rather than swaps and the row reports a reading
          // position. tools/perf/tests/xcuitest-actions.test.mjs holds this token
          // against the shell that sets it.
          ready: measurement.ready,
          activation: 'webdriver',
        })
      );
      if (
        section === 'parentCenter' &&
        (await execute(`return document.querySelector('#parentalGate')?.open === true;`))
      ) {
        await clickSetupElement(execute, '#parentalGate button[aria-label="Close"]');
        await waitForReady(
          execute,
          `document.querySelector('#parentalGate')?.open !== true`,
          'Parent Center challenge to close'
        );
        await sleep(ANIMATED_ACTION_SETTLE_MS);
      }
    }
    await openSettingsSection(
      'appearance',
      `document.querySelector('#themeOption-light') !== null`,
      'Appearance section'
    );
  }

  if (actions.has('theme') && settingsShellIsCompact) {
    await recordToggleRoundTrip({
      label: compactSettingsActionLabel('Night Mode'),
      selector: '#quickNightToggle',
      baseline: baselineTheme === 'dark',
      readyFor: (enabled) =>
        `${RESOLVED_THEME_EXPRESSION} === '${enabled ? 'dark' : 'light'}'`,
    });
  }

  if (actions.has('theme') && !settingsShellIsCompact) {
    const themePlan = themeRoundTripPlan(baselineTheme);
    await openSettingsSection(
      'appearance',
      `document.querySelector('#themeOption-light') !== null`,
      'Appearance section'
    );
    await clickSetupElement(execute, `#themeOption-${themePlan.setup}`);
    await waitForReady(
      execute,
      `document.documentElement.dataset.theme === 'dark'`,
      'dark theme preparation'
    );
    await sleep(ACTION_SETTLE_MS);
    // The theme switches take the default trusted native tap rather than a
    // semantic WebDriver click: an element click is an Inspector-evaluate atom
    // on the page's main thread, and a theme switch's scored first frame is the
    // one frame the whole document restyles in — a Time Profiler capture
    // (issue #976) measured ~10-15 ms of Inspector dispatch plus a
    // click-focus scrollToFocusedElement layout inside that frame, dwarfing
    // the product cost it exists to score. A native tap keeps the activation
    // out of the scored frame the same way `open Settings` already does.
    await record(
      measureClick({
        client,
        sessionId,
        execute,
        label: 'switch dark theme to light',
        selector: '#themeOption-light',
        ready: `document.documentElement.dataset.theme === 'light'`,
        settleMs: ANIMATED_ACTION_SETTLE_MS,
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
      })
    );
    if (themePlan.restore) {
      await clickSetupElement(execute, `#themeOption-${themePlan.restore}`);
      await waitForReady(
        execute,
        `document.documentElement.dataset.theme === ${JSON.stringify(themePlan.restore)}`,
        `${themePlan.restore} theme restoration`
      );
      await sleep(ACTION_SETTLE_MS);
    }
  }

  if (actions.has('settings-controls') && settingsShellIsCompact) {
    await recordToggleRoundTrip({
      label: compactSettingsActionLabel('drawing sounds'),
      selector: '#quickSoundToggle',
      baseline: true,
    });
    // No readyFor: the switch stamps nothing of its own on the Actions Panel. It
    // marks each drawer-owned control off, and every one of those marks is
    // also stamped by that control's own persisted flag, so no panel attribute
    // says which of the two hid it. The switch's own state is the readiness.
    await recordToggleRoundTrip({
      label: compactSettingsActionLabel('tool drawer'),
      selector: '#quickToolDrawerToggle',
      baseline: true,
    });
  }

  if (actions.has('settings-controls') && !settingsShellIsCompact) {
    await openSettingsSection(
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

    await openSettingsSection(
      'saving',
      `document.querySelector('#saveOnDeleteToggle') !== null`,
      'Saving section'
    );
    await recordToggleRoundTrip({
      label: 'auto-save on delete',
      selector: '#saveOnDeleteToggle',
      baseline: false,
    });

    await openSettingsSection(
      'controls',
      `document.querySelector('#toolDrawerToggle') !== null`,
      'Buttons section'
    );
    await recordToggleRoundTrip({
      label: 'tool drawer',
      selector: '#toolDrawerToggle',
      baseline: true,
      whileAtBaseline: () =>
        runScreenshotToggleAtDrawerBaseline({
          openSavingSection: () =>
            openSettingsSection(
              'saving',
              `document.querySelector('#screenshotToggle') !== null`,
              'Saving section'
            ),
          recordScreenshotToggle: () =>
            recordToggleRoundTrip({
              label: 'screenshot action button',
              selector: '#screenshotToggle',
              baseline: true,
              readyFor: (enabled) =>
                enabled
                  ? actionPanelLacksAttribute('data-off-screenshot')
                  : actionPanelHasAttribute('data-off-screenshot'),
            }),
          reopenControlsSection: () =>
            openSettingsSection(
              'controls',
              `document.querySelector('#toolDrawerToggle') !== null`,
              'Buttons section'
            ),
        }),
    });
  }

  if (settingsInScope) {
    await record(
      measureClick({
        client,
        sessionId,
        execute,
        label: 'close Settings',
        selector: '#settingsModal button[aria-label="Close"]',
        ready: `document.querySelector('#settingsModal')?.open !== true`,
        settleMs: ANIMATED_ACTION_SETTLE_MS,
        activation: 'webdriver',
      })
    );
  }

  if (actions.has('coloring')) {
    const measureColoringPickerOpen = (label) =>
      record(
        measureClick({
          client,
          sessionId,
          execute,
          label,
          selector: '#coloringBookButton',
          ready: `document.querySelector('#coloring-book-dialog')?.open === true`,
          settleMs: ANIMATED_ACTION_SETTLE_MS,
        })
      );
    await assertPickerNeverOpened(execute);
    await measureColoringPickerOpen(COLORING_FIRST_OPEN_ACTION_LABEL);
    await showColoringBookChoices(execute);
    const firstOpenListed = await listedBookChoices(execute);
    if (listedColoringBooks !== null && firstOpenListed !== listedColoringBooks) {
      throw new Error(firstOpenListedMessage(firstOpenListed, listedColoringBooks));
    }
    await closeColoringPickerForSetup(execute);
    await measureColoringPickerOpen(COLORING_REOPEN_ACTION_LABEL);
    await showColoringBookChoices(execute);
    const hasBookChoice = (await listedBookChoices(execute)) > 0;
    for (const step of coloringSelectionSteps(hasBookChoice)) {
      if (step.label === 'select coloring page') {
        const scroll = await measureColoringPageScroll(client, sessionId, execute);
        if (scroll.sample) {
          await record(scroll.sample);
        } else {
          notApplicable.set(COLORING_SCROLL_ACTION_LABEL, scroll.notApplicableReason);
        }
      }
      await record(measureClick({ client, sessionId, execute, ...step }));
    }
    await clickSetupElement(execute, '#coloringBookButton');
    await waitForReady(
      execute,
      `document.querySelector('#coloring-book-dialog')?.open === true`,
      'coloring books to reopen'
    );
    await sleep(ANIMATED_ACTION_SETTLE_MS);
    await record(
      measureClick({
        client,
        sessionId,
        execute,
        label: 'clear coloring page',
        selector: '#coloring-book-dialog button[aria-label^="Clear active coloring page:"]',
        ready: `document.querySelector('#coloring-book-dialog')?.open !== true && document.querySelector('#coloringOverlay')?.hidden === true`,
        settleMs: ANIMATED_ACTION_SETTLE_MS,
        activation: coloringClearActivation(),
      })
    );
  }

  if (
    actions.has('screenshot') ||
    actions.has('undo') ||
    actions.has('clear') ||
    actions.has('ai-waiting') ||
    actions.has('unavailable')
  ) {
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
        settleMs: SCREENSHOT_ACTION_SETTLE_MS,
        activation: screenshotActivation(client.nativeApp),
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

  if (actions.has('ai-waiting')) {
    const seamAvailable = await execute(`return typeof window.__aiGenerate === 'function';`);
    if (!seamAvailable) {
      const reason = 'the dev harness seam __aiGenerate is not exposed by this build (ADR-0109)';
      blocked.set('show AI waiting print', reason);
      blocked.set('finish AI waiting print', reason);
    } else {
      await installAiGenerationStub(execute);
      try {
        const run = await startAiRun(execute);
        if (!run.offered) {
          // The flow never reached its waiting state on this target. It is the
          // cue that is unreachable, not the measurement: on a physical iPad the
          // run fails before it makes any request at all (issue #1870).
          const reason =
            `the AI run failed before the waiting print appeared ` +
            `(${JSON.stringify(run.state)})`;
          blocked.set('show AI waiting print', reason);
          blocked.set('finish AI waiting print', reason);
        } else {
          await record(
            measureClick({
              client,
              sessionId,
              execute,
              label: 'show AI waiting print',
              selector: '.ai-keep-drawing button',
              ready: `document.querySelector('.ai-waiting-polaroid') !== null`,
              settleMs: ANIMATED_ACTION_SETTLE_MS,
              // Inside the AI dialog, like the coloring-book steps: a dialog's
              // contents have no native-gesture geometry on a physical device.
              activation: 'webdriver',
            })
          );
          const badge = await measureAiWaitingBadge(execute);
          // Read while the stub is still installed: removing it deletes the
          // record of which URLs it answered.
          const aiRun = await aiRunState(execute);
          const evidenceProblem = aiRunEvidenceProblem(aiRun);
          if (evidenceProblem) {
            throw new Error(
              `the AI waiting print completed without proof it was the mocked run on a secure origin: ${evidenceProblem}`
            );
          }
          await record(Promise.resolve({ ...badge, aiRun }));
        }
      } finally {
        await removeAiGenerationStub(execute);
        await execute(`
          document.querySelector('.ai-waiting-polaroid')?.click();
          return true;
        `);
        await sleep(ACTION_SETTLE_MS);
        await closeDialogs(execute);
      }
    }
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

  if (actions.has('unavailable')) {
    const exhausted = await exhaustUndoHistory(execute);
    if (!exhausted) {
      notApplicable.set(
        'tap unavailable undo',
        'undo history could not be emptied, so the unavailable cue is unreachable'
      );
    } else {
      await record(
        measureClick({
          client,
          sessionId,
          execute,
          label: 'tap unavailable undo',
          selector: '#undoButton',
          ready: `document.querySelector('#undoButton')?.classList.contains('action-unavailable') === true`,
          settleMs: ANIMATED_ACTION_SETTLE_MS,
        })
      );
    }
  }

  if (actions.has('clear')) {
    await ensureStableTrustedStroke(client, sessionId, execute);
    await record(measureClear(client, sessionId, execute));
    // The clear sheet carries the paper texture on a blank page and the line art
    // as well on a coloring page (inkMotion.clear paints it at commit), so the
    // coloring-page clear is a separate measured case rather than the same one.
    const coloringReady = await openColoringPageForClear(execute);
    if (!coloringReady) {
      notApplicable.set(
        'clear drawing on a coloring page',
        'no coloring page could be opened on this target'
      );
    } else {
      await ensureStableTrustedStroke(client, sessionId, execute);
      await record(measureClear(client, sessionId, execute, 'clear drawing on a coloring page'));
      // Hand the next group a blank page: rotation asserts an empty canvas, and
      // a retained coloring page would change what every later action measures.
      await closeColoringPage(execute);
    }
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
        `empty after clear: ${rotationActionLabel(blankCurrent, blankOther)}`
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
        `empty after clear: ${rotationActionLabel(blankOther, originalOrientation)}`
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
        inkRotationActionLabel(current, other)
      )
    );
    await record(
      measureRotation(
        client,
        sessionId,
        execute,
        other,
        originalOrientation,
        inkRotationActionLabel(other, originalOrientation)
      )
    );
  }

  return {
    samples,
    settingsShell: settingsInScope ? (settingsShellIsCompact ? 'compact' : 'sectioned') : null,
    actionPlan: {
      schemaVersion: 1,
      actionGroups: [...actions],
      applicableLabels: [...applicableLabels],
      notApplicable: [...notApplicable].map(([label, reason]) => ({ label, reason })),
      blocked: [...blocked].map(([label, reason]) => ({ label, reason })),
      context: {
        orientation: originalOrientation,
        settingsShell: settingsInScope
          ? settingsShellIsCompact
            ? 'compact'
            : 'sectioned'
          : null,
        listedColoringBooks,
      },
    },
  };
}

export async function runIpadActions(argv = process.argv.slice(2)) {
  const { flag, has, port } = parsePerfArgs(
    {
      entry: true,
      extra: [
        'url',
        'device-id',
        'device-class',
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
        'allow-foreign-build',
        'theme',
      ],
    },
    argv
  );
  const nativeApp = has('native-app');
  const requestedTheme = parseCampaignTheme(flag('theme'));
  const requestedOrientation = flag('orientation')?.toUpperCase();
  if (requestedOrientation && !['PORTRAIT', 'LANDSCAPE'].includes(requestedOrientation)) {
    fail('--orientation must be PORTRAIT or LANDSCAPE');
  }
  const repeats = positiveInteger(flag('repeats', '4'), 'repeats');
  if (repeats < WARMUP_REPEATS + MIN_GATED_SAMPLES) {
    fail(`--repeats must provide one warmup and ${MIN_GATED_SAMPLES} scored samples`);
  }
  const actions = selectedActions(flag('actions'));
  const deviceClass = parseDeviceClass(flag('device-class'));
  const requestedAppUrl = nativeApp ? null : resolveDeviceUrl(flag('url'), port, APP_PATH);
  const allowForeignBuild = has('allow-foreign-build');
  if (allowForeignBuild && !flag('url')) {
    fail('--allow-foreign-build needs --url= naming the externally served build it allows');
  }
  let sessionId = flag('session-id');
  const capabilitiesFile = flag('capabilities-file');
  validateBorrowedActionSession(sessionId, capabilitiesFile);
  const capabilities = sessionCapabilities({
    deviceId: flag('device-id'),
    xcodeConfigFile: flag('xcode-config', DEFAULT_XCODE_CONFIG),
    wdaBundleId: flag('wda-bundle-id', DEFAULT_WDA_BUNDLE_ID),
    allowProvisioning: has('allow-provisioning'),
    file: capabilitiesFile,
    nativeApp,
  });
  let server;
  let client;
  let ownsSession = false;
  let originalOrientation;
  let restoreOrientation;
  let session;
  let execute;
  let nativeRotationLockRestore;
  let cleanupPromise;
  let servedBuild = null;

  function cleanup() {
    cleanupPromise ??= (async () => {
      if (sessionId && restoreOrientation) {
        await client
          ?.request('POST', `/session/${sessionId}/orientation`, {
            orientation: restoreOrientation,
          })
          .catch((error) =>
            console.warn(`cleanup: orientation restore failed (${error.message})`)
          );
      }
      if (sessionId && execute && nativeRotationLockRestore?.lockedOrientation) {
        // A silent failure here leaves the iPad rotation-unlocked, which
        // changes what the NEXT cell measures with no record anywhere
        // (issue 1296) — the warning is the record.
        await switchToWebContext(client, sessionId).catch((error) =>
          console.warn(`cleanup: web-context switch failed (${error.message})`)
        );
        await restoreNativeRotationLock(execute, nativeRotationLockRestore).catch((error) =>
          console.warn(
            `cleanup: rotation-lock restore failed (${error.message}) — the device may measure the next cell unlocked`
          )
        );
      }
      if (sessionId && ownsSession) {
        await client?.request('DELETE', `/session/${sessionId}`).catch(() => {});
      }
      server?.stop();
    })();
    return cleanupPromise;
  }

  const onSignal = (exitCode) => {
    void cleanup().finally(() => process.exit(exitCode));
  };
  const onSigint = () => onSignal(130);
  const onSigterm = () => onSignal(143);
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);

  try {
    server = nativeApp
      ? null
      : await ensurePreviewServer(requestedAppUrl, port, !has('no-serve') && !allowForeignBuild, {
          allowForeignBuild,
        });
    if (!nativeApp) {
      servedBuild = await assertServedBuildIsFresh(requestedAppUrl, { allowForeignBuild });
    }
    client = createWebDriverClient(flag('appium-url', DEFAULT_APPIUM_URL));
    client.nativeApp = nativeApp;
    client.nativeWebViewClass = flag('native-webview-class', DEFAULT_NATIVE_WEBVIEW_CLASS);
    client.webdriverClicks = has('webdriver-clicks');
    await client.request('GET', '/status');
    session = await createActionSession(client, sessionId, capabilities);
    if (!sessionId) {
      sessionId = session.sessionId;
      ownsSession = true;
    }
    const deviceClassification = {
      nativeApp,
      deviceId: flag('device-id'),
      deviceClass,
      requestedCapabilities: capabilities,
      session,
    };
    const classificationWarning = unclassifiedDeviceWarning(deviceClassification);
    if (classificationWarning) console.warn(classificationWarning);
    client.platformName =
      session.capabilities?.platformName ??
      session.capabilities?.['appium:platformName'] ??
      capabilities?.platformName ??
      'iOS';
    execute = (script, args = []) =>
      client.request('POST', `/session/${sessionId}/execute/sync`, { script, args });
    const executeAsync = (script, args = []) =>
      client.request('POST', `/session/${sessionId}/execute/async`, { script, args });
    restoreOrientation = await client.request('GET', `/session/${sessionId}/orientation`);
    if (!nativeApp && requestedOrientation && requestedOrientation !== restoreOrientation) {
      await client.request('POST', `/session/${sessionId}/orientation`, {
        orientation: requestedOrientation,
      });
      await sleep(ROTATION_NATIVE_SETTLE_MS);
    }

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
      READY_TIMEOUT_MS,
      POLL_MS
    );
    if (!initialReady) {
      throw new Error(
        `${nativeApp ? 'The native app' : requestedAppUrl} never showed a sized #drawingCanvas`
      );
    }
    await clearDeviceWebCache(executeAsync);
    const needsNativeRotationUnlock =
      nativeApp &&
      (actions.has('rotation') ||
        (requestedOrientation && requestedOrientation !== restoreOrientation));
    if (needsNativeRotationUnlock) {
      const initialRotationLock = await releaseNativeRotationLock(execute);
      nativeRotationLockRestore =
        initialRotationLock === PLATFORM_OWNS_ROTATION ? null : initialRotationLock;
      if (nativeRotationLockRestore?.lockedOrientation) {
        await execute(`location.reload(); return true;`).catch(() => null);
        await switchToWebContext(client, sessionId);
        const unlockedReady = await pollUntil(
          () =>
            execute(
              "const canvas = document.querySelector('#drawingCanvas'); return !!canvas && canvas.width > 0;"
            ).catch((error) => {
        rethrowIfBroken(error);
        return false;
      }),
          READY_TIMEOUT_MS,
          POLL_MS
        );
        if (!unlockedReady) {
          throw new Error('The native app did not reload after unlocking rotation');
        }
      }
    }
    if (nativeApp && requestedOrientation) {
      const currentOrientation = await client.request('GET', `/session/${sessionId}/orientation`);
      if (requestedOrientation !== currentOrientation) {
        await client.request('POST', `/session/${sessionId}/orientation`, {
          orientation: requestedOrientation,
        });
        await sleep(ROTATION_NATIVE_SETTLE_MS);
      }
    }
    originalOrientation = await client.request('GET', `/session/${sessionId}/orientation`);
    const appUrl = nativeApp ? await execute('return location.href;') : requestedAppUrl;
    const expectedEntry = nativeApp
      ? null
      : entryModulePath(await fetch(requestedAppUrl).then((response) => response.text()));
    if (!nativeApp && !expectedEntry) {
      throw new Error(`${requestedAppUrl} exposes no SvelteKit entry module`);
    }

    let settingsShell = null;
    let actionPlan = null;
    const samples = [];
    const expectedLabels = new Set();
    const pageEntries = new Set();
    const serviceWorkerRegistrations = new Set();
    const coloringPreparation = [];
    let baselineTheme;
    const executePromise = (expression) => executePagePromise(executeAsync, expression);
    const loadDocument = async (repeat) => {
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
          ).catch((error) => {
        rethrowIfBroken(error);
        return false;
      }),
        READY_TIMEOUT_MS,
        POLL_MS
      );
      if (!ready) throw new Error(`${loadedUrl} never showed a sized #drawingCanvas`);
      const scriptSources = await execute(
        "return Array.from(document.scripts, (script) => script.src || script.textContent || '');"
      );
      const loadedEntry = entryModulePath(scriptSources.join('\n'));
      if (nativeApp) {
        if (loadedEntry) pageEntries.add(loadedEntry);
      } else {
        const entryProblem = loadedPageEntryProblem(expectedEntry, scriptSources);
        if (entryProblem) throw new Error(`Preview identity mismatch: ${entryProblem}`);
        pageEntries.add(loadedEntry);
      }
      serviceWorkerRegistrations.add(
        await blockServiceWorkerRegistrationForMeasurement(execute)
      );
    };
    for (let repeat = 1; repeat <= repeats; repeat++) {
      const sweepDocument = await loadActionSweepDocument({
        actions,
        execute,
        executePromise,
        loadDocument: () => loadDocument(repeat),
      });
      coloringPreparation.push({ repeat, ...sweepDocument });
      logColoringPreparation(sweepDocument);
      await ensureCampaignTheme(execute, requestedTheme);
      baselineTheme = await readResolvedTheme(execute);
      await installActionProbe(execute);
      await sleep(REPEAT_SETTLE_MS);
      console.log(`\nAction sweep ${repeat}/${repeats}`);
      const sweep = await runActionSweep({
        client,
        sessionId,
        execute,
        actions,
        originalOrientation,
        baselineTheme,
        listedColoringBooks: sweepDocument.listedColoringBooks,
      });
      settingsShell = sweep.settingsShell;
      actionPlan = stableActionPlan(actionPlan, sweep.actionPlan);
      if (repeat <= WARMUP_REPEATS) {
        for (const label of sweep.actionPlan.applicableLabels) expectedLabels.add(label);
      }
      samples.push(
        ...sweep.samples.map((sample) => ({
          ...sample,
          repeat,
          warmup: repeat <= WARMUP_REPEATS,
        }))
      );
    }

    const gateAllowances = actionGateAllowances(deviceClassification);
    const transport = nativeApp ? NATIVE_TRANSPORT : 'browser';
    // `transport` names how the session was driven; the runtime names which
    // engine ran the page, and only the runtime decides rotation first-frame
    // applicability — `browser` covers Android Chrome over Appium too, which
    // must stay gated (ADR-0142).
    const runtime = captureRuntime(
      sessionPlatformName({ requestedCapabilities: capabilities, session }),
      nativeApp
    );
    const summaries = summarizeActions(samples, expectedLabels, gateAllowances, (label) =>
      rotationFirstFrameNa(runtime, label)
    );
    const failures = actionFailures(summaries);
    const { blockedCoverage, passed } = actionCaptureVerdict({ failures, actionPlan });
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
        id: capturedDeviceId(flag('device-id'), session),
      },
      appUrl,
      transport,
      // The engine that ran the page, derived from the negotiated session —
      // provenance for re-scorers, since `transport` alone cannot say (the
      // matrix prefers its target's declared runtime and falls back to this).
      captureRuntime: runtime,
      uiActivation: uiActivationLabel(samples),
      appiumUrl: flag('appium-url', DEFAULT_APPIUM_URL),
      actions: [...actions],
      repeats,
      orientation: originalOrientation,
      theme: baselineTheme,
      pageEntries: [...pageEntries],
      ...servedBuild,
      serviceWorkerRegistration: [...serviceWorkerRegistrations],
      coloringPreparation,
      // A landscape phone measures CompactShell's quick toggles instead of the
      // section list, so the label set differs by shell rather than by regression.
      settingsShell,
      actionPlan,
      samples,
      frameStampEpoch: frameStampEpochOf(samples),
      summaries,
      // The gate exceptions this capture was scored under (ADR-0090 amendment):
      // re-summarizers read them from here, so a capture carries its own
      // calibration and historical captures without the field stay on base gates.
      gateAllowances,
      // Blocked coverage counts against the capture exactly as a breached gate
      // does: an action the run could not obtain is missing evidence, and a
      // capture that reports `passed` while missing it would let a campaign read
      // as complete (issue #1870).
      passed,
    };
    writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`);
    console.log('\nDiscrete action response');
    console.table(actionRows(summaries));
    console.log(`\nWrote ${output}`);
    reportActionCaptureVerdict({ failures, blockedCoverage, reportOnly: has('report-only') });
    return artifact;
  } finally {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
    await cleanup();
  }
}

if (isMain(import.meta.url)) runMain(runIpadActions);
