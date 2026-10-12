export const COLORING_SCROLL_ACTION_LABEL = 'scroll coloring pages';
// Two opens, never one label: the first picker open in a document pays for the
// dialog's first render of its book grid, and every later open does not. The
// bare 'open coloring books' of earlier artifacts measured whichever of the two
// its harness happened to reach, so no capture emits it and
// retiredActionLabelProblem refuses a sweep that would.
export const COLORING_FIRST_OPEN_ACTION_LABEL = 'first open of coloring books';
export const COLORING_REOPEN_ACTION_LABEL = 'reopen coloring books';
const RETIRED_ACTION_LABELS = new Map([
  [
    'open coloring books',
    `it never said which open it measured; record ${COLORING_FIRST_OPEN_ACTION_LABEL} or ${COLORING_REOPEN_ACTION_LABEL}`,
  ],
]);

export function retiredActionLabelProblem(label) {
  const reason = RETIRED_ACTION_LABELS.get(label);
  return reason ? `The action label "${label}" is retired: ${reason}` : null;
}
const COMPACT_SETTINGS_ACTION_SUFFIX = ' in the compact shell';

export const FULL_ACTION_GROUPS = [
  'idle',
  'drawer',
  'palette',
  'color-picker',
  'brushes',
  'stroke-width',
  'settings',
  'settings-sections',
  'settings-controls',
  'theme',
  'coloring',
  'screenshot',
  'ai-waiting',
  'undo',
  'unavailable',
  'clear',
  'rotation',
];

export function compactSettingsActionLabel(label) {
  return `${label}${COMPACT_SETTINGS_ACTION_SUFFIX}`;
}

export function actionNotApplicableReason(label, actionPlan) {
  const recorded = actionPlan?.notApplicable?.find((entry) => entry.label === label);
  if (recorded) return recorded.reason;
  return 'this target mode’s declared action plan does not offer the action';
}
