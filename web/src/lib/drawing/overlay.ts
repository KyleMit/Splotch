export const COLORING_OVERLAY_ID = 'coloringOverlay';

export interface ExportOverlaySource {
  canonicalUrl: string;
  decodedCanonicalImage: HTMLImageElement | null;
}

// Detached canonical decode images keep their source for the lifetime of an export.
// Only the latest decode is memoized; prepared exports retain their own references.
let decodedCanonicalOverlay: { canonicalUrl: string; image: HTMLImageElement } | null = null;

export function rememberDecodedCanonicalOverlay(image: HTMLImageElement): void {
  if (!image.naturalWidth) return;
  decodedCanonicalOverlay = { canonicalUrl: image.src, image };
}

export function captureCanonicalOverlaySource(canonicalUrl: string): ExportOverlaySource {
  const absoluteUrl =
    typeof document === 'undefined' ? canonicalUrl : new URL(canonicalUrl, document.baseURI).href;
  return {
    canonicalUrl: absoluteUrl,
    decodedCanonicalImage:
      decodedCanonicalOverlay?.canonicalUrl === absoluteUrl ? decodedCanonicalOverlay.image : null,
  };
}

export function getActiveOverlayExportSource(): ExportOverlaySource | null {
  if (typeof document === 'undefined') return null;
  const el = document.getElementById(COLORING_OVERLAY_ID);
  if (!(el instanceof HTMLImageElement) || el.hidden || !el.naturalWidth) return null;
  const canonicalPath = el.dataset.canonicalUrl;
  const canonicalUrl = canonicalPath ? new URL(canonicalPath, document.baseURI).href : '';
  if (!canonicalUrl) return null;
  return {
    canonicalUrl,
    decodedCanonicalImage: el.currentSrc === canonicalUrl ? el : null,
  };
}
