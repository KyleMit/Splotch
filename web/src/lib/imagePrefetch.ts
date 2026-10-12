// Warms the browser HTTP cache for a set of image URLs. Callers can either fetch
// bytes opportunistically or also request decode before an imminent paint. Used
// by the Coloring Book Picker for idle cover fetches, book-selector fetch/decode,
// and the selected canonical overlay.
//
// Each logical image is keyed by its canonical src. Responsive requests may let
// srcset select another candidate, but the canonical key still coordinates fetch,
// decode, and cancellation. Detached elements are retained only while their
// transfer or decode is active. No-ops during SSR where Image is undefined.

const warmed = new Set<string>();
const activePrefetches = new Map<string, HTMLImageElement>();
const activeDecodes = new Map<string, HTMLImageElement>();
const decoded = new Set<string>();

export interface ResponsiveImageRequest {
  src: string;
  srcset: string;
  sizes: string;
}

function createImage(request: string | ResponsiveImageRequest, url: string): HTMLImageElement {
  warmed.add(url);
  const img = new Image();
  img.decoding = 'async';
  if (typeof request !== 'string') {
    img.sizes = request.sizes;
    img.srcset = request.srcset;
  }
  const release = () => {
    if (activePrefetches.get(url) === img) activePrefetches.delete(url);
  };
  // Once the bytes arrive, cancellation cannot recover bandwidth; activeDecodes
  // keeps the element alive only until decode settles.
  img.onload = release;
  img.onerror = () => {
    if (activePrefetches.get(url) !== img) return;
    activePrefetches.delete(url);
    warmed.delete(url);
  };
  activePrefetches.set(url, img);
  img.src = url;
  return img;
}

function prefetchImage(request: string | ResponsiveImageRequest): void {
  const url = typeof request === 'string' ? request : request.src;
  if (!url || warmed.has(url)) return;
  createImage(request, url);
}

function predecodeImageRequest(request: string | ResponsiveImageRequest): void {
  const url = typeof request === 'string' ? request : request.src;
  if (!url || decoded.has(url) || activeDecodes.has(url)) return;
  const img = activePrefetches.get(url) ?? createImage(request, url);
  activeDecodes.set(url, img);
  void img
    .decode()
    .then(() => decoded.add(url))
    .catch(() => undefined)
    .finally(() => {
      if (activeDecodes.get(url) === img) activeDecodes.delete(url);
    });
}

export function cancelImageRequest(img: HTMLImageElement): void {
  if (img.srcset) img.removeAttribute('srcset');
  img.removeAttribute('src');
}

export function prefetchImages(requests: Iterable<string | ResponsiveImageRequest>): void {
  if (typeof Image === 'undefined') return;
  for (const request of requests) {
    prefetchImage(request);
  }
}

export function predecodeImages(requests: Iterable<string | ResponsiveImageRequest>): void {
  if (typeof Image === 'undefined') return;
  for (const request of requests) {
    predecodeImageRequest(request);
  }
}

export function predecodeImage(url: string): void {
  predecodeImages([url]);
}

export function cancelImagePrefetchesExcept(preservedUrl: string): void {
  for (const [url, img] of activePrefetches) {
    if (url === preservedUrl) continue;
    cancelImageRequest(img);
    activePrefetches.delete(url);
    if (activeDecodes.get(url) === img) activeDecodes.delete(url);
    warmed.delete(url);
  }
}
