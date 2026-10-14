// The shipping layout module's screen.orientation.angle, which says which side a landscape cutout
// is on when the insets cannot.
export function orientationAngle() {
  return typeof screen === 'undefined' ? 0 : (screen.orientation?.angle ?? 0);
}

// The tag the export's head copies from shipping's app.html; it is the only thing that tints the
// Android web status bar. Restated rather than imported from shipping's theme.ts, which would bring
// that module onto the startup path; native-notch-band.test.mjs holds the two equal.
export const THEME_COLOR_META_SELECTOR = 'meta[name="theme-color"]';

export function setThemeColor(color: string) {
  const meta = document.querySelector(THEME_COLOR_META_SELECTOR);
  if (meta && meta.getAttribute('content') !== color) meta.setAttribute('content', color);
}
