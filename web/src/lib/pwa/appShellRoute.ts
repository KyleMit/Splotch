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

interface PrecacheEntry {
  url: string;
  revision: string | null;
  size: number;
}

// Workbox installs precache entries one at a time in manifest order, and
// revisioned entries bypass the HTTP cache. With the shell fetched first, every
// chunk fetched after it must come from the same deploy: a deploy landing
// mid-install stops serving the old chunks, their fetch fails, and the install
// is abandoned instead of pairing the new shell with old chunks. The shell's own
// bytes are counted by tools/check-pwa-precache.mjs, not by this entry's size.
export function prependAppShellEntry(shellUrl: string) {
  return (manifest: PrecacheEntry[]) => ({
    manifest: [{ url: shellUrl, revision: null, size: 0 }, ...manifest],
  });
}

export function createAppShellFallbackPlugin(shellUrl: string, cacheBustParam: string) {
  return {
    // The fallback never reads a runtime copy of this route, so none is written.
    cacheWillUpdate: async function () {
      return null;
    },
    cachedResponseWillBeUsed: shellMatcherForTimeout(shellUrl, cacheBustParam),
    handlerDidError: shellMatcherForFailure(shellUrl),
  };
}

// Workbox rejects plugin properties that are not callbacks, so the build's shell
// URL cannot ride along as data; it reaches the worker as a literal compiled into
// each callback's own source.
function shellMatcherForFailure(shellUrl: string): () => Promise<Response | undefined> {
  return new Function(
    `return async function () { return caches.match(${JSON.stringify(shellUrl)}); };`
  )();
}

// A stale page's recovery navigation exists to reach the deployed build, and
// answering its timeout with this worker's shell would boot the stale build
// again with the one recovery attempt spent. It waits for the network instead,
// and falls back to the shell only when the network fails.
function shellMatcherForTimeout(
  shellUrl: string,
  cacheBustParam: string
): (options: { request: Request }) => Promise<Response | null> {
  return new Function(
    `return async function ({ request }) {
      if (new URL(request.url).searchParams.has(${JSON.stringify(cacheBustParam)})) return null;
      return (await caches.match(${JSON.stringify(shellUrl)})) ?? null;
    };`
  )();
}
