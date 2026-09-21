// The app registers its worker a few strokes into a first visit, and the install
// then precaches the whole build inside the measured window. A function body that
// answers 'blocked' or 'unsupported' (an insecure origin has no serviceWorker).
export const SERVICE_WORKER_REGISTRATION_GUARD_SOURCE = `
    if (!('serviceWorker' in navigator)) return 'unsupported';
    Object.defineProperty(navigator.serviceWorker, 'register', {
      configurable: true,
      value: () => Promise.resolve(undefined)
    });
    return 'blocked';
  `;

// The guard stops a NEW registration, not one an earlier run left on the same
// persistent origin, which can still be precaching or serving from its cache. An
// async function body for a page with no driver to clear it first: it evicts
// every registration and cache and reloads once ('evicting'), answers 'clean'
// when there is nothing to evict, and 'stale-worker' when a worker survived the
// eviction reload — which a capture must refuse rather than measure.
export const STALE_SERVICE_WORKER_EVICTION_SOURCE = `
    if (!('serviceWorker' in navigator)) return 'clean';
    const EVICTED_KEY = 'splotch-perf-service-worker-evicted';
    const found = await navigator.serviceWorker.getRegistrations();
    if (found.length === 0 && !navigator.serviceWorker.controller) {
      sessionStorage.removeItem(EVICTED_KEY);
      return 'clean';
    }
    if (sessionStorage.getItem(EVICTED_KEY)) return 'stale-worker';
    sessionStorage.setItem(EVICTED_KEY, '1');
    await Promise.all(found.map((registration) => registration.unregister()));
    const keys = 'caches' in window ? await caches.keys() : [];
    await Promise.all(keys.map((key) => caches.delete(key)));
    location.reload();
    return 'evicting';
  `;

export function staleServiceWorkerProblem(ready) {
  return ready?.serviceWorkerRegistration === 'stale-worker'
    ? 'a service worker from an earlier run still holds this origin after an eviction reload — ' +
        "clear the site's data in Chrome on the device, then retry"
    : null;
}
