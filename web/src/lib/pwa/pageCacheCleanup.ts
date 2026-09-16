// The service worker's runtime page cache, and the cleanup its activation runs.
//
// Navigations to the drawing app were once cached in the page cache under their
// exact URLs, one more for each update a stale-page recovery reload carried. The
// app-shell route (appShellRoute.ts) now answers them and never reads that cache,
// so those entries would stay on the device forever. Workbox's expiration
// plugin cannot cap them either: it tracks only the entries it wrote itself.
// The navigation route therefore writes a cache of a new name, and activation
// deletes the old cache whole. Nothing reads the old cache any more, and every
// entry in the new one is counted against its cap.
//
// Workbox's generated worker has no activate hook of its own, so the listener
// ships as a separate script the worker loads with `importScripts`.

export const PAGES_CACHE_NAME = 'pages-v2';
export const LEGACY_PAGES_CACHE_NAME = 'pages';
export const PAGE_CACHE_CLEANUP_SCRIPT_PREFIX = 'sw-page-cache-cleanup-';

export function pageCacheCleanupScript(): string {
  return `self.addEventListener('activate', (event) => {
  event.waitUntil(caches.delete(${JSON.stringify(LEGACY_PAGES_CACHE_NAME)}));
});
`;
}

// The host serves root-level scripts as immutable, so the name carries the
// script's content hash: a stable name would let a later worker import an
// earlier build's bytes from the HTTP cache.
export function pageCacheCleanupScriptFilename(contentHash: string): string {
  return `${PAGE_CACHE_CLEANUP_SCRIPT_PREFIX}${contentHash}.js`;
}
