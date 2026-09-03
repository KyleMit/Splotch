export const COLORING_SCROLL_ACTION_LABEL = 'scroll coloring pages';
const COMPACT_SETTINGS_ACTION_SUFFIX = ' in the compact shell';

export function compactSettingsActionLabel(label) {
  return `${label}${COMPACT_SETTINGS_ACTION_SUFFIX}`;
}

export function actionNotApplicableReason(label, context) {
  if (label.endsWith(COMPACT_SETTINGS_ACTION_SUFFIX) && context?.settingsShell !== 'compact') {
    return 'the compact Settings shell is not used in this target mode';
  }
  if (label === COLORING_SCROLL_ACTION_LABEL && context?.orientation === 'PORTRAIT') {
    return 'the coloring-page grid does not scroll in portrait';
  }
  return 'this target mode’s declared action plan does not offer the action';
}
