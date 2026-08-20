import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../lib/proc.mjs';
import {
  ACTION_FRAME_MAX_GATE_MS,
  IOS_ACTION_FRAME_P95_ALLOWANCES_MS,
  ACTION_FRAME_P95_GATE_MS,
  ACTION_SETTLE_TAIL_FRAMES,
  scoredActionFrameGaps,
  summarizeActionGroup,
} from '../lib/action-stats.mjs';
import {
  activationModeFor,
  canvasHasInk,
  coloringClearActivation,
  coloringSelectionSteps,
  customColorSelectionEventTypes,
  largestNativeRect,
  nativeAccessibilityFallbackWarning,
  runScreenshotToggleAtAdvancedBaseline,
  runToggleRoundTrip,
  screenshotActivation,
  selectedActions,
  settingsSectionMeasurement,
  settingsSectionSetupReady,
  uiActivationLabel,
  visibleInactiveSwatchColorExpression,
} from '../ios/capture-xcuitest-actions.mjs';
import { hasMinimumActionRepeats, resolveViewport } from '../web/capture-desktop-actions.mjs';

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
});

describe('trusted action setup', () => {
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
    for (const harness of [IPAD_ACTIONS, PAGE_INVENTORY]) {
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
    const ledger = IOS_ACTION_FRAME_P95_ALLOWANCES_MS;
    expect(ledger['open Settings']).toBeGreaterThan(ACTION_FRAME_P95_GATE_MS);
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
    const ledger = IOS_ACTION_FRAME_P95_ALLOWANCES_MS;
    const overAllowance = Array.from({ length: 40 }, (_, i) =>
      frame(i * 16.7, i < 3 ? ledger['open Settings'] + 1 : 16.7)
    );
    expect(summarizeActionGroup([action(overAllowance)], 'open Settings', ledger).passed).toBe(
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
