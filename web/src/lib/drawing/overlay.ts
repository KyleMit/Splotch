export const COLORING_OVERLAY_ID = 'coloringOverlay';

export function getActiveOverlayImage(): HTMLImageElement | null {
  if (typeof document === 'undefined') return null;
  const el = document.getElementById(COLORING_OVERLAY_ID) as HTMLImageElement | null;
  if (!el || el.hidden || !el.naturalWidth) return null;
  return el;
}
