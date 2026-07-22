// PWA service worker registration + auto-update lifecycle.
//
// Registration is manual and deferred (issue #462): the workbox precache is
// ~39 MB (the full offline coloring-page set), so registering at window.load
// would saturate a slow connection right as boot's idle-deferred work runs and
// the child starts drawing. Instead:
//   • First visit: +page.svelte's stroke-count gate calls
//     registerDeferredServiceWorker() once the child has drawn a few strokes
//     (the Install Banner's "earned it" signal), and the actual register()
//     lands at idle. Save-Data connections skip registration entirely.
//   • Repeat visit: a registration already exists (found via getRegistration
//     on init), so deferral saves nothing — re-register immediately at idle so
//     an install interrupted mid-precache resumes without waiting for strokes.
//     Update checks don't even need the re-register: checkForUpdates reaches
//     the existing registration through getRegistration from init onward.
// Everything below tolerates registration arriving late — checkForUpdates
// no-ops until a registration exists.
//
// Update checks run on init, hourly, on visibility change, and on focus. A
// waiting worker is applied (with a reload) only while the canvas is blank —
// never mid-drawing; otherwise it activates on the next launch.
//
// Cache-bust for stale clients: on every init we fetch /version.json from the
// network and compare it with __APP_VERSION__ (compiled in at build time). If
// they differ the running SW is serving old HTML, so we navigate to
// ?v=<deployed-version>. The SW's NetworkFirst navigation handler sees the
// unfamiliar URL, fetches fresh HTML from the origin, and we're unstuck. A
// ?v= already in the URL means we just tried that version, so we never
// redirect to it again — one attempt per deployed version, no reload loop.

import { canvasState, SETTLED_IN_STROKES } from '$lib/state/canvas.svelte';
import { scheduleIdle } from '$lib/idle';

let initialized = false;
let refreshState: 'idle' | 'activating' | 'deferred' = 'idle';
let registrationScheduled = false;

// The registration gate waits for the shared settled-in signal (the same one
// the Install Banner uses). Pre-hydration strokes (ADR-0071) don't tick
// strokeCount, so only post-hydration strokes count — acceptable, it only
// defers registration slightly further.
export const STROKES_BEFORE_SW_REGISTER = SETTLED_IN_STROKES;

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
  registrationScheduled = false;
}

function serviceWorkerSupported() {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

function saveDataEnabled() {
  const { connection } = navigator as Navigator & { connection?: { saveData?: boolean } };
  return connection?.saveData === true;
}

// The register() call itself still waits for an idle slot: the stroke gate
// fires at stroke end, and kicking off the precache in that same frame could
// contend with the commit fold of the stroke that tripped it.
function scheduleRegistration() {
  if (registrationScheduled) return;
  registrationScheduled = true;
  scheduleIdle(() => {
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => checkForUpdates())
      .catch(() => {
        // offline or the fetch failed — release the latch so a later gate call
        // (the next stroke) retries; otherwise the next visit picks it up
        registrationScheduled = false;
      });
  });
}

// First-visit registration, called from +page.svelte's stroke-count gate.
// Save-Data users never get the ~39 MB precache forced on them — offline
// support waits for a session without the preference set.
export function registerDeferredServiceWorker() {
  if (import.meta.env.DEV) return;
  if (!serviceWorkerSupported()) return;
  if (saveDataEnabled()) return;
  scheduleRegistration();
}

export function initPWAUpdates(): (() => void) | undefined {
  if (import.meta.env.DEV) return;
  if (!serviceWorkerSupported()) return;
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

  // Repeat visit: an existing registration means the precache download already
  // happened (or was interrupted and should resume) — bypass the stroke gate.
  navigator.serviceWorker
    .getRegistration()
    .then((existing) => {
      if (existing) scheduleRegistration();
    })
    .catch(() => {});

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
      let recoveryTimer: ReturnType<typeof setTimeout> | undefined = undefined;
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
