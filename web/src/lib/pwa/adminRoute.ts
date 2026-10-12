// The admin console's service-worker route.
//
// `Cache-Control: no-store` governs HTTP caches only. Cache Storage is a
// separate mechanism: `cache.put()` stores a response whatever its headers say,
// so the generic NetworkFirst navigation route would persist the authenticated
// /admin document — every live access code with it — and could serve it offline
// long after logout. Registering this handler ahead of that route is what keeps
// the document out of Cache Storage.
//
// Workbox serializes a runtime-caching handler with `toString()`, so this
// function must stay self-contained: no imported identifiers inside its body.
// `adminRoute.test.ts` pins that by running the serialized copy.

export async function serveAdminWithoutCaching({
  request,
}: {
  request: Request;
}): Promise<Response> {
  // Sweeping every cache rather than the page cache by name evicts the copies
  // an earlier build already wrote, whose Workbox-prefixed names this handler
  // would otherwise have to reconstruct. /admin is never precached, so nothing
  // else can match the URL being deleted.
  for (const name of await caches.keys()) {
    const cache = await caches.open(name);
    await cache.delete(request, { ignoreSearch: true });
  }
  return fetch(request);
}
