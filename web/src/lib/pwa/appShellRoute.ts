// The drawing app's service-worker navigation route.
//
// Hashed chunks are guaranteed present only in the precache of the worker whose
// build emitted them, so HTML boots offline only when it comes from that same
// build. A runtime page cache cannot promise that: NetworkFirst stores whichever
// build the network served, and a deploy between launches pairs that page with
// the other build's precache — a page that renders but never runs. The
// prerendered shell is precached instead, under a URL unique to the build, so
// the offline and stalled-network answer is always the active worker's own build.
//
// Workbox copies the matcher and each plugin callback into the generated worker
// with `toString()`, so their bodies must stay self-contained.
// `appShellRoute.test.ts` pins that by running the serialized copies.

export function isAppShellNavigation({
  request,
  url,
}: {
  request: Pick<Request, 'mode'>;
  url: URL;
}): boolean {
  return request.mode === 'navigate' && url.pathname === '/';
}

export function appShellPrecacheUrl(buildId: string): string {
  return `/?${new URLSearchParams({ 'app-shell-build': buildId })}`;
}

export function createAppShellFallbackPlugin(shellUrl: string) {
  return {
    // The fallback never reads a runtime copy of this route, so none is written.
    cacheWillUpdate: async function () {
      return null;
    },
    cachedResponseWillBeUsed: shellMatcherFor(shellUrl),
  };
}

// Workbox rejects plugin properties that are not callbacks, so the build's shell
// URL cannot ride along as data; it reaches the worker as a literal compiled into
// the callback's own source.
function shellMatcherFor(shellUrl: string): () => Promise<Response | null> {
  return new Function(
    `return async function () { return (await caches.match(${JSON.stringify(shellUrl)})) ?? null; };`
  )();
}
