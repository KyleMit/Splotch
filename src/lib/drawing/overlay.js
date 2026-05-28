export function getActiveOverlayImage() {
  if (typeof document === 'undefined') return null;
  const el = document.getElementById('coloringOverlay');
  if (!el || el.hidden || !el.naturalWidth) return null;
  return el;
}
