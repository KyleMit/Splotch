// Preserve crisp paper texture and line art on 1× screens without coupling
// saved-image quality to the lower live-canvas scale.
const MIN_EXPORT_SCALE = 2;

export function currentExportScale(): number {
  return Math.max(window.devicePixelRatio || 1, MIN_EXPORT_SCALE);
}
