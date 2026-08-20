// Warms the browser HTTP cache for a set of image URLs so they're already
// decoded (or in flight) by the time an <img> asks for them. Used by the Coloring
// Book Picker: cover thumbs are warmed on idle so the first open paints instantly,
// a book's SVG page previews are warmed when its tile is pressed, and the selected preview
// stays warm on hover/press so applying it to the canvas is immediate.
//
// Each logical image is keyed by its canonical src and requested once per
// session via a detached Image(); srcset may select a responsive candidate. The
// element is never inserted, so it just primes the cache and is GC'd. No-ops
// during SSR where Image is undefined.

const warmed = new Set<string>();
const activePrefetches = new Map<string, HTMLImageElement>();

export interface ResponsiveImageRequest {
  src: string;
  srcset: string;
  sizes: string;
}

function cancelImageRequest(img: HTMLImageElement): void {
  if (img.srcset) img.removeAttribute('srcset');
  img.removeAttribute('src');
}

export function prefetchImages(requests: Iterable<string | ResponsiveImageRequest>): void {
  if (typeof Image === 'undefined') return;
  for (const request of requests) {
    const url = typeof request === 'string' ? request : request.src;
    if (!url || warmed.has(url)) continue;
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
    img.onload = release;
    img.onerror = release;
    activePrefetches.set(url, img);
    img.src = url;
  }
}

export function cancelImagePrefetchesExcept(preservedUrl: string): void {
  for (const [url, img] of activePrefetches) {
    if (url === preservedUrl) continue;
    cancelImageRequest(img);
    activePrefetches.delete(url);
    warmed.delete(url);
  }
}
