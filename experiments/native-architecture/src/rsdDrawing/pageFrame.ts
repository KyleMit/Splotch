export const PAGE_FRAMED_MAX_WIDTH_PX = 920;
// Marks content a script reveals, such as the short frame's collapsed lede, so a prerendered page
// document shows it when no script runs (tools/migration/prerender-native-web-pages.mjs), and
// hides the control that would have revealed it.
export const SHOWN_WITHOUT_SCRIPT_ATTRIBUTE = 'data-shown-without-script';
// Marks a control that does nothing without a script, such as the feedback form, so a prerendered
// page document hides it when no script runs and shows the <noscript> note beside it instead.
export const HIDDEN_WITHOUT_SCRIPT_ATTRIBUTE = 'data-hidden-without-script';
