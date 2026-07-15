// PWA auto-update lifecycle: checks for an updated service worker on load,
// hourly, on visibility change, and on focus. A waiting worker is applied
// (with a reload) only while the canvas is blank — never mid-drawing;
// otherwise it activates on the next launch.
//
// Cache-bust for stale clients: on every init we fetch /version.json from the
// network and compare it with __APP_VERSION__ (compiled in at build time). If
// they differ the running SW is serving old HTML, so we navigate to
// ?v=<deployed-version>. The SW's NetworkFirst navigation handler sees the
// unfamiliar URL, fetches fresh HTML from the origin, and we're unstuck. A
// ?v= already in the URL means we just tried that version, so we never
// redirect to it again — one attempt per deployed version, no reload loop.

import { canvasState } from '$lib/state/canvas.svelte';

let initialized = false;
let refreshState: 'idle' | 'activating' | 'deferred' = 'idle';

// Grace period after posting SKIP_WAITING before we give up waiting for the new
// worker to take control. If controllerchange never arrives, the lifecycle must
// not stay pinned in 'activating' — see activateWaitingSW.
export const ACTIVATION_RECOVERY_MS = 10_000;

// Reset the module's lifecycle singletons. Exported for unit tests, which share a
// single module instance across cases; without it a leftover refreshState (or
// initialized) leaks state between tests and couples them to execution order.
export function resetUpdatesForTests() {
  refreshState = 'idle';
  initialized = false;
}

export function initPWAUpdates(): (() => void) | undefined {
  if (import.meta.env.DEV) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (initialized) return;
  initialized = true;

  const url = new URL(window.location.href);
  const attemptedVersion = url.searchParams.get('v');
  if (attemptedVersion !== null) {
    url.searchParams.delete('v');
    history.replaceState(null, '', url.toString());
  }

  checkForUpdates();
  checkVersionMismatch(attemptedVersion);

  const updateCheckInterval = setInterval(
    () => {
      checkForUpdates();
    },
    60 * 60 * 1000
  );

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') checkForUpdates();
  };
  const onFocus = () => {
    checkForUpdates();
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('focus', onFocus);

  return () => {
    clearInterval(updateCheckInterval);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('focus', onFocus);
    initialized = false;
  };
}

export async function checkVersionMismatch(attemptedVersion: string | null = null) {
  try {
    const resp = await fetch('/version.json', { cache: 'no-store' });
    if (!resp.ok) return;
    const { version } = await resp.json();
    if (version !== __APP_VERSION__ && version !== attemptedVersion) {
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
    if (refreshState === 'deferred') {
      if (canvasState.canvasEmpty) {
        refreshState = 'idle';
        window.location.reload();
      }
      return;
    }
    if (refreshState === 'activating') return;

    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return;

    await registration.update();

    const activateWaitingSW = (sw: ServiceWorker) => {
      if (refreshState !== 'idle' || !canvasState.canvasEmpty) return;
      let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
      const onControllerChange = () => {
        clearTimeout(recoveryTimer);
        if (!canvasState.canvasEmpty) {
          refreshState = 'deferred';
          return;
        }
        refreshState = 'idle';
        window.location.reload();
      };
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange, {
        once: true,
      });
      refreshState = 'activating';
      try {
        sw.postMessage({ type: 'SKIP_WAITING' });
      } catch (error) {
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
        refreshState = 'idle';
        throw error;
      }
      // A dropped SKIP_WAITING — or an activation that never emits controllerchange —
      // must not pin the lifecycle in 'activating' for the rest of the session: that
      // short-circuits every later checkForUpdates (line: `if (refreshState ===
      // 'activating') return`) and the deferred-reload path, silently blocking all
      // future updates. Release back to idle after a grace period so a later check
      // re-attempts; controllerchange clears this the moment it fires.
      recoveryTimer = setTimeout(() => {
        if (refreshState !== 'activating') return;
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
        refreshState = 'idle';
      }, ACTIVATION_RECOVERY_MS);
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
  } catch {
    // registration lookup or update failed (e.g. offline) — try again later
  }
}
