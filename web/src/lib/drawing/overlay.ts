export const COLORING_OVERLAY_ID = 'coloringOverlay';

export function getActiveOverlayImage(): HTMLImageElement | null {
  if (typeof document === 'undefined') return null;
  const el = document.getElementById(COLORING_OVERLAY_ID);
  if (!(el instanceof HTMLImageElement) || el.hidden || !el.naturalWidth) return null;
  return el;
}
