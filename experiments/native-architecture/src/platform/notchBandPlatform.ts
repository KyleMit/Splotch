// No rotation angle reaches the native apps here, so an asymmetric landscape pair leaves the band
// unpainted, as shipping's own rule does without a Screen Orientation answer.
export function orientationAngle() {
  return 0;
}

// The theme-color tag tints only a browser's chrome; the native status bar takes its icon style.
export function setThemeColor(_color: string) {}
