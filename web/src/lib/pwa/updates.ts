// PWA service worker registration + auto-update lifecycle.
//
// Registration is manual and deferred (issue #462): the workbox precache is
// ~35 MB (the full offline coloring-page set), so registering at window.load
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
// That navigation obeys the same blank-canvas rule as the waiting-worker
// reload: the fetch can take seconds on a slow connection and the child can
// draw from the first frame (ADR-0072), so a stale session that has ink on it
// keeps running until the next blank-canvas boot.

import { canvasState } from '$lib/state/canvas.svelte';
import { scheduleIdle } from '$lib/idle';
import { VERSION_JSON_PATH } from '$lib/pwa/versionEndpoint';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

// Grace period after posting SKIP_WAITING before we give up waiting for the new
// worker to take control. If controllerchange never arrives, the lifecycle must
// not stay pinned in 'activating' — see activateWaitingSW.
export const ACTIVATION_RECOVERY_MS = 10_000;

// Allow registration.waiting to settle after the installing worker reaches installed.
export const WAITING_SETTLE_MS = 100;

function serviceWorkerSupported() {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

function saveDataEnabled() {
  return navigator.connection?.saveData === true;
}

export function createPWAUpdates() {
  let initialized = false;
  // none → activating after activateWaitingSW posts SKIP_WAITING.
  // activating → none on failure/timeout, or before reload when
  // controllerchange finds an empty canvas.
  // activating → owed when controllerchange arrives after ink appears.
  // owed → none and reload when a later update check finds the canvas empty.
  let updateReload: 'none' | 'activating' | 'owed' = 'none';
  let registrationScheduled = false;
  const observedInstallingWorkers = new WeakSet<ServiceWorker>();

  // The register() call itself still waits for an idle slot: the stroke gate
  // fires at stroke end, and kicking off the precache in that same frame could
  // contend with the commit fold of the stroke that tripped it.
  function scheduleRegistration() {
    // Save-Data users never get the ~35 MB precache forced on them — offline
    // support waits for a session without the preference set.
    if (saveDataEnabled()) return;
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
  function registerDeferredServiceWorker() {
    if (import.meta.env.DEV) return;
    if (!serviceWorkerSupported()) return;
    scheduleRegistration();
  }

  function initPWAUpdates(): (() => void) | undefined {
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

    void checkForUpdates();
    void checkVersionMismatch(attemptedVersion);

    // Repeat visit: an existing registration means the precache download already
    // happened (or was interrupted and should resume) — bypass the stroke gate.
    navigator.serviceWorker
      .getRegistration()
      .then((existing) => {
        if (existing) scheduleRegistration();
      })
      .catch(() => {});

    const updateCheckInterval = setInterval(() => {
      void checkForUpdates();
    }, UPDATE_CHECK_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void checkForUpdates();
    };
    const onFocus = () => {
      void checkForUpdates();
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

  async function checkVersionMismatch(attemptedVersion: string | null = null) {
    try {
      const resp = await fetch(VERSION_JSON_PATH, { cache: 'no-store' });
      if (!resp.ok) return;
      const { version } = (await resp.json()) as { version?: unknown };
      if (typeof version !== 'string' || version.length === 0) return;
      if (version !== __APP_VERSION__ && version !== attemptedVersion) {
        if (!canvasState.canvasEmpty) return;
        const next = new URL(window.location.href);
        next.searchParams.set('v', version);
        window.location.replace(next.toString());
      }
    } catch {
      // offline or version.json unavailable — skip
    }
  }

  function activateWaitingSW(sw: ServiceWorker): void {
    if (updateReload !== 'none' || !canvasState.canvasEmpty) return;
    let recoveryTimer: ReturnType<typeof setTimeout> | undefined = undefined;
    const onControllerChange = () => {
      clearTimeout(recoveryTimer);
      if (!canvasState.canvasEmpty) {
        updateReload = 'owed';
        return;
      }
      updateReload = 'none';
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange, {
      once: true,
    });
    updateReload = 'activating';
    try {
      sw.postMessage({ type: 'SKIP_WAITING' });
    } catch (error) {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      updateReload = 'none';
      throw error;
    }
    // A dropped SKIP_WAITING — or an activation that never emits controllerchange —
    // must not pin the lifecycle in 'activating' for the rest of the session: that
    // short-circuits every later checkForUpdates (line: `if (updateReload ===
    // 'activating') return`) and the owed-reload path, silently blocking all
    // future updates. Release back to none after a grace period so a later check
    // re-attempts; controllerchange clears this the moment it fires.
    recoveryTimer = setTimeout(() => {
      if (updateReload !== 'activating') return;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      updateReload = 'none';
    }, ACTIVATION_RECOVERY_MS);
  }

  async function checkForUpdates() {
    try {
      if (updateReload === 'owed') {
        if (canvasState.canvasEmpty) {
          updateReload = 'none';
          window.location.reload();
        }
        return;
      }
      if (updateReload === 'activating') return;

      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) return;

      await registration.update();

      if (registration.waiting) {
        activateWaitingSW(registration.waiting);
        return;
      }

      const installing = registration.installing;
      if (installing && !observedInstallingWorkers.has(installing)) {
        observedInstallingWorkers.add(installing);
        installing.addEventListener(
          'statechange',
          () => {
            if (installing.state === 'installed' && registration.waiting) {
              setTimeout(() => {
                if (registration.waiting) activateWaitingSW(registration.waiting);
              }, WAITING_SETTLE_MS);
            }
          },
          { once: true }
        );
      }
    } catch {
      // registration lookup or update failed (e.g. offline) — try again later
    }
  }

  return {
    initPWAUpdates,
    registerDeferredServiceWorker,
    checkForUpdates,
    checkVersionMismatch,
  };
}

export const pwaUpdates = createPWAUpdates();
