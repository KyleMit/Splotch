// The discrete-action sweep as data, transcribed block by block from runActionSweep in
// tools/perf/ios/capture-xcuitest-actions.mjs. Position is part of the instrument: Settings opens
// once, its sections, theme and controls are measured inside it, and it closes once. Every
// preparation the sweep performs between samples (a menu reopened, a stroke laid down, a toggle
// returned to its baseline) is a step here, so the resolved plan is the shipped sequence, not its
// group list. Every id is one measured direction, so an allowance for light-to-dark cannot leak
// to dark-to-light.
import {
  defineScenario,
  focusActions,
  type ActionContext,
  type ControlAction,
  type ExternalAction,
  type MeasuredAction,
  type PageFunction,
  type ScenarioStep,
  type SweepBlock,
  type ToggleAction,
} from 'perf-rig';
import {
  panelHas,
  panelLacks,
  RESOLVED_THEME,
  SETTINGS_SECTIONS,
  SETTINGS_SECTION_LABEL,
  splotch,
  type Orientation,
  type SettingsSection,
  type Splotch,
} from '../app.js';

type Ctx = ActionContext<Splotch>;
type Steps = readonly ScenarioStep<Splotch>[];
type Section = { readonly family: 'settingsSection'; readonly member: SettingsSection };

const ANIMATED_SETTLE_MS = 1100;
const SCREENSHOT_SETTLE_MS = 3000;
const PLAIN_SETTLE_MS = 650;
const READY_TIMEOUT_MS = 30_000;
const TRUSTED_STROKE_MS = 650;
const COLORING_SCROLL_PX = 400;
const COLORING_SCROLL_MS = 450;
const CANVAS_HAS_INK = 'document.querySelector("#screenshotButton")?.disabled === false';
const CANVAS_EMPTY = 'document.querySelector("#screenshotButton")?.disabled === true';
const UNDO_ARMED =
  'document.querySelector("#undoButton")?.getAttribute("aria-disabled") === "false"';
const UNDO_SPENT =
  'document.querySelector("#undoButton")?.getAttribute("aria-disabled") === "true"';
const BRUSH_MENU_OPEN =
  'document.querySelector("#brushButton")?.getAttribute("aria-expanded") === "true"';
const HUB_SHOWING = 'document.querySelector("#settingsModal .hub-list") !== null';
const PICKER_GRID_SETTLED =
  '(() => { const el = document.querySelector("#color-picker .hexagon:not(.selected)"); if (!el) return false; const r = el.getBoundingClientRect(); const key = [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10)).join(","); const prev = window.__pickerRectProbe; window.__pickerRectProbe = key; return prev === key && r.width > 0; })()';
const DOWNLOAD_READY = 'Number.isFinite(window.__actionDownloadReadyAt)';
const ARM_DOWNLOAD_SINK =
  'function armDownloadSink() { /* capture-xcuitest-actions.mjs: stamp __actionDownloadReadyAt from HTMLAnchorElement.prototype.click, or from __screenshotSaveSink on a native platform */ }' as PageFunction<
    [],
    true
  >;
const RESTORE_DOWNLOAD_SINK =
  'function restoreDownloadSink() { /* undo armDownloadSink */ }' as PageFunction<[], true>;
const RESET_COLORING_SCROLL =
  'function resetColoringScroll() { document.querySelector("#coloring-book-dialog").scrollTop = 0; return true; }' as PageFunction<
    [],
    true
  >;

const flip = (o: Orientation): Orientation => (o === 'PORTRAIT' ? 'LANDSCAPE' : 'PORTRAIT');
const compact = (c: Ctx) => c.variant === 'compact';
const section = (member: SettingsSection): Section => ({ family: 'settingsSection', member });
const settle = (ms: number, reason: string): ScenarioStep<Splotch> => ({
  kind: 'settle',
  ms,
  reason,
});
const until = (expression: string, timeoutMs = READY_TIMEOUT_MS): ScenarioStep<Splotch> => ({
  kind: 'until',
  expression,
  equals: true,
  timeoutMs,
});

// A trusted stroke through the actions transport, proved by the undo button arming, as
// addTrustedStroke lays it down before the screenshot, undo, clear and rotation samples.
const trustedStroke: ScenarioStep<Splotch> = {
  kind: 'trustedStroke',
  path: (b) => [
    { x: b.x + b.width * 0.24, y: b.y + b.height * 0.38, atMs: 0 },
    { x: b.x + b.width * 0.66, y: b.y + b.height * 0.54, atMs: TRUSTED_STROKE_MS },
  ],
  durationMs: TRUSTED_STROKE_MS,
  proof: UNDO_ARMED,
  timeoutMs: READY_TIMEOUT_MS,
};
// ensureStableTrustedStroke: ink on the canvas, laid down only when absent.
const ensureInk: Steps = [
  {
    kind: 'retryUntil',
    expression: CANVAS_HAS_INK,
    equals: true,
    settleMs: PLAIN_SETTLE_MS,
    timeoutMs: READY_TIMEOUT_MS,
    attempts: 3,
    body: [trustedStroke],
  },
];
const ensureDrawer = (open: boolean): Steps => [
  {
    kind: 'retryUntil',
    expression: open ? panelHas('data-drawer-open') : panelLacks('data-drawer-open'),
    equals: true,
    settleMs: PLAIN_SETTLE_MS,
    timeoutMs: READY_TIMEOUT_MS,
    body: [{ kind: 'click', target: open ? 'expandDrawer' : 'collapseDrawer' }],
  },
];
const reopenBrushMenu: Steps = [{ kind: 'click', target: 'brushMenu' }, until(BRUSH_MENU_OPEN)];
// ensureSettingsHub: the phone hub drills in, so a measured row needs the hub back first; the wide
// pane never leaves its table of contents.
const backToHub = (c: Ctx): Steps =>
  c.variant === 'hub'
    ? [
        {
          kind: 'ifPresent',
          target: 'settingsBack',
          then: [{ kind: 'click', target: 'settingsBack' }, until(HUB_SHOWING)],
        },
      ]
    : [];
const openSection = (c: Ctx, member: SettingsSection, ready: string): Steps => [
  ...backToHub(c),
  { kind: 'click', target: section(member) },
  until(
    c.variant === 'wide'
      ? `(${ready}) && document.querySelector('#settingsModal button[data-section="${member}"]')?.getAttribute("aria-current") === "location"`
      : ready
  ),
];
const closeParentalGateIfOpen: Steps = [
  {
    kind: 'ifPresent',
    target: {
      selector: '#parentalGate[open]',
      reason: 'the gate is a state of the parental-gate control, not a control of its own',
    },
    then: [
      { kind: 'click', target: 'closeParentalGate' },
      until('document.querySelector("#parentalGate")?.open !== true'),
      settle(ANIMATED_SETTLE_MS, 'gate close transition'),
    ],
  },
];
const closeOpenDialogs: Steps = [
  {
    kind: 'evaluate',
    fn: 'function closeDialogs() { for (const d of document.querySelectorAll("dialog[open]")) d.querySelector("button[aria-label=Close]")?.click(); return true; }' as PageFunction<
      [],
      true
    >,
    awaits: false,
    recordAs: 'dialogsClosed',
  },
  settle(PLAIN_SETTLE_MS, 'dialog close'),
];
const themeIs = (theme: 'light' | 'dark') => `${RESOLVED_THEME} === ${JSON.stringify(theme)}`;
const rotation = (
  id: string,
  label: string,
  to: Orientation,
  setup?: Steps
): ExternalAction<Splotch> => ({
  id,
  label,
  dimension: 'orientation',
  to: () => to,
  ...(setup ? { setup } : {}),
});
const rotationLabel = (from: Orientation, to: Orientation) => `${from} to ${to} rotation`;

const sectionRows = (c: Ctx): readonly MeasuredAction<Splotch>[] =>
  SETTINGS_SECTIONS.slice(1).map((member): ControlAction<Splotch> => ({
    id: `settings-sections.${member}`,
    label:
      member === 'parentCenter'
        ? 'open Parent Center'
        : `open Settings section: ${SETTINGS_SECTION_LABEL[member]}`,
    control: section(member),
    setup: backToHub(c),
    ...(member === 'parentCenter' ? { teardown: closeParentalGateIfOpen } : {}),
  }));

// themeRoundTripPlan: the sectioned sweep always prepares dark, measures dark→light then
// light→dark, and restores a light baseline afterwards; the measured order does not depend on the
// baseline. The compact shell's Night Mode toggle is measured away from the baseline and back, so
// a light baseline yields enable then disable and a dark one disable then enable.
const themeActions = (c: Ctx): readonly MeasuredAction<Splotch>[] =>
  compact(c)
    ? [
        {
          kind: 'toggle',
          id: 'theme.compact',
          label: 'Night Mode in the compact shell',
          control: 'quickNightToggle',
          baseline: c.dimensions.theme === 'dark',
          readyFor: (enabled) => themeIs(enabled ? 'dark' : 'light'),
          settleMs: ANIMATED_SETTLE_MS,
        },
      ]
    : [
        {
          id: 'theme.round-trip',
          setup: [
            ...openSection(
              c,
              'appearance',
              'document.querySelector("#themeOption-light") !== null'
            ),
            { kind: 'click', target: 'themeDark' },
            until('document.documentElement.dataset.theme === "dark"'),
            settle(PLAIN_SETTLE_MS, 'dark theme preparation'),
          ],
          steps: [
            {
              id: 'theme.to-light',
              label: 'switch dark theme to light',
              control: 'themeLight',
              settleMs: ANIMATED_SETTLE_MS,
            },
            {
              id: 'theme.to-dark',
              label: 'switch light theme to dark',
              control: 'themeDark',
              settleMs: ANIMATED_SETTLE_MS,
            },
          ],
          teardown:
            c.dimensions.theme === 'light'
              ? [
                  { kind: 'click', target: 'themeLight' },
                  until('document.documentElement.dataset.theme === "light"'),
                  settle(PLAIN_SETTLE_MS, 'light theme restoration'),
                ]
              : [],
        },
      ];

const toggle = (
  action: Omit<ToggleAction<Splotch>, 'kind' | 'settleMs'>
): ToggleAction<Splotch> => ({ kind: 'toggle', settleMs: ANIMATED_SETTLE_MS, ...action });

const settingsControlActions = (c: Ctx): readonly MeasuredAction<Splotch>[] =>
  compact(c)
    ? [
        toggle({
          id: 'settings-controls.sound',
          label: 'drawing sounds in the compact shell',
          control: 'quickSoundToggle',
          baseline: true,
        }),
        toggle({
          id: 'settings-controls.advanced',
          label: 'advanced controls in the compact shell',
          control: 'quickAdvancedControlsToggle',
          baseline: true,
          readyFor: (enabled) => (enabled ? panelLacks('data-off-adv') : panelHas('data-off-adv')),
        }),
      ]
    : [
        toggle({
          id: 'settings-controls.sound',
          label: 'drawing sounds',
          control: 'soundToggle',
          baseline: true,
          setup: openSection(c, 'sound', 'document.querySelector("#soundToggle") !== null'),
          readyFor: (enabled) =>
            `document.querySelector("#soundVolumeLabel") ${enabled ? '!== null' : '=== null'}`,
        }),
        toggle({
          id: 'settings-controls.save-on-delete',
          label: 'auto-save on delete',
          control: 'saveOnDeleteToggle',
          baseline: false,
          setup: openSection(c, 'saving', 'document.querySelector("#saveOnDeleteToggle") !== null'),
        }),
        toggle({
          id: 'settings-controls.advanced',
          label: 'advanced controls',
          control: 'advancedControlsToggle',
          baseline: true,
          setup: openSection(
            c,
            'controls',
            'document.querySelector("#advancedControlsToggle") !== null'
          ),
          readyFor: (enabled) => (enabled ? panelLacks('data-off-adv') : panelHas('data-off-adv')),
          // runScreenshotToggleAtAdvancedBaseline: measured while advanced controls sit at their
          // baseline, from the Saving section, and the Tool Drawer section is reopened for the restore.
          whileAtBaseline: [
            toggle({
              id: 'settings-controls.screenshot',
              label: 'screenshot action button',
              control: 'screenshotToggle',
              baseline: true,
              setup: openSection(
                c,
                'saving',
                'document.querySelector("#screenshotToggle") !== null'
              ),
              readyFor: (enabled) =>
                enabled ? panelLacks('data-off-screenshot') : panelHas('data-off-screenshot'),
            }),
          ],
          teardown: openSection(
            c,
            'controls',
            'document.querySelector("#advancedControlsToggle") !== null'
          ),
        }),
      ];

const rotationActions = (c: Ctx): readonly MeasuredAction<Splotch>[] => {
  const from = c.dimensions.orientation;
  const to = flip(from);
  return [
    {
      id: 'rotation.clear-for-blank',
      label: 'clear drawing for blank rotation',
      control: 'clear',
      onlyWithoutGroup: 'clear',
      setup: ensureInk,
      settleMs: ANIMATED_SETTLE_MS,
    },
    {
      id: 'rotation.blank-sequence',
      setup: [until(CANVAS_EMPTY, 5000)],
      steps: [
        rotation(
          `rotation.empty.${from.toLowerCase()}-to-${to.toLowerCase()}`,
          `empty after clear: ${rotationLabel(from, to)}`,
          to
        ),
        {
          id: 'rotation.undo-clear',
          label: 'undo clear after blank rotation',
          control: 'undo',
          ready: CANVAS_HAS_INK,
          settleMs: ANIMATED_SETTLE_MS,
        },
        {
          id: 'rotation.undo-restored-stroke',
          label: 'undo restored stroke after blank rotation',
          control: 'undo',
          ready: CANVAS_EMPTY,
          settleMs: ANIMATED_SETTLE_MS,
        },
        {
          id: 'rotation.clear-restored',
          label: 'clear restored drawing after blank rotation',
          control: 'clear',
          setup: ensureInk,
          settleMs: ANIMATED_SETTLE_MS,
        },
        rotation(
          `rotation.empty.${to.toLowerCase()}-to-${from.toLowerCase()}`,
          `empty after clear: ${rotationLabel(to, from)}`,
          from
        ),
      ],
    },
    {
      id: 'rotation.with-ink',
      setup: ensureInk,
      steps: [
        rotation(
          `rotation.with-ink.${from.toLowerCase()}-to-${to.toLowerCase()}`,
          `with ink: ${rotationLabel(from, to)}`,
          to
        ),
        rotation(
          `rotation.with-ink.${to.toLowerCase()}-to-${from.toLowerCase()}`,
          `with ink: ${rotationLabel(to, from)}`,
          from
        ),
      ],
    },
  ];
};

const SETTINGS_GROUPS = ['settings-sections', 'settings-controls', 'theme'] as const;

const sequence: readonly SweepBlock<Splotch>[] = [
  {
    group: 'drawer',
    setup: ensureDrawer(false),
    actions: [
      { id: 'drawer.expand', label: 'expand action drawer', control: 'expandDrawer' },
      { id: 'drawer.collapse', label: 'collapse action drawer', control: 'collapseDrawer' },
    ],
  },
  { prepare: ensureDrawer(true), reason: 'every later control lives in the open drawer' },
  {
    group: 'palette',
    actions: [{ id: 'palette.change', label: 'change ink color', control: 'paletteSwatch' }],
  },
  {
    group: 'color-picker',
    actions: [
      {
        id: 'color-picker.open',
        label: 'open custom color picker',
        control: 'colorPicker',
        settleMs: ANIMATED_SETTLE_MS,
      },
      {
        id: 'color-picker.select',
        label: 'select custom color',
        control: 'colorPickerHexagon',
        // The dialog's fly-in moves the hexagon between coordinate resolution and the native tap;
        // tap only once the target holds still across consecutive polls.
        setup: [until(PICKER_GRID_SETTLED, 10_000)],
        eventTypes: ['pointerdown'],
        settleMs: ANIMATED_SETTLE_MS,
      },
    ],
  },
  {
    group: 'brushes',
    actions: [
      { id: 'brushes.open', label: 'open brush menu', control: 'brushMenu' },
      { id: 'brushes.crayon', label: 'select crayon brush', control: 'crayonBrush' },
      // Selecting a brush closes the menu; each later selection reopens it first.
      {
        id: 'brushes.magic',
        label: 'select Magic brush',
        control: 'magicBrush',
        setup: reopenBrushMenu,
      },
      { id: 'brushes.eraser', label: 'select eraser', control: 'eraser', setup: reopenBrushMenu },
      { id: 'brushes.pen', label: 'select pen brush', control: 'penBrush', setup: reopenBrushMenu },
    ],
  },
  {
    group: 'stroke-width',
    actions: [
      { id: 'stroke-width.open', label: 'open stroke-width menu', control: 'strokeWidthMenu' },
      { id: 'stroke-width.change', label: 'change stroke width', control: 'strokeWidthOption' },
    ],
  },
  {
    group: 'settings',
    runsWith: SETTINGS_GROUPS,
    setup: closeOpenDialogs,
    actions: [
      {
        id: 'settings.open',
        label: 'open Settings',
        control: 'settings',
        settleMs: ANIMATED_SETTLE_MS,
      },
    ],
  },
  {
    group: 'settings-sections',
    applicable: (c) => (compact(c) ? { reason: 'the compact shell has no section rows' } : true),
    setup: [{ kind: 'waitPresent', target: section('appearance'), timeoutMs: READY_TIMEOUT_MS }],
    actions: sectionRows,
  },
  { group: 'theme', actions: themeActions },
  { group: 'settings-controls', actions: settingsControlActions },
  {
    group: 'settings',
    runsWith: SETTINGS_GROUPS,
    actions: [
      {
        id: 'settings.close',
        label: 'close Settings',
        control: 'closeSettings',
        settleMs: ANIMATED_SETTLE_MS,
      },
    ],
  },
  {
    group: 'coloring',
    actions: [
      {
        id: 'coloring.open-books',
        label: 'open coloring books',
        control: 'coloringBooks',
        settleMs: ANIMATED_SETTLE_MS,
      },
      {
        id: 'coloring.open-book',
        label: 'open coloring book',
        control: 'coloringBook',
        when: {
          present: 'coloringBook',
          reason: 'a single-book catalogue opens straight to its pages',
        },
        setup: [
          {
            kind: 'ifPresent',
            target: 'coloringBack',
            then: [
              { kind: 'click', target: 'coloringBack' },
              { kind: 'waitPresent', target: 'coloringBook', timeoutMs: READY_TIMEOUT_MS },
              settle(ANIMATED_SETTLE_MS, 'book choices transition'),
            ],
          },
        ],
        settleMs: ANIMATED_SETTLE_MS,
      },
      // Measured before the page selection closes the dialog, as measureColoringPageScroll runs it.
      {
        kind: 'scroll',
        id: 'coloring.scroll',
        label: 'scroll coloring pages',
        control: 'coloringPages',
        distancePx: COLORING_SCROLL_PX,
        durationMs: COLORING_SCROLL_MS,
        ready: 'document.querySelector("#coloring-book-dialog")?.scrollTop > 0',
        notApplicable: {
          expression:
            '(() => { const d = document.querySelector("#coloring-book-dialog"); return !!d?.open && d.scrollHeight <= d.clientHeight; })()',
          reason: 'the coloring-page grid fits without scrolling in this target mode',
        },
        reset: [
          {
            kind: 'evaluate',
            fn: RESET_COLORING_SCROLL,
            awaits: false,
            recordAs: 'coloringScrollReset',
          },
          settle(PLAIN_SETTLE_MS, 'scroll position restored'),
        ],
      },
      {
        id: 'coloring.select-page',
        label: 'select coloring page',
        control: 'coloringPage',
        settleMs: ANIMATED_SETTLE_MS,
      },
      {
        id: 'coloring.clear-page',
        label: 'clear coloring page',
        control: 'clearColoringPage',
        setup: [
          { kind: 'click', target: 'coloringBooks' },
          until('document.querySelector("#coloring-book-dialog")?.open === true'),
          settle(ANIMATED_SETTLE_MS, 'coloring books reopened'),
        ],
        activation: 'trusted',
        settleMs: ANIMATED_SETTLE_MS,
      },
    ],
  },
  {
    prepare: [trustedStroke, settle(PLAIN_SETTLE_MS, 'stroke committed')],
    reason: 'screenshot, undo and clear measure against a drawing',
    when: ['screenshot', 'undo', 'clear'],
  },
  {
    group: 'screenshot',
    actions: [
      {
        id: 'screenshot.save',
        label: 'save screenshot',
        control: 'screenshot',
        setup: [
          { kind: 'evaluate', fn: ARM_DOWNLOAD_SINK, awaits: false, recordAs: 'downloadSinkArmed' },
        ],
        ready: DOWNLOAD_READY,
        activation: 'trusted',
        settleMs: SCREENSHOT_SETTLE_MS,
        teardown: [
          {
            kind: 'evaluate',
            fn: RESTORE_DOWNLOAD_SINK,
            awaits: false,
            recordAs: 'downloadSinkRestored',
          },
        ],
      },
    ],
  },
  {
    group: 'undo',
    actions: [
      {
        id: 'undo.latest',
        label: 'undo latest stroke',
        control: 'undo',
        ready: UNDO_SPENT,
        settleMs: ANIMATED_SETTLE_MS,
      },
    ],
  },
  {
    group: 'clear',
    actions: [
      {
        id: 'clear.drawing',
        label: 'clear drawing',
        control: 'clear',
        setup: ensureInk,
        settleMs: ANIMATED_SETTLE_MS,
      },
    ],
  },
  // Desktop rotates too: the Playwright client swaps the viewport dimensions (webdriver-client.mjs
  // setOrientation), and the desktop first-frame policy in gates.ts scores those samples.
  { group: 'rotation', actions: rotationActions },
];

export const actionSweep = defineScenario(splotch, {
  kind: 'actions',
  id: 'action-sweep',
  description:
    'Idle baseline then every discrete product action in the shipped order, one warmup and three scored repeats.',
  idleBaseline: { label: 'idle frame control', idleMs: 5000 },
  sequence,
  repeats: { warmup: 1, scored: 3 },
  settleTailFrames: 4,
});

export const focusedActions = (groupIds: readonly string[]) => focusActions(actionSweep, groupIds);
