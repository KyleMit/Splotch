// The discrete-action sweep as data, in the shipped group order (order is part of the instrument).
// Every id is one measured direction, so an allowance for light-to-dark cannot leak to dark-to-light.
import {
  defineScenario,
  focusActions,
  type ActionGroup,
  type ActionContext,
  type ControlAction,
  type ScenarioStep,
} from 'perf-rig';
import { splotch, type Splotch } from '../app.js';

type Ctx = ActionContext<Splotch>;
type Steps = readonly ScenarioStep<Splotch>[];
const flip = (o: string) => (o === 'PORTRAIT' ? 'LANDSCAPE' : 'PORTRAIT');
const compact = (c: Ctx) => c.variant === 'compact';
const openSettings: Steps = [
  { kind: 'click', target: 'settings' },
  { kind: 'waitPresent', target: 'settings', timeoutMs: 10_000 },
];
const closeSettings: Steps = [{ kind: 'click', target: 'closeSettings' }];
const inSettings = (action: ControlAction<Splotch>): ControlAction<Splotch> => ({
  ...action,
  setup: openSettings,
  teardown: closeSettings,
});
const compactSuffix = (label: string) => (c: Ctx) =>
  compact(c) ? `${label} in the compact shell` : label;

const groups: ActionGroup<Splotch>[] = [
  {
    id: 'drawer',
    actions: [
      { id: 'drawer.expand', label: 'expand action drawer', control: 'expandDrawer' },
      { id: 'drawer.collapse', label: 'collapse action drawer', control: 'collapseDrawer' },
    ],
  },
  {
    id: 'palette',
    actions: [{ id: 'palette.change', label: 'change ink color', control: 'paletteSwatch' }],
  },
  {
    id: 'color-picker',
    actions: [
      { id: 'color-picker.open', label: 'open custom color picker', control: 'colorPicker' },
      { id: 'color-picker.select', label: 'select custom color', control: 'colorPickerHexagon' },
    ],
  },
  {
    id: 'brushes',
    actions: [
      { id: 'brushes.open', label: 'open brush menu', control: 'brushMenu' },
      { id: 'brushes.crayon', label: 'select crayon brush', control: 'crayonBrush' },
      { id: 'brushes.magic', label: 'select Magic brush', control: 'magicBrush' },
      { id: 'brushes.eraser', label: 'select eraser', control: 'eraser' },
      { id: 'brushes.pen', label: 'select pen brush', control: 'penBrush' },
    ],
  },
  {
    id: 'stroke-width',
    actions: [
      { id: 'stroke-width.open', label: 'open stroke-width menu', control: 'strokeWidthMenu' },
      { id: 'stroke-width.change', label: 'change stroke width', control: 'strokeWidthOption' },
    ],
  },
  {
    id: 'settings',
    actions: [
      { id: 'settings.open', label: 'open Settings', control: 'settings' },
      { id: 'settings.close', label: 'close Settings', control: 'closeSettings' },
    ],
  },
  {
    id: 'settings-sections',
    applicable: (c: Ctx) =>
      compact(c) ? { reason: 'the compact shell has no section rows' } : true,
    // One row per section after the first, enumerated from the page; the parental gate is closed after.
    actions: (c: Ctx) => [
      ...(c.dimensions.theme ? ['drawing', 'sounds', 'saving', 'appearance'] : []).map((section) =>
        inSettings({
          id: `settings-sections.${section}`,
          label: `open Settings section: ${section}`,
          control: 'settingsSection',
        })
      ),
      inSettings({
        id: 'settings-sections.parent-center',
        label: 'open Parent Center',
        control: 'parentCenter',
        teardown: [{ kind: 'click', target: 'closeParentalGate' }, ...closeSettings],
      }),
    ],
  },
  {
    id: 'settings-controls',
    actions: (c: Ctx) => [
      inSettings({
        id: 'settings-controls.sound',
        label: compactSuffix('drawing sounds'),
        control: compact(c) ? 'quickSoundToggle' : 'soundToggle',
      }),
      ...(compact(c)
        ? []
        : [
            inSettings({
              id: 'settings-controls.save-on-delete',
              label: 'auto-save on delete',
              control: 'saveOnDeleteToggle',
            }),
          ]),
      inSettings({
        id: 'settings-controls.advanced',
        label: compactSuffix('advanced controls'),
        control: compact(c) ? 'quickAdvancedControlsToggle' : 'advancedControlsToggle',
      }),
      ...(compact(c)
        ? []
        : [
            inSettings({
              id: 'settings-controls.screenshot',
              label: 'screenshot action button',
              control: 'screenshotToggle',
            }),
          ]),
    ],
  },
  {
    id: 'theme',
    actions: (c: Ctx) =>
      compact(c)
        ? [
            {
              id: 'theme.compact-round-trip',
              steps: [
                inSettings({
                  id: 'theme.compact-disable',
                  label: 'disable Night Mode in the compact shell',
                  control: 'quickNightToggle',
                }),
                inSettings({
                  id: 'theme.compact-enable',
                  label: 'enable Night Mode in the compact shell',
                  control: 'quickNightToggle',
                }),
              ],
            },
          ]
        : [
            {
              id: 'theme.round-trip',
              steps:
                c.dimensions.theme === 'dark'
                  ? [
                      inSettings({
                        id: 'theme.to-light',
                        label: 'switch dark theme to light',
                        control: 'themeLight',
                      }),
                      inSettings({
                        id: 'theme.to-dark',
                        label: 'switch light theme to dark',
                        control: 'themeDark',
                      }),
                    ]
                  : [
                      inSettings({
                        id: 'theme.to-dark',
                        label: 'switch light theme to dark',
                        control: 'themeDark',
                      }),
                      inSettings({
                        id: 'theme.to-light',
                        label: 'switch dark theme to light',
                        control: 'themeLight',
                      }),
                    ],
            },
          ],
  },
  {
    id: 'coloring',
    actions: [
      { id: 'coloring.open-books', label: 'open coloring books', control: 'coloringBooks' },
      { id: 'coloring.open-book', label: 'open coloring book', control: 'coloringBook' },
      { id: 'coloring.select-page', label: 'select coloring page', control: 'coloringPage' },
      { id: 'coloring.scroll', label: 'scroll coloring pages', control: 'coloringPages' },
      { id: 'coloring.clear-page', label: 'clear coloring page', control: 'clearColoringPage' },
    ],
  },
  {
    id: 'screenshot',
    actions: [{ id: 'screenshot.save', label: 'save screenshot', control: 'screenshot' }],
  },
  { id: 'undo', actions: [{ id: 'undo.latest', label: 'undo latest stroke', control: 'undo' }] },
  { id: 'clear', actions: [{ id: 'clear.drawing', label: 'clear drawing', control: 'clear' }] },
  {
    id: 'rotation',
    applicable: (c: Ctx) =>
      c.deviceClass === 'desktop' ? { reason: 'desktop engines do not rotate' } : true,
    actions: (c: Ctx) => {
      const from = c.dimensions.orientation.toLowerCase();
      const to = flip(c.dimensions.orientation).toLowerCase();
      return [
        {
          id: 'rotation.blank-sequence',
          steps: [
            {
              id: `rotation.empty.${from}-to-${to}`,
              label: `empty after clear: ${from.toUpperCase()} to ${to.toUpperCase()}`,
              dimension: 'orientation',
              to: (ctx: Ctx) => flip(ctx.dimensions.orientation),
            },
            {
              id: 'rotation.undo-clear',
              label: 'undo clear after blank rotation',
              control: 'undo',
            },
            {
              id: 'rotation.undo-restored-stroke',
              label: 'undo restored stroke after blank rotation',
              control: 'undo',
            },
            {
              id: 'rotation.clear-restored',
              label: 'clear restored drawing after blank rotation',
              control: 'clear',
            },
            {
              id: `rotation.empty.${to}-to-${from}`,
              label: `empty after clear: ${to.toUpperCase()} to ${from.toUpperCase()}`,
              dimension: 'orientation',
              to: (ctx: Ctx) => flip(ctx.dimensions.orientation),
            },
          ],
        },
        {
          id: `rotation.with-ink.${from}-to-${to}`,
          label: `with ink: ${from.toUpperCase()} to ${to.toUpperCase()}`,
          dimension: 'orientation',
          to: (ctx: Ctx) => flip(ctx.dimensions.orientation),
        },
      ];
    },
  },
];

export const actionSweep = defineScenario(splotch, {
  kind: 'actions',
  id: 'action-sweep',
  description:
    'Idle baseline then every discrete product action in the shipped order, one warmup and three scored repeats.',
  idleBaseline: { label: 'idle frame control', idleMs: 5000 },
  groups,
  repeats: { warmup: 1, scored: 3 },
  settleTailFrames: 4,
});

export const focusedActions = (groupIds: readonly string[]) => focusActions(actionSweep, groupIds);
