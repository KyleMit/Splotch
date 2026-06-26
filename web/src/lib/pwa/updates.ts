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
import { snapshotCanvasDataURL, restoreCanvasFromDataURL } from '$lib/drawing/engine';

let updateCheckInterval: ReturnType<typeof setInterval> | null = null;

// A drawing stashed across a forced-update reload (see applyUpdate). sessionStorage
// survives a same-tab reload but not a fresh launch, so a stale entry can't linger.
const CANVAS_RESTORE_KEY = 'splotch:pendingCanvasRestore';

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

// Read the deployed version from /version.json (emitted on every build). Returns
// null when offline or unavailable. Web/PWA only — native update checks will
// eventually come from the app stores, not from here.
export async function fetchLatestVersion(): Promise<string | null> {
  try {
    const resp = await fetch('/version.json', { cache: 'no-store' });
    if (!resp.ok) return null;
    const { version } = await resp.json();
    return typeof version === 'string' ? version : null;
  } catch {
    return null;
  }
}

// Force the app to the deployed version on demand (the parent's "Update now").
// Background updates only auto-apply while the canvas is blank; this lets a
// parent update even mid-drawing, preserving the artwork across the reload.
export async function applyUpdate(latestVersion: string | null) {
  if (!canvasState.canvasEmpty) {
    const snapshot = snapshotCanvasDataURL();
    if (snapshot) {
      try {
        sessionStorage.setItem(CANVAS_RESTORE_KEY, snapshot);
      } catch {
        // sessionStorage full/unavailable — update anyway, just don't restore.
      }
    }
  }

  // Prefer activating an already-downloaded waiting worker — a true in-place
  // swap — then fall back to a cache-busting navigation that pulls fresh HTML.
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.update();
      if (registration.waiting) {
        navigator.serviceWorker.addEventListener(
          'controllerchange',
          () => window.location.reload(),
          { once: true }
        );
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        return;
      }
    }
  } catch {
    // fall through to the navigation fallback
  }

  const next = new URL(window.location.href);
  if (latestVersion) next.searchParams.set('v', latestVersion);
  window.location.replace(next.toString());
}

// After a forced-update reload, paint any stashed drawing back onto the canvas.
// Called once from the canvas component on mount; a no-op when nothing's stashed.
export async function restoreCanvasAfterUpdate() {
  let snapshot: string | null = null;
  try {
    snapshot = sessionStorage.getItem(CANVAS_RESTORE_KEY);
    if (snapshot) sessionStorage.removeItem(CANVAS_RESTORE_KEY);
  } catch {
    return;
  }
  if (snapshot) await restoreCanvasFromDataURL(snapshot);
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
