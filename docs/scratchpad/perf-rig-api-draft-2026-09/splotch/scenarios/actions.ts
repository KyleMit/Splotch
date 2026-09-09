// The discrete-action sweep as data. Labels are the identities every gate allowance and matrix
// column keys on, so each is spelled exactly once here.
import { defineScenario, type ActionGroup, type ActionContext } from 'perf-rig';

const compactSettings = (context: ActionContext) =>
  context.deviceClass === 'handset' || context.dimensions['settingsShell'] === 'compact';

const groups: ActionGroup[] = [
  {
    id: 'drawer',
    actions: [
      { label: 'expand action drawer', control: 'expandDrawer' },
      { label: 'collapse action drawer', control: 'collapseDrawer' },
    ],
  },
  { id: 'palette', actions: [{ label: 'change ink color', control: 'paletteSwatch' }] },
  {
    id: 'color-picker',
    actions: [
      { label: 'open custom color picker', control: 'colorPicker' },
      { label: 'select custom color', control: 'colorPickerHexagon' },
    ],
  },
  {
    id: 'brushes',
    actions: [
      { label: 'open brush menu', control: 'brushMenu' },
      { label: 'select crayon brush', control: 'crayonBrush' },
      { label: 'select Magic brush', control: 'magicBrush' },
      { label: 'select eraser', control: 'eraser' },
      { label: 'select pen brush', control: 'penBrush' },
    ],
  },
  {
    id: 'stroke-width',
    actions: [
      { label: 'open stroke-width menu', control: 'strokeWidthMenu' },
      { label: 'change stroke width', control: 'strokeWidthOption' },
    ],
  },
  {
    id: 'settings',
    actions: [
      { label: 'open Settings', control: 'settings' },
      { label: 'close Settings', control: 'closeSettings' },
    ],
  },
  {
    id: 'theme',
    actions: [
      {
        label: (context) =>
          compactSettings(context)
            ? 'disable Night Mode'
            : `switch ${context.dimensions['theme']} theme to ${context.dimensions['theme'] === 'dark' ? 'light' : 'dark'}`,
        control: 'quickNightToggle',
        setup: [
          { kind: 'click', target: 'button[aria-label="Settings"]' },
          { kind: 'waitVisible', target: '#settingsModal' },
        ],
        teardown: [{ kind: 'click', target: '#settingsModal button[aria-label="Close"]' }],
      },
    ],
  },
  {
    id: 'coloring',
    actions: [
      { label: 'open coloring books', control: 'coloringBooks' },
      { label: 'open coloring book', control: 'coloringBook' },
      { label: 'select coloring page', control: 'coloringPage' },
      { label: 'clear coloring page', control: 'clearColoringPage' },
    ],
  },
  { id: 'screenshot', actions: [{ label: 'save screenshot', control: 'screenshot' }] },
  { id: 'undo', actions: [{ label: 'undo latest stroke', control: 'undo' }] },
  { id: 'clear', actions: [{ label: 'clear drawing', control: 'clear' }] },
  {
    id: 'rotation',
    applicable: (context) =>
      context.deviceClass === 'desktop' ? { reason: 'desktop engines do not rotate' } : true,
    actions: [
      {
        label: (c) =>
          `empty after clear: ${c.orientation} to ${c.orientation === 'PORTRAIT' ? 'LANDSCAPE' : 'PORTRAIT'}`,
        control: 'rotate',
        external: 'rotate',
      },
      {
        label: (c) =>
          `with ink: ${c.orientation} to ${c.orientation === 'PORTRAIT' ? 'LANDSCAPE' : 'PORTRAIT'}`,
        control: 'rotate',
        external: 'rotate',
      },
    ],
  },
];

export const actionSweep = defineScenario({
  kind: 'actions',
  id: 'action-sweep',
  description:
    'Idle control then every discrete product action, one warmup and three scored repeats.',
  control: { label: 'idle frame control', idleMs: 5000 },
  groups,
  repeats: { warmup: 1, scored: 3 },
  settleTailFrames: 6,
});

/** A focused subset is never the canonical sweep; it keeps its own id so a fold refuses it. */
export const focusedActions = (labels: readonly string[]) =>
  defineScenario({
    ...actionSweep,
    id: `action-focus:${labels.join('|')}`,
    groups: groups
      .map((group) => ({
        ...group,
        actions: group.actions.filter(
          (a) => typeof a.label === 'string' && labels.includes(a.label)
        ),
      }))
      .filter((g) => g.actions.length > 0),
  });
