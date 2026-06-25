// PWA auto-update lifecycle: checks for an updated service worker on load,
// hourly, on visibility change, and on focus. A waiting worker is applied
// (with a reload) only while the canvas is blank — never mid-drawing;
// otherwise it activates on the next launch.
//
// Cache-bust for stale clients: on every init we fetch /version.json from the
// network and compare it with __APP_VERSION__ (compiled in at build time). If
// they differ the running SW is serving old HTML, so we navigate to
// ?v=<deployed-version>. The SW's NetworkFirst navigation handler sees the
// unfamiliar URL, fetches fresh HTML from the origin, and we're unstuck.

import { canvasState } from '$lib/state/canvas.svelte';

let updateCheckInterval: ReturnType<typeof setInterval> | null = null;

export function initPWAUpdates() {
  if (import.meta.env.DEV) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  // Remove any cache-bust param left in the URL from a previous redirect.
  const url = new URL(window.location.href);
  if (url.searchParams.has('v')) {
    url.searchParams.delete('v');
    history.replaceState(null, '', url.toString());
  }

  navigator.serviceWorker.ready.then((registration) => {
    registration.addEventListener('updatefound', () => {
      console.log('Update found, installing...');
    });
  });

  checkForUpdates();
  checkVersionMismatch();

  updateCheckInterval = setInterval(
    () => {
      checkForUpdates();
    },
    60 * 60 * 1000
  );

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdates();
  });

  window.addEventListener('focus', () => {
    checkForUpdates();
  });

  window.addEventListener('beforeunload', () => {
    if (updateCheckInterval) clearInterval(updateCheckInterval);
  });
}

export async function checkVersionMismatch() {
  try {
    const resp = await fetch('/version.json', { cache: 'no-store' });
    if (!resp.ok) return;
    const { version } = await resp.json();
    if (version !== __APP_VERSION__) {
      const next = new URL(window.location.href);
      next.searchParams.set('v', version);
      window.location.replace(next.toString());
    }
  } catch {
    // offline or version.json unavailable — skip
  }
}

export async function checkForUpdates() {
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return;

    await registration.update();

    const activateWaitingSW = (sw: ServiceWorker) => {
      if (!canvasState.canvasEmpty) return;
      sw.postMessage({ type: 'SKIP_WAITING' });
      navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), {
        once: true,
      });
    };

    if (registration.waiting) {
      activateWaitingSW(registration.waiting);
      return;
    }

    if (registration.installing) {
      registration.installing.addEventListener('statechange', function (this: ServiceWorker) {
        if (this.state === 'installed' && registration.waiting) {
          setTimeout(() => {
            if (registration.waiting) activateWaitingSW(registration.waiting);
          }, 100);
        }
      });
    }
  } catch (error) {
    console.log('Update check failed:', error instanceof Error ? error.message : error);
  }
}
