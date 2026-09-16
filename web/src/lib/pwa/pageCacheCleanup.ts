// Page-cache cleanup the service worker runs on activation.
//
// Navigations to the drawing app were once cached in the runtime page cache
// under their exact URLs. The app-shell route (appShellRoute.ts) now answers
// them and never reads or writes that cache, so those entries, and the one per
// update each stale-page recovery reload wrote, would stay on the device forever.
//
// Workbox's generated worker has no activate hook of its own, so the listener
// ships as a separate script the worker loads with `importScripts`. The script
// is assembled from `toString()` copies, so every function body here must stay
// self-contained. `pageCacheCleanup.test.ts` pins that by running the script.

import { isAppShellNavigation } from './appShellRoute';

// The runtime cache the generic navigation route in vite.config.ts writes.
export const PAGES_CACHE_NAME = 'pages';
export const PAGE_CACHE_CLEANUP_SCRIPT_FILENAME = 'sw-page-cache-cleanup.js';

async function deleteOrphanedPageEntries(
  cacheName: string,
  cacheBustParam: string,
  isShellNavigation: typeof isAppShellNavigation
): Promise<void> {
  // Opening a cache creates it, and a device that never cached a page has none.
  if (!(await caches.has(cacheName))) return;
  const cache = await caches.open(cacheName);
  for (const request of await cache.keys()) {
    const url = new URL(request.url);
    const orphaned =
      isShellNavigation({ request: { mode: 'navigate' }, url }) ||
      url.searchParams.has(cacheBustParam);
    if (orphaned) await cache.delete(request);
  }
}

export function pageCacheCleanupScript(cacheBustParam: string): string {
  const args = [
    JSON.stringify(PAGES_CACHE_NAME),
    JSON.stringify(cacheBustParam),
    `(${isAppShellNavigation.toString()})`,
  ].join(', ');
  return `self.addEventListener('activate', (event) => {
  event.waitUntil((${deleteOrphanedPageEntries.toString()})(${args}));
});
`;
}
