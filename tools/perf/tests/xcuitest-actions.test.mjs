import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../lib/proc.mjs';
import {
  ACTION_FRAME_MAX_GATE_MS,
  ACTION_GATE_ALLOWANCE_LEDGERS,
  ANDROID_WEB_ACTION_GATE_ALLOWANCES,
  ANDROID_WEB_ACTION_GATE_ALLOWANCE_ENTRIES,
  IOS_ACTION_GATE_ALLOWANCES,
  IOS_ACTION_GATE_ALLOWANCE_ENTRIES,
  ACTION_FRAME_P95_GATE_MS,
  ACTION_SETTLE_TAIL_FRAMES,
  actionGateAllowancesFor,
  inkRotationActionLabel,
  scoredActionFrameGaps,
  summarizeActionGroup,
  summarizeActions,
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
  parseDeviceClass,
  runScreenshotToggleAtAdvancedBaseline,
  runToggleRoundTrip,
  screenshotActivation,
  selectedActions,
  stableActionPlan,
  settingsSectionLabelSelector,
  settingsSectionMeasurement,
  settingsSectionSetupReady,
  uiActivationLabel,
  unclassifiedDeviceWarning,
  validateBorrowedActionSession,
  visibleInactiveSwatchColorExpression,
} from '../ios/capture-xcuitest-actions.mjs';
import { DEVICE_CLASSES } from '../lib/campaign-plan.mjs';
import {
  desktopActionsArtifact,
  hasMinimumActionRepeats,
  resolveViewport,
} from '../web/capture-desktop-actions.mjs';
import { eraserFillFunctionSource } from '../lib/eraser-fill.mjs';
import { loadedPageEntryProblem } from '../lib/profile-preview.mjs';
import { FULL_ACTION_GROUPS, compactSettingsActionLabel } from '../lib/action-applicability.mjs';

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
const IPAD_SCREEN = readFileSync(
  join(ROOT, 'tools', 'perf', 'ios', 'capture-xcuitest-screen.mjs'),
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
  const physicalIpadUdid = '00008103-DEADBEEFDEADBEEF';
  const physicalIpadSession = {
    capabilities: { platformName: 'iOS', deviceName: 'Kyle\u2019s iPad' },
  };
  // The shape a real device actually reports: udid, platformName, platformVersion and
  // browserName, and no deviceName at all. Every positive case that supplies a
  // deviceName the device does not send is how the ledger stayed unreachable while
  // these tests passed.
  const minimalPhysicalSafariSession = {
    capabilities: {
      browserName: 'Safari',
      platformName: 'iOS',
      platformVersion: '26.5',
      udid: physicalIpadUdid,
      automationName: 'XCUITest',
    },
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

  it('applies the ledger to a physical iPad session that reports no deviceName', () => {
    expect(
      actionGateAllowances({
        nativeApp: false,
        deviceClass: 'tablet',
        requestedCapabilities: null,
        session: minimalPhysicalSafariSession,
      })
    ).toBe(IOS_ACTION_GATE_ALLOWANCES);
  });

  describe('unclassifiedDeviceWarning', () => {
    const simulatorUdid = 'C6012C49-AA93-4869-B3A6-E47C9EAAC567';
    const unclassified = {
      nativeApp: false,
      deviceId: physicalIpadUdid,
      requestedCapabilities: null,
      session: minimalPhysicalSafariSession,
    };
    const physicalSafariSessionNamed = (deviceName) => ({
      capabilities: { ...minimalPhysicalSafariSession.capabilities, deviceName },
    });

    it('warns about an unclassified physical Safari capture that still records base gates', () => {
      expect(unclassifiedDeviceWarning(unclassified)).toBe(
        '[ipad-actions] Physical iOS Safari capture without --device-class: base gates will be recorded'
      );
      expect(actionGateAllowances(unclassified)).toEqual({});
    });

    it.each([
      [
        'a device name that names neither an iPad nor an iPhone',
        { session: physicalSafariSessionNamed('My Device') },
      ],
      ['a device class outside the campaign vocabulary', { deviceClass: 'ipad' }],
    ])('treats %s as unclassified', (_name, changes) => {
      const classification = { ...unclassified, ...changes };
      expect(unclassifiedDeviceWarning(classification)).toBe(
        unclassifiedDeviceWarning(unclassified)
      );
      expect(actionGateAllowances(classification)).toEqual({});
    });

    it.each([
      ['an explicit tablet', { deviceClass: 'tablet' }, IOS_ACTION_GATE_ALLOWANCES],
      ['an explicit handset', { deviceClass: 'handset' }, {}],
      [
        'a session named as an iPhone',
        { session: physicalSafariSessionNamed('Kyle’s iPhone') },
        {},
      ],
      ['a native-app capture', { nativeApp: true }, {}],
      [
        'a simulator capture',
        {
          deviceId: simulatorUdid,
          session: {
            capabilities: { browserName: 'Safari', platformName: 'iOS', udid: simulatorUdid },
          },
        },
        {},
      ],
    ])('stays silent for %s and keeps its allowances', (_name, changes, allowances) => {
      const classification = { ...unclassified, ...changes };
      expect(unclassifiedDeviceWarning(classification)).toBeNull();
      expect(actionGateAllowances(classification)).toEqual(allowances);
    });
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

describe('parseDeviceClass', () => {
  it('accepts an omitted flag and every class a campaign target may declare', () => {
    expect(parseDeviceClass(undefined)).toBeUndefined();
    for (const deviceClass of DEVICE_CLASSES) {
      expect(parseDeviceClass(deviceClass)).toBe(deviceClass);
    }
  });

  it('rejects a misspelled class instead of letting it record base gates', () => {
    expect(() => parseDeviceClass('ipad')).toThrow('--device-class must be one of');
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
      actionPlan: {
        schemaVersion: 1,
        actionGroups: ['rotation'],
        applicableLabels: ['with ink: PORTRAIT to LANDSCAPE rotation'],
        notApplicable: [],
        context: { orientation: 'PORTRAIT', settingsShell: null },
      },
      actions: ['rotation'],
      repeats: 9,
      samples: [],
      summaries: [],
      passed: true,
    });

    expect(artifact.captureRuntime).toBe('desktop-playwright');
    expect(artifact.engine).toBe('webkit');
    expect(artifact.viewport).toEqual({ width: 1366, height: 915, deviceScaleFactor: 2 });
    expect(artifact.actionPlan.context.orientation).toBe('PORTRAIT');
    expect(artifact.frameStampEpoch).toBeNull();
  });

  it('refuses action applicability that changes between repeats', () => {
    const first = {
      schemaVersion: 1,
      actionGroups: FULL_ACTION_GROUPS,
      applicableLabels: ['open Settings', 'close Settings'],
      notApplicable: [],
      context: { orientation: 'PORTRAIT', settingsShell: 'sectioned' },
    };
    expect(stableActionPlan(null, first)).toBe(first);
    expect(
      stableActionPlan(first, {
        ...first,
        actionGroups: [...first.actionGroups].reverse(),
        applicableLabels: [...first.applicableLabels].reverse(),
      })
    ).toBe(first);
    expect(() =>
      stableActionPlan(first, {
        ...first,
        applicableLabels: ['open Settings', 'open Parent Center'],
      })
    ).toThrow(
      'applicable action plan changed between scored repeats: +open Parent Center -close Settings'
    );
    expect(() =>
      stableActionPlan(first, {
        ...first,
        applicableLabels: ['open Settings'],
        notApplicable: [
          {
            label: 'close Settings',
            reason: 'the action is unavailable in this product surface',
          },
        ],
      })
    ).toThrow('applicable action plan changed between scored repeats: ~close Settings');
  });
});

describe('trusted action setup', () => {
  it('releases the native rotation lock before applying a requested orientation', () => {
    const setupStart = IPAD_ACTIONS.indexOf('const needsNativeRotationUnlock =');
    const setupEnd = IPAD_ACTIONS.indexOf('const appUrl =', setupStart);
    const setup = IPAD_ACTIONS.slice(setupStart, setupEnd);
    const unlock = setup.indexOf('releaseNativeRotationLock(execute)');
    const rotate = setup.indexOf('orientation: requestedOrientation');

    expect(setupStart).toBeGreaterThan(-1);
    expect(setupEnd).toBeGreaterThan(setupStart);
    expect(unlock).toBeGreaterThan(-1);
    expect(rotate).toBeGreaterThan(unlock);
    expect(setup).toContain('initialRotationLock === PLATFORM_OWNS_ROTATION');
  });

  it('rechecks live orientation after releasing a native lock', () => {
    for (const [source, unlockDecision] of [
      [IPAD_ACTIONS, 'const needsNativeRotationUnlock ='],
      [IPAD_SCREEN, 'const needsRotationUnlock ='],
    ]) {
      const setupStart = source.indexOf(unlockDecision);
      const setupEnd = source.indexOf('const appUrl =', setupStart);
      const setup = source.slice(setupStart, setupEnd);
      const unlock = setup.indexOf('releaseNativeRotationLock(execute)');
      const liveRead = setup.indexOf("currentOrientation = await client.request('GET'");
      const comparison = setup.indexOf('requestedOrientation !== currentOrientation');

      expect(unlock).toBeGreaterThan(-1);
      expect(liveRead).toBeGreaterThan(unlock);
      expect(comparison).toBeGreaterThan(liveRead);
    }
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
    const restoreLock = cleanup.indexOf('restoreNativeRotationLock(execute,');

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

describe('max-breach confirmation across scored repeats (ADR-0156)', () => {
  // Every frame is inside a visual effect so the whole run is action-owned and scored — a
  // dialog fly-in rather than a tap that settles in four frames.
  const scored = (gaps, warmup = false) => ({
    ...action(gaps.map((gapMs, index) => frame(index * 16.7, gapMs, true))),
    warmup,
  });
  const steady = (length) => Array.from({ length }, () => 16.7);
  const clean = () => scored(steady(20));
  const breaching = () => scored([...steady(8), ACTION_FRAME_MAX_GATE_MS + 1, ...steady(11)]);

  it('records a single breaching repeat as unconfirmed rather than failing the group', () => {
    const summary = summarizeActionGroup([scored([16.7], true), breaching(), clean(), clean()]);
    expect(summary.frames.max).toBe(ACTION_FRAME_MAX_GATE_MS + 1);
    expect(summary.frames.maxBreachSamples).toBe(1);
    expect(summary.frames.maxUnconfirmed).toBe(true);
    expect(summary.passed).toBe(true);
  });

  it('fails a breach that recurs in two of three scored repeats', () => {
    const summary = summarizeActionGroup([scored([16.7], true), breaching(), clean(), breaching()]);
    expect(summary.frames.maxBreachSamples).toBe(2);
    expect(summary.frames.maxUnconfirmed).toBe(false);
    expect(summary.passed).toBe(false);
  });

  // Pooled P95 cannot see a hitch that recurs once per long activation, which is
  // why the max has to stay at two beats and why it must recur to count.
  it('still fails one two-beat frame per repeat inside a long animation', () => {
    const long = () => scored([...steady(39), ACTION_FRAME_MAX_GATE_MS + 1]);
    const summary = summarizeActionGroup([scored([16.7], true), long(), long(), long()]);
    expect(summary.frames.p95).toBeLessThanOrEqual(ACTION_FRAME_P95_GATE_MS);
    expect(summary.frames.maxBreachSamples).toBe(3);
    expect(summary.passed).toBe(false);
  });

  it('keeps the direct max rule for a bare group without warm-up metadata', () => {
    const bare = action([frame(0, 16.7), frame(16.7, ACTION_FRAME_MAX_GATE_MS + 1)]);
    const summary = summarizeActionGroup([bare]);
    expect(summary.frames.maxUnconfirmed).toBe(false);
    expect(summary.passed).toBe(false);
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
  // The sweep returns {samples, settingsShell, actionPlan} rather than a bare array, and it has
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

  it('records the optional coloring-grid scroll in the declared action plan', () => {
    const source = readFileSync(join(ROOT, CALLERS[0]), 'utf8');
    expect(source).toContain('notApplicable.set(COLORING_SCROLL_ACTION_LABEL');
    expect(source).toContain('await record(scroll.sample)');
    expect(source).not.toContain('samples.push(scroll.sample)');
  });

  it('reads the sweep through its result shape in each caller', () => {
    for (const relative of CALLERS) {
      const source = readFileSync(join(ROOT, relative), 'utf8');
      expect(source).toContain('sweep.samples');
      expect(source).toContain('sweep.settingsShell');
      expect(source).toContain('sweep.actionPlan');
      expect(source).not.toMatch(/for \(const sample of sweep\)/);
      expect(source).not.toMatch(/\.\.\.sweep\.map\(/);
    }
  });

  // ADR-0163: every action artifact names the frame clocks its samples carry,
  // so a reader can tell a dual-channel capture from a legacy one without
  // opening a sample. Derived from the samples in each runner rather than read
  // from the page, so the marker can never disagree with the data beside it.
  it('records the frame-stamp epoch of its samples in every artifact', () => {
    for (const relative of CALLERS) {
      const source = readFileSync(join(ROOT, relative), 'utf8');
      expect(source, relative).toContain('frameStampEpoch: frameStampEpochOf(samples)');
    }
  });
});

// ADR-0160: the P95 ledger is a set of measured, per-action residuals for the
// calibrated iPad web row — sized from committed evidence, rendered with its
// basis, applied by matrix target id like ADR-0137's lost-frame exceptions,
// and reaching no other target.
describe('the calibrated iPad web allowance ledger', () => {
  const covered = [
    'open Settings',
    'close Settings',
    'select coloring page',
    'switch light theme to dark',
    inkRotationActionLabel('PORTRAIT', 'LANDSCAPE'),
  ];

  it('names exactly the actions ADR-0160 covers', () => {
    expect(Object.keys(IOS_ACTION_GATE_ALLOWANCES.p95).sort()).toEqual([...covered].sort());
    expect(Object.keys(IOS_ACTION_GATE_ALLOWANCES.max)).toEqual(['open Settings']);
  });

  it('sits above the base P95 gate and below the max gate on every entry', () => {
    for (const [label, ms] of Object.entries(IOS_ACTION_GATE_ALLOWANCES.p95)) {
      expect(ms, label).toBeGreaterThan(ACTION_FRAME_P95_GATE_MS);
      expect(ms, label).toBeLessThan(ACTION_FRAME_MAX_GATE_MS);
      expect(Number.isInteger(ms), label).toBe(true);
    }
  });

  it('is the ipad-device-web row of the per-target registry', () => {
    expect(ACTION_GATE_ALLOWANCE_LEDGERS['ipad-device-web']).toEqual({
      adrs: ['ADR-0090', 'ADR-0160'],
      allowances: IOS_ACTION_GATE_ALLOWANCES,
      entries: IOS_ACTION_GATE_ALLOWANCE_ENTRIES,
    });
    expect(actionGateAllowancesFor('ipad-device-web')).toBe(IOS_ACTION_GATE_ALLOWANCES);
  });

  it('passes a covered action inside its allowance and fails it one quantum past', () => {
    for (const [label, ms] of Object.entries(IOS_ACTION_GATE_ALLOWANCES.p95)) {
      const inside = Array.from({ length: 40 }, (_, i) => frame(i * 16.7, i < 3 ? ms : 16.7));
      const past = Array.from({ length: 40 }, (_, i) => frame(i * 16.7, i < 3 ? ms + 1 : 16.7));
      expect(
        summarizeActionGroup([action(inside)], label, IOS_ACTION_GATE_ALLOWANCES).passed,
        label
      ).toBe(true);
      expect(
        summarizeActionGroup([action(past)], label, IOS_ACTION_GATE_ALLOWANCES).passed,
        label
      ).toBe(false);
      expect(summarizeActionGroup([action(inside)], label).passed, `${label} base`).toBe(false);
    }
  });
});

// ADR-0162: the physical Android web row's one allowance, the compact-shell
// theme flip. Its value is pinned to the committed evidence rather than typed:
// one 0.1 ms clock quantum above the worst committed scored P95 of the cell,
// which lands it exactly on the max gate. Pooled P95 counts gaps and max
// confirmation counts repeats, so the allowance is at least as strict as the
// max gate and never passes a cell the max gate would fail; the concentrated-
// gap case below is where it is stricter.
describe('the physical Android web allowance ledger', () => {
  const label = `disable ${compactSettingsActionLabel('Night Mode')}`;
  const ms = ANDROID_WEB_ACTION_GATE_ALLOWANCES.p95[label];

  function committedCellReadings() {
    const evidenceRoot = join(ROOT, 'perf-profiles', 'evidence');
    const readings = [];
    for (const campaign of readdirSync(evidenceRoot)) {
      const indexPath = join(evidenceRoot, campaign, 'index.json');
      if (!existsSync(indexPath)) continue;
      const { kept = [] } = JSON.parse(readFileSync(indexPath, 'utf8'));
      for (const entry of kept) {
        if (entry.target !== 'android-device-web' || entry.brush !== 'actions') continue;
        const capture = JSON.parse(readFileSync(join(evidenceRoot, campaign, entry.file), 'utf8'));
        const samples = (capture.samples ?? []).filter((sample) => sample.label === label);
        if (samples.length === 0) continue;
        readings.push({ campaign, file: entry.file, samples, ...summarizeActions(samples)[0] });
      }
    }
    return readings;
  }

  it('names exactly the one action ADR-0162 covers, on the P95 gate only', () => {
    expect(Object.keys(ANDROID_WEB_ACTION_GATE_ALLOWANCES.p95)).toEqual([label]);
    expect(ANDROID_WEB_ACTION_GATE_ALLOWANCES.max).toEqual({});
    expect(ANDROID_WEB_ACTION_GATE_ALLOWANCE_ENTRIES.p95[label].ms).toBe(ms);
    expect(ANDROID_WEB_ACTION_GATE_ALLOWANCE_ENTRIES.max).toEqual({});
  });

  it('sits one 0.1 ms quantum above the worst committed reading of the cell, at the max gate', () => {
    const readings = committedCellReadings();
    expect(readings.length).toBeGreaterThanOrEqual(3);
    const worst = Math.max(...readings.map((reading) => reading.frames.p95));
    expect(worst).toBe(33.4);
    expect(ms).toBe(Number((worst + 0.1).toFixed(1)));
    expect(ms).toBe(ACTION_FRAME_MAX_GATE_MS);
    expect(ms).toBeGreaterThan(ACTION_FRAME_P95_GATE_MS);
    expect(Math.max(...readings.map((reading) => reading.frames.max))).toBeLessThanOrEqual(ms);
  });

  it('passes every committed reading under the ledger and fails the two-beat ones on the base gate', () => {
    const readings = committedCellReadings();
    const twoBeat = readings.filter((reading) => !reading.passed);
    expect(twoBeat.length).toBeGreaterThanOrEqual(2);
    for (const reading of readings) {
      const under = summarizeActions(reading.samples, [], ANDROID_WEB_ACTION_GATE_ALLOWANCES)[0];
      expect(under.passed, `${reading.campaign}/${reading.file}`).toBe(true);
    }
  });

  it('fails one quantum past the allowance, where the max gate also confirms the breach', () => {
    const past = ms + 0.1;
    const repeat = (warmup) =>
      action(
        Array.from({ length: 18 }, (_, i) => frame(i * 16.7, i === 1 ? past : 16.7)),
        { label, warmup }
      );
    const group = [true, false, false, false].map(repeat);
    const summary = summarizeActionGroup(group, label, ANDROID_WEB_ACTION_GATE_ALLOWANCES);
    expect(summary.frames.p95).toBe(past);
    expect(summary.frames.maxBreachSamples).toBe(3);
    expect(summary.passed).toBe(false);
  });

  // Pooled P95 counts gaps; max confirmation counts repeats (ADR-0156). Three
  // over-gate gaps from one activation leave the max unconfirmed, and only the
  // allowance fails the cell — a 34 ms allowance would pass it, which is why
  // 33.5 is the stricter policy rather than an equivalent one (ADR-0162).
  it('fails three over-gate gaps concentrated in one repeat, which the max gate leaves unconfirmed', () => {
    const past = ms + 0.1;
    const repeat = (slowFrames, warmup) =>
      action(
        Array.from({ length: 17 }, (_, i) => frame(i * 16.7, slowFrames.has(i) ? past : 16.7)),
        { label, warmup }
      );
    const concentrated = [
      repeat(new Set(), true),
      repeat(new Set([1, 2, 3]), false),
      repeat(new Set(), false),
      repeat(new Set(), false),
    ];
    const summary = summarizeActionGroup(concentrated, label, ANDROID_WEB_ACTION_GATE_ALLOWANCES);
    expect(summary.frames.p95).toBe(past);
    expect(summary.frames.maxBreachSamples).toBe(1);
    expect(summary.frames.maxUnconfirmed).toBe(true);
    expect(summary.passed).toBe(false);
    const wholeMillisecond = { p95: { [label]: Math.ceil(ms) }, max: {} };
    expect(summarizeActionGroup(concentrated, label, wholeMillisecond).passed).toBe(true);
  });

  it('carries a basis naming committed evidence corpora that exist', () => {
    const { basis } = ANDROID_WEB_ACTION_GATE_ALLOWANCE_ENTRIES.p95[label];
    const corpora = basis.match(/perf-profiles\/evidence\/[\w.-]+/g) ?? [];
    expect(corpora.length).toBeGreaterThanOrEqual(2);
    for (const corpus of corpora) {
      expect(existsSync(join(ROOT, corpus, 'index.json')), corpus).toBe(true);
    }
  });

  it('applies to the physical Android web target and to no target without a ledger', () => {
    expect(Object.keys(ACTION_GATE_ALLOWANCE_LEDGERS).sort()).toEqual([
      'android-device-web',
      'ipad-device-web',
    ]);
    expect(ACTION_GATE_ALLOWANCE_LEDGERS['android-device-web'].adrs).toEqual(['ADR-0162']);
    expect(actionGateAllowancesFor('android-device-web')).toBe(ANDROID_WEB_ACTION_GATE_ALLOWANCES);
    for (const target of [
      'ipad-device-native',
      'android-device-native',
      'android-emulator-web',
      'ipad-simulator-web',
      'constructor',
    ]) {
      expect(actionGateAllowancesFor(target), target).toEqual({});
    }
    expect(actionGateAllowancesFor(undefined)).toEqual({});
  });
});
