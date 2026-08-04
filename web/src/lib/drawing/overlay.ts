export const COLORING_OVERLAY_ID = 'coloringOverlay';

export interface ExportOverlaySource {
  canonicalUrl: string;
  decodedCanonicalImage: HTMLImageElement | null;
}

export function getActiveOverlayExportSource(): ExportOverlaySource | null {
  if (typeof document === 'undefined') return null;
  const el = document.getElementById(COLORING_OVERLAY_ID);
  if (!(el instanceof HTMLImageElement) || el.hidden || !el.naturalWidth) return null;
  const canonicalUrl = el.src;
  if (!canonicalUrl) return null;
  return {
    canonicalUrl,
    decodedCanonicalImage: el.currentSrc === canonicalUrl ? el : null,
  };
}
