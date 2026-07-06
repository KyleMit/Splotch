// Warms the browser HTTP cache for a set of image URLs so they're already
// decoded (or in flight) by the time an <img> asks for them. Used by the Coloring
// Book Picker: cover thumbs are warmed on idle so the first open paints instantly,
// a book's page thumbs are warmed when its tile is pressed, and a page's full-res
// overlay is warmed on hover/press so applying it to the canvas is immediate.
//
// Each URL is fetched once per session (deduped) via a detached Image(); the
// element is never inserted, so it just primes the cache and is GC'd. No-ops
// during SSR where Image is undefined.

const warmed = new Set<string>();

export function prefetchImages(urls: Iterable<string>): void {
  if (typeof Image === 'undefined') return;
  for (const url of urls) {
    if (!url || warmed.has(url)) continue;
    warmed.add(url);
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
  }
}
