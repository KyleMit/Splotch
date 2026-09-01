import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../lib/proc.mjs';
import {
  ACTION_FRAME_MAX_GATE_MS,
  IOS_ACTION_GATE_ALLOWANCES,
  ACTION_FRAME_P95_GATE_MS,
  ACTION_SETTLE_TAIL_FRAMES,
  scoredActionFrameGaps,
  summarizeActionGroup,
} from '../lib/action-stats.mjs';
import {
  activationModeFor,
  actionGateAllowances,
  canvasHasInk,
  coloringClearActivation,
  coloringScrollTransport,
  coloringSelectionSteps,
  createActionSession,
  customColorSelectionEventTypes,
  largestNativeRect,
  nativeAccessibilityFallbackWarning,
  runScreenshotToggleAtAdvancedBaseline,
  runToggleRoundTrip,
  screenshotActivation,
  selectedActions,
  settingsSectionLabelSelector,
  settingsSectionMeasurement,
  settingsSectionSetupReady,
  uiActivationLabel,
  validateBorrowedActionSession,
  visibleInactiveSwatchColorExpression,
} from '../ios/capture-xcuitest-actions.mjs';
import {
  desktopActionsArtifact,
  hasMinimumActionRepeats,
  resolveViewport,
} from '../web/capture-desktop-actions.mjs';
import { eraserFillFunctionSource } from '../lib/eraser-fill.mjs';
import { loadedPageEntryProblem } from '../lib/profile-preview.mjs';

const ACTION_PROBE = readFileSync(join(ROOT, 'tools', 'perf', 'probes', 'action-probe.js'), 'utf8');
const LIVE_SURFACE = readFileSync(
  join(ROOT, 'web', 'src', 'lib', 'components', 'LiveSurface.svelte'),
  'utf8'
);
// SCREENSHOT_BUTTON_ID lives with the other corner-button ids rather than beside
// the screenshot feedback that uses it — the save pipeline has to stay off the
// startup critical path (issue #461, web/tests/startup-bundle.spec.ts).
const UI_STATE = readFileSync(join(ROOT, 'web', 'src', 'lib', 'state', 'ui.svelte.ts'), 'utf8');
const SETTINGS_MODAL = readFileSync(
  join(ROOT, 'web', 'src', 'lib', 'components', 'SettingsModal.svelte'),
  'utf8'
);
const SETTINGS_WIDE_SHELL = readFileSync(
  join(ROOT, 'web', 'src', 'lib', 'components', 'settings', 'WideShell.svelte'),
  'utf8'
);
// The wide shell's rows are the shared guide-rail table of contents, so the row
// template both harnesses address lives here rather than in the shell.
const SIDEBAR_TOC = readFileSync(
  join(ROOT, 'web', 'src', 'lib', 'components', 'nav', 'SidebarToc.svelte'),
  'utf8'
);
const IPAD_ACTIONS = readFileSync(
  join(ROOT, 'tools', 'perf', 'ios', 'capture-xcuitest-actions.mjs'),
  'utf8'
);
const CAMPAIGN_STATE = readFileSync(
  join(ROOT, 'tools', 'perf', 'lib', 'campaign-state.mjs'),
  'utf8'
);
const PAGE_INVENTORY = readFileSync(
  join(ROOT, 'tools', 'page-inventory', 'capture-page-inventory.mjs'),
  'utf8'
);

const frame = (startFromActionMs, gapMs, visualEffectsActive = false) => ({
  startFromActionMs,
  endFromActionMs: startFromActionMs + gapMs,
  gapMs,
  visualEffectsActive,
});

const action = (postActionFrames, changes = {}) => ({
  label: 'fixture action',
  eventType: 'click',
  trusted: true,
  firstFrameMs: 8,
  readyMs: null,
  postActionFrames,
  postActionFrameGapsMs: postActionFrames.map(({ gapMs }) => gapMs),
  activities: [],
  canvasMutations: [],
  measures: [],
  ...changes,
});

describe('loaded page identity', () => {
  const expected = '/_app/immutable/entry/start.current.js';

  it('accepts the entry module from the preview build', () => {
    expect(
      loadedPageEntryProblem(expected, [`import { start } from ${JSON.stringify(expected)};`])
    ).toBeNull();
  });

  it('rejects a stale service-worker shell before action capture', () => {
    expect(
      loadedPageEntryProblem(expected, [
        'import { start } from "/_app/immutable/entry/start.stale.js";',
      ])
    ).toBe(
      'the loaded page uses /_app/immutable/entry/start.stale.js, but the preview serves ' +
        expected
    );
  });

  it('rejects a page with no inspectable entry module', () => {
    expect(loadedPageEntryProblem(expected, ['console.log("dead markup")'])).toBe(
      'the loaded page exposes no SvelteKit entry module'
    );
  });
});

describe('createActionSession', () => {
  it('fails closed when a borrowed session has no capabilities file', async () => {
    expect(() => validateBorrowedActionSession('borrowed-session')).toThrow(
      '--session-id requires --capabilities-file so borrowed-session artifacts retain target provenance'
    );
  });

  it('uses resolved capabilities for borrowed sessions without querying Appium', async () => {
    const capabilities = {
      platformName: 'Android',
      'appium:udid': 'emulator-5554',
      'appium:deviceName': 'Pixel 7 Pro API 33',
      'appium:platformVersion': '13',
    };
    const client = {
      request: () => {
        throw new Error('borrowed sessions must not query Appium for a descriptor');
      },
    };

    await expect(createActionSession(client, 'borrowed-session', capabilities)).resolves.toEqual({
      sessionId: 'borrowed-session',
      capabilities: {
        ...capabilities,
        deviceName: 'Pixel 7 Pro API 33',
        platformVersion: '13',
      },
    });
  });
});

describe('actionGateAllowances', () => {
  const physicalIpadUdid = '00008103-0006202E3CF1001E';
  const physicalIpadSession = {
    capabilities: { platformName: 'iOS', deviceName: 'Kyle\u2019s iPad' },
  };

  it('applies the calibrated ledger to the local physical iPad web path', () => {
    expect(
      actionGateAllowances({
        nativeApp: false,
        deviceId: physicalIpadUdid,
        requestedCapabilities: null,
        session: physicalIpadSession,
      })
    ).toBe(IOS_ACTION_GATE_ALLOWANCES);
  });

  // The shape a real device actually reports: udid, platformName, platformVersion and
  // browserName, and no deviceName at all. Every other positive case here supplies a
  // deviceName the device does not send, which is how the ledger stayed unreachable
  // while these tests passed.
  it('applies the ledger to a physical iPad session that reports no deviceName', () => {
    expect(
      actionGateAllowances({
        nativeApp: false,
        deviceClass: 'tablet',
        requestedCapabilities: null,
        session: {
          capabilities: {
            browserName: 'Safari',
            platformName: 'iOS',
            platformVersion: '26.5',
            udid: physicalIpadUdid,
            automationName: 'XCUITest',
          },
        },
      })
    ).toBe(IOS_ACTION_GATE_ALLOWANCES);
  });

  it('keeps a handset on the base gates even when the session names no device', () => {
    expect(
      actionGateAllowances({
        nativeApp: false,
        deviceClass: 'handset',
        requestedCapabilities: null,
        session: {
          capabilities: { platformName: 'iOS', udid: physicalIpadUdid, browserName: 'Safari' },
        },
      })
    ).toEqual({});
  });

  it('still needs a physical device, whatever the campaign says the class is', () => {
    expect(
      actionGateAllowances({
        nativeApp: false,
        deviceClass: 'tablet',
        requestedCapabilities: null,
        session: {
          capabilities: {
            platformName: 'iOS',
            udid: 'C6012C49-AA93-4869-B3A6-E47C9EAAC567',
            browserName: 'Safari',
          },
        },
      })
    ).toEqual({});
  });

  it('recognizes the exact physical iPad capability-file shape', () => {
    expect(
      actionGateAllowances({
        nativeApp: false,
        requestedCapabilities: {
          platformName: 'iOS',
          browserName: 'Safari',
          'appium:udid': physicalIpadUdid,
          'appium:deviceName': 'Kyle\u2019s iPad',
        },
        session: { capabilities: { platformName: 'iOS', deviceName: 'Kyle\u2019s iPad' } },
      })
    ).toBe(IOS_ACTION_GATE_ALLOWANCES);
  });

  it('recognizes a borrowed physical iPad web session and a legacy physical UDID', () => {
    expect(
      actionGateAllowances({
        nativeApp: false,
        requestedCapabilities: null,
        session: {
          value: {
            capabilities: {
              platformName: 'iOS',
              deviceName: 'iPad Pro',
              udid: 'a'.repeat(40),
            },
          },
        },
      })
    ).toBe(IOS_ACTION_GATE_ALLOWANCES);
  });

  it.each([
    ['iPad native', { nativeApp: true, deviceId: physicalIpadUdid, session: physicalIpadSession }],
    [
      'iPad simulator web',
      {
        nativeApp: false,
        requestedCapabilities: {
          platformName: 'iOS',
          'appium:udid': 'C6012C49-AA93-4869-B3A6-E47C9EAAC567',
          'appium:deviceName': 'iPad mini (A17 Pro)',
        },
        session: { capabilities: { platformName: 'iOS', deviceName: 'iPad mini (A17 Pro)' } },
      },
    ],
    [
      'Android native',
      {
        nativeApp: true,
        deviceId: 'android-device',
        session: { capabilities: { platformName: 'Android', deviceName: 'Galaxy' } },
      },
    ],
    [
      'Android browser',
      {
        nativeApp: false,
        deviceId: 'android-device',
        session: { capabilities: { platformName: 'Android', deviceName: 'Galaxy' } },
      },
    ],
    [
      'physical iPhone web',
      {
        nativeApp: false,
        deviceId: physicalIpadUdid,
        session: { value: { capabilities: { platformName: 'iOS', deviceName: 'iPhone' } } },
      },
    ],
  ])('keeps %s on the base gates', (_name, options) => {
    expect(
      actionGateAllowances({
        requestedCapabilities: null,
        ...options,
      })
    ).toEqual({});
  });
});

describe('selectedActions', () => {
  it('includes the idle-frame control in complete suites and focused runs', () => {
    expect(selectedActions()).toContain('idle');
    expect(selectedActions('idle')).toEqual(new Set(['idle']));
  });
});

describe('action state planning', () => {
  it('accepts either the Parent Center challenge or the requested section', () => {
    const sidebar = settingsSectionMeasurement('parentCenter', 'Parent Center', true);
    const hub = settingsSectionMeasurement('parentCenter', 'Parent Center', false);

    expect(sidebar.label).toBe('open Parent Center');
    expect(sidebar.ready).toContain('#parentalGate');
    expect(sidebar.ready).toContain('aria-current');
    expect(hub.ready).toContain('#parentalGate');
    expect(hub.ready).toContain('.settings-back');
  });

  it('keeps ordinary Settings sections on their shell-specific readiness signal', () => {
    expect(settingsSectionMeasurement('sound', 'Sound', true)).toMatchObject({
      label: 'open Settings section: Sound',
      ready: expect.stringContaining('aria-current'),
    });
    expect(settingsSectionMeasurement('sound', 'Sound', false)).toMatchObject({
      label: 'open Settings section: Sound',
      ready: expect.stringContaining('.settings-back'),
    });
  });

  it('reads only the stable Settings title instead of one-time activity copy', () => {
    expect(settingsSectionLabelSelector('releases', true)).toBe(
      '#settingsModal button[data-section="releases"] [data-toc-label]'
    );
    expect(settingsSectionLabelSelector('releases', false)).toBe(
      '#settingsModal button[data-section="releases"] .hub-title'
    );
    expect(SIDEBAR_TOC).toContain('<span data-toc-label>{item.label}</span>');
  });

  it('waits for stacked Settings controls to scroll into the active sidebar section', () => {
    const controlReady = `document.querySelector('#advancedControlsToggle') !== null`;
    const sidebar = settingsSectionSetupReady('controls', controlReady, true);

    expect(sidebar).toContain('aria-current');
    expect(sidebar).toContain(controlReady);
    expect(settingsSectionSetupReady('controls', controlReady, false)).toBe(controlReady);
  });

  it('keeps dependent controls inside the required toggle baseline and restores original state', async () => {
    const events = [];

    await runToggleRoundTrip({
      baseline: true,
      initial: false,
      setState: async (state, hint) => events.push(`set:${state}:${hint}`),
      recordState: async (state) => events.push(`record:${state}`),
      whileAtBaseline: async () => events.push('dependent'),
      originalStateHint: 'advanced controls original state',
    });

    expect(events).toEqual([
      'set:true:baseline',
      'record:false',
      'record:true',
      'dependent',
      'set:false:advanced controls original state',
    ]);
  });

  it('restores the original toggle state when a dependent action fails', async () => {
    const restored = [];

    await expect(
      runToggleRoundTrip({
        baseline: true,
        initial: false,
        setState: async (state) => restored.push(state),
        recordState: async () => {},
        whileAtBaseline: async () => {
          throw new Error('dependent failed');
        },
      })
    ).rejects.toThrow('dependent failed');
    expect(restored).toEqual([true, false]);
  });

  it('visits Saving for the nested Screenshot toggle before returning to Controls', async () => {
    const sections = [];

    await runScreenshotToggleAtAdvancedBaseline({
      openSavingSection: async () => sections.push('saving'),
      recordScreenshotToggle: async () => sections.push('screenshot'),
      reopenControlsSection: async () => sections.push('controls'),
    });

    expect(sections).toEqual(['saving', 'screenshot', 'controls']);
  });

  it('returns to Controls when the nested Screenshot toggle round trip fails', async () => {
    const sections = [];

    await expect(
      runScreenshotToggleAtAdvancedBaseline({
        openSavingSection: async () => sections.push('saving'),
        recordScreenshotToggle: async () => {
          throw new Error('screenshot toggle failed');
        },
        reopenControlsSection: async () => sections.push('controls'),
      })
    ).rejects.toThrow('screenshot toggle failed');
    expect(sections).toEqual(['saving', 'controls']);
  });

  it('measures book selection only when the product renders a book grid', () => {
    expect(coloringSelectionSteps(true).map(({ label }) => label)).toEqual([
      'open coloring book',
      'select coloring page',
    ]);
    expect(coloringSelectionSteps(false).map(({ label }) => label)).toEqual([
      'select coloring page',
    ]);
  });

  it('requires decoded coloring art before a selection can become ready', () => {
    const selection = coloringSelectionSteps(false)[0];
    expect(selection.ready).toContain("classList.contains('overlay-ready')");
    expect(selection.ready).toContain("querySelector('#coloringOverlay')?.naturalWidth > 0");
  });

  it('measures a scrollable page grid before selecting a coloring page', () => {
    const coloringStart = IPAD_ACTIONS.indexOf("if (actions.has('coloring'))");
    const selectionStart = IPAD_ACTIONS.indexOf(
      'coloringSelectionSteps(hasBookChoice)',
      coloringStart
    );
    const selectPage = IPAD_ACTIONS.indexOf(
      "step.label === 'select coloring page'",
      selectionStart
    );
    const scroll = IPAD_ACTIONS.indexOf('measureColoringPageScroll', selectPage);
    const click = IPAD_ACTIONS.indexOf(
      'measureClick({ client, sessionId, execute, ...step })',
      scroll
    );

    expect(coloringStart).toBeGreaterThan(-1);
    expect(selectionStart).toBeGreaterThan(coloringStart);
    expect(selectPage).toBeGreaterThan(selectionStart);
    expect(scroll).toBeGreaterThan(selectPage);
    expect(click).toBeGreaterThan(scroll);
  });

  it('chooses a visible inactive palette swatch', () => {
    const expression = visibleInactiveSwatchColorExpression();

    expect(expression).toContain('.color-swatch:not(.active):not(.gradient-swatch)');
    expect(expression).toContain('getBoundingClientRect()');
    expect(expression).toContain('rect.width > 0 && rect.height > 0');
  });

  it('observes custom-color activation before pointer capture retargets the release', () => {
    expect(customColorSelectionEventTypes()).toEqual(['pointerdown']);
  });

  it('uses native accessibility for coloring-page clearing with a WebDriver fallback', () => {
    const measureClickStart = IPAD_ACTIONS.indexOf('async function measureClick');
    const measureClickEnd = IPAD_ACTIONS.indexOf('async function measureIdle', measureClickStart);
    expect(measureClickStart).toBeGreaterThan(-1);
    expect(measureClickEnd).toBeGreaterThan(measureClickStart);
    const measureClickBlock = IPAD_ACTIONS.slice(measureClickStart, measureClickEnd);

    const coloringStart = IPAD_ACTIONS.indexOf("if (actions.has('coloring'))");
    const clearStart = IPAD_ACTIONS.indexOf("label: 'clear coloring page'", coloringStart);
    const clearEnd = IPAD_ACTIONS.indexOf("if (actions.has('screenshot')", clearStart);
    expect(coloringStart).toBeGreaterThan(-1);
    expect(clearStart).toBeGreaterThan(-1);
    expect(clearEnd).toBeGreaterThan(clearStart);
    const coloringBlock = IPAD_ACTIONS.slice(coloringStart, clearEnd);
    const clearBlock = IPAD_ACTIONS.slice(clearStart, clearEnd);

    expect(coloringClearActivation()).toBe('native-accessibility');
    expect(clearBlock).toContain('activation: coloringClearActivation()');
    expect(coloringBlock).toMatch(
      /coloring books to reopen'[\s\S]*?await sleep\(ANIMATED_ACTION_SETTLE_MS\)[\s\S]*?label: 'clear coloring page'/
    );
    expect(measureClickBlock).toMatch(
      /nativeAccessibilityBoundsForSelector\([\s\S]*?\)\.catch\(\(\) => null\)/
    );
  });

  it('uses native accessibility activation only for the native Screenshot path', () => {
    expect(screenshotActivation(false)).toBe('native');
    expect(screenshotActivation(true)).toBe('native-accessibility-click');
  });

  it.each([
    ['native target', 'native', false, true, 'native-touch'],
    ['accessibility target', 'native-accessibility', false, true, 'native-touch'],
    [
      'accessibility element click',
      'native-accessibility-click',
      false,
      false,
      'native-accessibility-click',
    ],
    ['accessibility fallback', 'native-accessibility', false, false, 'webdriver-element-click'],
    ['forced WebDriver', 'native-accessibility-click', true, true, 'webdriver-script-click'],
  ])(
    'selects the %s activation mode',
    (_label, activation, webdriverClicks, hasNativeTarget, expected) => {
      expect(activationModeFor({ activation, webdriverClicks, hasNativeTarget })).toBe(expected);
    }
  );

  it('reports native accessibility downgrades while they can still be rerun', () => {
    expect(
      nativeAccessibilityFallbackWarning(
        'clear coloring page',
        'native-accessibility',
        'webdriver-element-click'
      )
    ).toContain('clear coloring page fell back');
    expect(
      nativeAccessibilityFallbackWarning(
        'clear coloring page',
        'native-accessibility',
        'native-touch'
      )
    ).toBeNull();
  });

  it('summarizes the activation modes observed in the samples', () => {
    expect(
      uiActivationLabel([
        { activation: 'native-touch' },
        { activation: 'native-touch' },
        { activation: 'webdriver-element-click' },
      ])
    ).toBe('native-touch+webdriver-element-click');
  });

  it('ignores a stale tiny WebView when mapping native geometry', () => {
    const nativeWindow = { x: 0, y: 0, width: 1366, height: 1024 };
    expect(
      largestNativeRect(
        [
          { x: 279, y: 947, width: 68, height: 44 },
          { x: 0, y: 0, width: 1366, height: 1024 },
        ],
        nativeWindow
      )
    ).toEqual(nativeWindow);
    expect(largestNativeRect([], nativeWindow)).toEqual(nativeWindow);
    expect(largestNativeRect([{ x: 279, y: 947, width: 68, height: 44 }], nativeWindow)).toEqual(
      nativeWindow
    );
  });

  it('reads the Camera ToggleSwitch through its aria-checked state', () => {
    expect(IPAD_ACTIONS).toContain("selector: '#screenshotToggle'");
    expect(IPAD_ACTIONS).not.toContain("stateAttribute: 'aria-pressed'");
  });

  it('wires every state planner into the physical runner', () => {
    for (const token of [
      'settingsSectionMeasurement(section, label, settingsModalUsesSidebar)',
      'settingsSectionSetupReady(section, ready, settingsModalUsesSidebar)',
      `clickSetupElement(execute, '#parentalGate button[aria-label="Close"]')`,
      'whileAtBaseline: () =>',
      'runScreenshotToggleAtAdvancedBaseline({',
      "actionPanelHasAttribute('data-off-adv')",
      "actionPanelLacksAttribute('data-off-adv')",
      'coloringSelectionSteps(hasBookChoice)',
      'activation: screenshotActivation(client.nativeApp)',
      'activationModeFor({',
      'uiActivation: uiActivationLabel(samples)',
      'largestNativeRect(',
    ]) {
      expect(IPAD_ACTIONS).toContain(token);
    }
  });
});

describe('desktop action options', () => {
  it('resolves the default and an explicit viewport', () => {
    expect(resolveViewport()).toEqual({ width: 1512, height: 982 });
    expect(resolveViewport('1024x768')).toEqual({ width: 1024, height: 768 });
  });

  it('requires a warmup plus every gated repeat', () => {
    expect(hasMinimumActionRepeats(3)).toBe(false);
    expect(hasMinimumActionRepeats(4)).toBe(true);
  });

  // The two identity fields a later reader TRUSTS: the matrix's
  // runtime-agreement check compares `captureRuntime`, and the per-engine
  // rotation declaration keys on the RECORDED `engine`. A runner that stopped
  // writing either would silently re-open ADR-0142's misfile hole.
  it('records the capture runtime and engine the fold checks key on', () => {
    const artifact = desktopActionsArtifact({
      engineName: 'webkit',
      base: 'http://127.0.0.1:4173/',
      viewport: { width: 1366, height: 915 },
      deviceScaleFactor: 2,
      headless: true,
      theme: 'light',
      settingsShell: null,
      actions: ['rotation'],
      repeats: 9,
      samples: [],
      summaries: [],
      passed: true,
    });

    expect(artifact.captureRuntime).toBe('desktop-playwright');
    expect(artifact.engine).toBe('webkit');
    expect(artifact.viewport).toEqual({ width: 1366, height: 915, deviceScaleFactor: 2 });
  });
});

describe('trusted action setup', () => {
  it('releases the native rotation lock before applying a requested orientation', () => {
    const setupStart = IPAD_ACTIONS.indexOf('const needsNativeRotationUnlock =');
    const setupEnd = IPAD_ACTIONS.indexOf('const appUrl =', setupStart);
    const setup = IPAD_ACTIONS.slice(setupStart, setupEnd);
    const unlock = setup.indexOf('setNativeRotationLock(execute, false)');
    const rotate = setup.indexOf('orientation: requestedOrientation');

    expect(setupStart).toBeGreaterThan(-1);
    expect(setupEnd).toBeGreaterThan(setupStart);
    expect(unlock).toBeGreaterThan(-1);
    expect(rotate).toBeGreaterThan(unlock);
    expect(setup).toContain('Settings does not expose the persisted rotation lock control');
  });

  // ADR-0142: rotation's clock starts at resize alone — which of the two
  // orientation events arrives first is a per-runtime race, and anchoring on
  // the race charged Safari and Android pages for the browser's own rotation
  // transition. The probe must keep recording both events as activities, plus
  // the Screen Orientation change the engine actually consumes, or the ADR's
  // "still visible in artifacts" promise silently breaks.
  it('anchors rotation measurement at resize alone, with orientation events kept as diagnostics', () => {
    const rotationStart = IPAD_ACTIONS.indexOf('async function measureRotation(');
    const rotationEnd = IPAD_ACTIONS.indexOf('export async function runActionSweep', rotationStart);
    const rotation = IPAD_ACTIONS.slice(rotationStart, rotationEnd);
    const arming = rotation.slice(
      rotation.indexOf('beginExternal'),
      rotation.indexOf(');', rotation.indexOf('beginExternal'))
    );

    expect(rotationStart).toBeGreaterThan(-1);
    expect(arming).toContain("['resize']");
    expect(arming).not.toContain('orientationchange');
    expect(ACTION_PROBE).toContain("WINDOW_ACTIVITY_EVENTS = ['resize', 'orientationchange']");
    expect(ACTION_PROBE).toContain("recordActivity(action, 'screen-orientation-change')");
  });

  it('restores the original orientation before restoring the native rotation lock', () => {
    const cleanupStart = IPAD_ACTIONS.indexOf('function cleanup()');
    const cleanupEnd = IPAD_ACTIONS.indexOf('const onSignal', cleanupStart);
    const cleanup = IPAD_ACTIONS.slice(cleanupStart, cleanupEnd);
    const restoreOrientation = cleanup.indexOf('orientation: restoreOrientation');
    const restoreLock = cleanup.indexOf('setNativeRotationLock(execute, true)');

    expect(cleanupStart).toBeGreaterThan(-1);
    expect(cleanupEnd).toBeGreaterThan(cleanupStart);
    expect(restoreOrientation).toBeGreaterThan(-1);
    expect(restoreLock).toBeGreaterThan(restoreOrientation);
  });

  it('records desktop scroll as trusted wheel while retaining native touch transport', () => {
    expect(coloringScrollTransport({ useWheelForScroll: true })).toEqual({
      eventTypes: ['wheel'],
      activation: 'trusted-wheel',
    });
    expect(coloringScrollTransport({ cdp: {} })).toEqual({
      eventTypes: ['pointerdown'],
      activation: 'native-touch',
    });
  });

  it('checks canvas ink rather than undo history after a clear', async () => {
    let expression;
    await canvasHasInk(async (script) => {
      expression = script;
      return true;
    });

    const screenshotButtonId = /SCREENSHOT_BUTTON_ID = '([^']+)'/.exec(UI_STATE)?.[1];
    expect(screenshotButtonId).toBeTruthy();
    expect(expression).toContain(
      `document.querySelector('#${screenshotButtonId}')?.disabled === false`
    );
    expect(expression).not.toContain('#undoButton');
  });

  // Both harnesses address a Settings row as `button[data-section=<id>]`, and
  // the two row templates live in different files: the wide sidebar's in the
  // shared SidebarToc, the phone hub's in SettingsModal. Matched as one opening
  // tag rather than as two independent greps, so a shell that stopped rendering
  // its rows as buttons or stopped stamping the section id is caught here rather
  // than by a harness that silently finds nothing. The wide pane's own
  // `.settings-section` wrappers carry the same attribute and are not buttons,
  // which is why the tag is part of the selector.
  it('keeps a section id on the button row template of both Settings shells', () => {
    expect(SIDEBAR_TOC).toMatch(/<button\b[^<>]*data-section=\{item\.id\}/);
    expect(SETTINGS_MODAL).toMatch(/<button\b[^<>]*data-section=\{section\.id\}/);
    expect(SETTINGS_WIDE_SHELL).toMatch(/id: section\.id/);
    for (const harness of [CAMPAIGN_STATE, PAGE_INVENTORY]) {
      expect(harness).toContain('button[data-section');
    }
  });

  // The performance harness measures the sidebar's highlighted reading position.
  // The inventory accepts the requested section parked below the pane's top edge
  // or held at the clamped scroll end.
  it('uses the appropriate wide Settings readiness signal in each harness', () => {
    const token = /aria-current=\{[^}]*\?\s*'([a-z]+)'/.exec(SIDEBAR_TOC)?.[1];
    expect(token).toBeTruthy();
    expect(IPAD_ACTIONS).toContain(`getAttribute('aria-current') === '${token}'`);
    expect(PAGE_INVENTORY).toContain('.settings-section[data-section="${sectionId}"]');
    expect(PAGE_INVENTORY).toContain('pane.scrollTop + pane.clientHeight');
    expect(PAGE_INVENTORY).toContain('targetRect.top - paneRect.top');
  });

  // The wide pane fills a section per frame (issue #910) and reports itself busy
  // until the last one lands. The inventory shoots every Settings surface, so it
  // waits on that flag going quiet; were the pane to stop carrying it, the wait
  // would resolve on an element that never had it and the shots would go back to
  // catching a half-built page — silently, since a screenshot always succeeds.
  // The pane is also how the performance harness tells the two shells apart,
  // since only the wide one stacks its sections in a scrolling pane.
  it('shoots the wide pane only once it stops reporting itself busy', () => {
    expect(SETTINGS_WIDE_SHELL).toMatch(/class="settings-pane"[^>]*aria-busy=\{/);
    expect(PAGE_INVENTORY).toContain('.settings-pane[aria-busy="false"]');
    expect(IPAD_ACTIONS).toContain("#settingsModal .settings-pane') !== null");
  });
});

describe('action probe selector contract', () => {
  for (const marker of [
    'id="drawingCanvas"',
    'data-live-tile',
    'data-live-crayon-bottom',
    'data-live-crayon-top',
  ]) {
    it(`tracks the canvas surface declared by ${marker}`, () => {
      expect(LIVE_SURFACE).toContain(marker);
      expect(ACTION_PROBE).toContain(marker.replace('id="', '').replace('"', ''));
    });
  }

  // The eraser fill is a third out-of-tree consumer of the live-surface
  // markers, and it additionally reads the backing-intent attribute the
  // renderer publishes — cross-file agreement by test, not prose.
  it('keeps the eraser fill bound to the product’s live-surface markers', () => {
    const fill = eraserFillFunctionSource();

    expect(LIVE_SURFACE).toContain('data-live-tile');
    expect(fill).toContain("querySelectorAll('canvas[data-live-tile]')");
    const renderer = readFileSync(
      join(ROOT, 'web', 'src', 'lib', 'drawing', 'tiledRenderer.ts'),
      'utf8'
    );
    expect(renderer).toContain('dataset.tileBacking');
    expect(fill).toContain('dataset.tileBacking');
  });
});

describe('action-owned frame attribution', () => {
  it('keeps immediate jank and the stable frames that follow it', () => {
    const frames = [
      frame(0, 16.7),
      frame(16.7, ACTION_FRAME_MAX_GATE_MS + 1),
      frame(51.2, 16.7),
      frame(67.9, 16.7),
      frame(84.6, 16.7),
      frame(101.3, 16.7),
    ];

    expect(scoredActionFrameGaps(action(frames))).toEqual(frames.map(({ gapMs }) => gapMs));
    expect(summarizeActionGroup([action(frames)]).passed).toBe(false);
  });

  it('reopens scoring for deferred post-ready rendering work', () => {
    const frames = Array.from({ length: 8 }, (_, index) => frame(index * 16.7, 16.7));
    frames.push(frame(133.6, ACTION_FRAME_MAX_GATE_MS + 1));
    frames.push(frame(168.1, 16.7), frame(184.8, 16.7), frame(201.5, 16.7), frame(218.2, 16.7));
    const sample = action(frames, {
      readyMs: 20,
      activities: [{ type: 'dom-mutation', atFromActionMs: 150 }],
    });

    expect(scoredActionFrameGaps(sample)).toContain(ACTION_FRAME_MAX_GATE_MS + 1);
    expect(summarizeActionGroup([sample]).passed).toBe(false);
  });

  it('scores transition frames until the visual effect becomes idle', () => {
    const frames = [
      frame(0, 16.7, true),
      frame(16.7, 16.7, true),
      frame(33.4, ACTION_FRAME_MAX_GATE_MS + 1, true),
      frame(67.9, 16.7),
      frame(84.6, 16.7),
      frame(101.3, 16.7),
      frame(118, 16.7),
    ];

    expect(scoredActionFrameGaps(action(frames))).toEqual(frames.map(({ gapMs }) => gapMs));
    expect(summarizeActionGroup([action(frames)]).passed).toBe(false);
  });

  it('retains raw static frames but excludes a late no-op rAF omission from the gate', () => {
    const frames = Array.from({ length: 24 }, (_, index) => frame(index * 16.7, 16.7));
    frames.push(frame(400.8, 66.6));
    const sample = action(frames, { readyMs: 5_000 });

    expect(sample.postActionFrameGapsMs).toContain(66.6);
    expect(summarizeActionGroup([sample]).frames.raw.max).toBe(66.6);
    expect(scoredActionFrameGaps(sample)).toEqual(
      Array.from({ length: ACTION_SETTLE_TAIL_FRAMES }, () => 16.7)
    );
    expect(summarizeActionGroup([sample]).passed).toBe(true);
  });

  it('honors a passed-in per-action P95 allowance without loosening the default', () => {
    const overGate = Array.from({ length: 40 }, (_, i) =>
      frame(i * 16.7, i < 2 ? ACTION_FRAME_P95_GATE_MS + 4 : 16.7)
    );
    const ledger = IOS_ACTION_GATE_ALLOWANCES;
    expect(ledger.p95['open Settings']).toBeGreaterThan(ACTION_FRAME_P95_GATE_MS);
    expect(summarizeActionGroup([action(overGate)], 'open Settings', ledger).passed).toBe(true);
    expect(summarizeActionGroup([action(overGate)], 'close Settings', ledger).passed).toBe(false);
  });

  it('applies no allowance unless the caller passes one', () => {
    const overGate = Array.from({ length: 40 }, (_, i) =>
      frame(i * 16.7, i < 2 ? ACTION_FRAME_P95_GATE_MS + 4 : 16.7)
    );
    expect(summarizeActionGroup([action(overGate)], 'open Settings').passed).toBe(false);
  });

  it('fails an allowed action past its own allowance', () => {
    const ledger = IOS_ACTION_GATE_ALLOWANCES;
    const overAllowance = Array.from({ length: 40 }, (_, i) =>
      frame(i * 16.7, i < 3 ? ledger.max['open Settings'] + 1 : 16.7)
    );
    expect(summarizeActionGroup([action(overAllowance)], 'open Settings', ledger).passed).toBe(
      false
    );
  });

  // Issue 1130's allowance is max-frame only: a single worst frame inside 56 ms
  // passes while the P95 allowance still binds, a flat legacy P95 map applies
  // no max allowance at all, and past 56 the cell fails — the allowance is a
  // measured residual, never an exemption.
  it('honors the max-frame allowance for the calibrated open Settings, and only there', () => {
    const ledger = IOS_ACTION_GATE_ALLOWANCES;
    // The real capture's shape (perf-profiles/study-1130): pooled repeats
    // whose P95 sits in the low-20s inside the 26 ms allowance while ONE
    // worst frame reaches the 50 ms three-beat band — small single samples
    // cannot express that, because a small pool's P95 IS its max.
    const typicalOpen = () =>
      action([
        frame(0, 24),
        frame(24, 24),
        ...Array.from({ length: 5 }, (_, i) => frame(48 + i * 16.7, 16.7)),
      ]);
    const openWithStall = action([
      frame(0, 24),
      frame(24, ledger.max['open Settings'] - 1),
      ...Array.from({ length: 5 }, (_, i) => frame(100 + i * 16.7, 16.7)),
    ]);
    const pooled = [typicalOpen(), typicalOpen(), typicalOpen(), typicalOpen(), openWithStall];
    expect(summarizeActionGroup(pooled, 'open Settings', ledger).passed).toBe(true);
    expect(summarizeActionGroup(pooled, 'close Settings', ledger).passed).toBe(false);
    // The legacy flat shape every pre-split artifact stored: P95 allowance
    // applies, max allowance does not — historical captures keep scoring as
    // they always did.
    expect(summarizeActionGroup(pooled, 'open Settings', { 'open Settings': 26 }).passed).toBe(
      false
    );
  });

  it('does not let settle-idle frames dilute the gated P95', () => {
    const frames = [frame(0, 16.7), frame(16.7, 200)];
    frames.push(...Array.from({ length: 50 }, (_, index) => frame(216.7 + index * 16.7, 16.7)));
    const summary = summarizeActionGroup([action(frames)]);

    expect(summary.frames.p95).toBe(200);
    expect(summary.frames.raw.p95).toBe(16.7);
    expect(summary.passed).toBe(false);
  });
});
describe('compact settings shell', () => {
  const read = (relative) => readFileSync(join(ROOT, relative), 'utf8');
  const sweep = read(join('tools', 'perf', 'ios', 'capture-xcuitest-actions.mjs'));
  const compactShell = read(
    join('web', 'src', 'lib', 'components', 'settings', 'CompactShell.svelte')
  );
  const settingsModal = read(join('web', 'src', 'lib', 'components', 'SettingsModal.svelte'));

  // The sweep measures a shell it cannot see from here, so these hold the
  // selectors it reaches for against the markup that has to provide them. A
  // renamed id would otherwise turn every landscape-phone action cell into a
  // silent timeout, which is exactly how the 2026-08-20 campaign lost them.
  it('detects the shell through the one shared selector, not a second copy', () => {
    const campaignState = read(join('tools', 'perf', 'lib', 'campaign-state.mjs'));

    expect(sweep).toContain('isCompactSettingsShell');
    expect(sweep).not.toContain('.quick-toggles');
    expect(campaignState).toContain("'#settingsModal .quick-toggles'");
    expect(compactShell).toContain('class="quick-toggles"');
  });

  it('measures only quick toggles CompactShell actually renders', () => {
    for (const id of ['quickNightToggle', 'quickSoundToggle', 'quickAdvancedControlsToggle']) {
      expect(sweep).toContain(`#${id}`);
      expect(compactShell).toContain(`id="${id}"`);
    }
  });

  it('stays keyed to the landscape-phone media query that selects the shell', () => {
    expect(settingsModal).toContain('(orientation: landscape) and (max-height:');
  });

  it('skips the section list rather than waiting for rows the shell omits', () => {
    expect(sweep).toContain("actions.has('settings-sections') && !settingsShellIsCompact");
    expect(sweep).toContain('if (settingsInScope && !settingsShellIsCompact) {');
    expect(compactShell).not.toContain('data-section');
  });
});
describe('runActionSweep callers', () => {
  // The sweep returns {samples, settingsShell} rather than a bare array, and it has
  // three transports. Changing that shape broke the two callers that no test covers
  // and no local run exercises by default — the Android CDP runner failed with
  // "sweep is not iterable" only once a real Android capture ran, and the desktop
  // runner was hiding the same break behind preserved results.
  const CALLERS = [
    join('tools', 'perf', 'ios', 'capture-xcuitest-actions.mjs'),
    join('tools', 'perf', 'android', 'capture-browser-actions.mjs'),
    join('tools', 'perf', 'web', 'capture-desktop-actions.mjs'),
  ];

  it('covers every file that calls it', () => {
    const found = CALLERS.filter((relative) =>
      readFileSync(join(ROOT, relative), 'utf8').includes('runActionSweep({')
    );
    expect(found).toEqual(CALLERS);
  });

  it('reads the sweep through its result shape in each caller', () => {
    for (const relative of CALLERS) {
      const source = readFileSync(join(ROOT, relative), 'utf8');
      expect(source).toContain('sweep.samples');
      expect(source).toContain('sweep.settingsShell');
      expect(source).not.toMatch(/for \(const sample of sweep\)/);
      expect(source).not.toMatch(/\.\.\.sweep\.map\(/);
    }
  });
});
