export const COLORING_SCROLL_ACTION_LABEL = 'scroll coloring pages';
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
  'undo',
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
