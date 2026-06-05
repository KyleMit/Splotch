export function getActiveOverlayImage(): HTMLImageElement | null {
  if (typeof document === 'undefined') return null;
  const el = document.getElementById('coloringOverlay') as HTMLImageElement | null;
  if (!el || el.hidden || !el.naturalWidth) return null;
  return el;
}
