// The discrete-action sweep as data: fifteen groups, every label spelled once, ids stable for
// allowances and focusing. `--actions=` takes group ids; a focused subset keeps its own scenario id.
import { defineScenario, focusActions, type ActionGroup, type ActionContext } from 'perf-rig';
import { splotch, type Splotch } from '../app.js';

type Ctx = ActionContext<Splotch>;
const flip = (o: string) => (o === 'PORTRAIT' ? 'LANDSCAPE' : 'PORTRAIT');
const openSettings = [
  { kind: 'click', target: '#settingsButton' },
  { kind: 'waitPresent', target: '#settingsModal', timeoutMs: 10_000 },
] as const;
const closeSettings = [
  { kind: 'click', target: '#settingsModal button[aria-label="Close"]' },
] as const;

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
      c.variant === 'compact' ? { reason: 'the compact shell has no section rows' } : true,
    actions: [
      {
        id: 'settings-sections.open',
        label: 'open Settings section',
        control: 'settingsSection',
        setup: [...openSettings],
        teardown: [...closeSettings],
      },
      {
        id: 'settings-sections.parent-center',
        label: 'open Parent Center',
        control: 'parentCenter',
        setup: [...openSettings],
        teardown: [...closeSettings],
      },
    ],
  },
  {
    id: 'theme',
    actions: [
      {
        id: 'theme.switch',
        label: {
          template:
            '{variant:compact?disable Night Mode in the compact shell:switch {theme} theme to {theme:flip}}',
          vars: ['theme', 'variant'],
        },
        control: 'quickNightToggle',
        setup: [...openSettings],
        teardown: [...closeSettings],
      },
    ],
  },
  {
    id: 'settings-controls',
    actions: [
      {
        id: 'settings-controls.sound',
        label: 'drawing sounds',
        control: 'soundToggle',
        setup: [...openSettings],
        teardown: [...closeSettings],
      },
      {
        id: 'settings-controls.save-on-delete',
        label: 'auto-save on delete',
        control: 'saveOnDeleteToggle',
        setup: [...openSettings],
        teardown: [...closeSettings],
      },
      {
        id: 'settings-controls.advanced',
        label: 'advanced controls',
        control: 'advancedControlsToggle',
        setup: [...openSettings],
        teardown: [...closeSettings],
      },
      {
        id: 'settings-controls.screenshot',
        label: 'screenshot action button',
        control: 'screenshotToggle',
        setup: [...openSettings],
        teardown: [...closeSettings],
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
    actions: [
      {
        id: 'rotation.empty',
        label: {
          template: 'empty after clear: {orientation} to {orientation:flip}',
          vars: ['orientation'],
        },
        external: 'rotate',
        to: (c: Ctx) => flip(c.dimensions.orientation),
      },
      {
        id: 'rotation.with-ink',
        label: { template: 'with ink: {orientation} to {orientation:flip}', vars: ['orientation'] },
        external: 'rotate',
        to: (c: Ctx) => flip(c.dimensions.orientation),
      },
    ],
  },
];

export const actionSweep = defineScenario(splotch, {
  kind: 'actions',
  id: 'action-sweep',
  description:
    'Idle baseline then every discrete product action, one warmup and three scored repeats.',
  idleBaseline: { label: 'idle frame control', idleMs: 5000 },
  groups,
  repeats: { warmup: 1, scored: 3 },
  settleTailFrames: 4,
});

export const focusedActions = (groupIds: readonly string[]) => focusActions(actionSweep, groupIds);
