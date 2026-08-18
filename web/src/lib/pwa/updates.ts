// PWA service worker registration + auto-update lifecycle.
//
// Registration is manual and deferred (issue #462): installing the offline app
// shell and starter book at window.load would compete with boot's idle-deferred
// work and the child's first strokes. Instead:
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
// Update checks run on init, hourly, on visibility change, and on focus — but
// a check only *downloads* the new worker. Applying it depends on whether the
// running page already matches the deployed version:
//   • Already current — the cold-launch case: navigations are NetworkFirst, so
//     fresh HTML boots under the old SW while the new one installs. The
//     waiting worker is activated silently; same-version precache means no
//     asset skew, so no reload is needed and none happens.
//   • Stale (or the deployed version is unreachable) — the resumed-PWA case:
//     an old page becomes visible again after a deploy. Activating now would
//     require a reload that yanks whatever the user is doing (the settings
//     menu, mid-tap), so the update holds in 'ready' and the SKIP_WAITING +
//     reload pair fires only when the document goes hidden — the iPad-PWA
//     equivalent of "closed" — and the canvas is blank. The reload happens
//     while nobody is looking; the next resume is already the new version. A
//     visible session is never reloaded out from under the user.
//
// Cache-bust for stale clients: on every init we fetch /version.json from the
// network and compare it with __APP_VERSION__ (compiled in at build time). If
// they differ the running SW is serving old HTML, so we navigate to
// ?v=<deployed-version>. The SW's NetworkFirst navigation handler sees the
// unfamiliar URL, fetches fresh HTML from the origin, and we're unstuck. A
// ?v= already in the URL means we just tried that version, so we never
// redirect to it again — one attempt per deployed version, no reload loop.
// That navigation obeys the same blank-canvas rule as the update reload: the
// fetch can take seconds on a slow connection and the child can draw from the
// first frame (ADR-0072), so a stale session that has ink on it keeps running
// until the next blank-canvas boot.

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

// 'silent': the running page already matches the deployed version, so the
// waiting worker takes control with no reload — nothing visible happens.
// 'reload': the page is stale; controllerchange hands control to a worker
// whose precache no longer matches the running assets, so a reload must
// immediately follow activation (they stay atomic — activating without
// reloading would let lazy-loaded chunks 404 under the new worker).
type ActivationMode = 'silent' | 'reload';

function serviceWorkerSupported() {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

function saveDataEnabled() {
  return navigator.connection?.saveData === true;
}

export function createPWAUpdates() {
  let initialized = false;
  // none → ready when a waiting worker is found and the page is stale (or the
  //   deployed version is unknown); the apply waits for the hidden edge.
  // ready → activating when applyPendingUpdate posts SKIP_WAITING, or
  //   → activating via silent activation when the page turns out current.
  // activating → none on silent success/failure, or before reload when
  //   controllerchange finds an empty canvas; → ready on reload-mode
  //   failure/timeout so the next hidden moment retries.
  // activating → owed when controllerchange arrives after ink appears.
  // owed → none and reload at the next hidden moment with a blank canvas.
  let updateReload: 'none' | 'ready' | 'activating' | 'owed' = 'none';
  // Held so applyPendingUpdate can reach registration.waiting synchronously
  // inside the visibilitychange handler.
  let updateRegistration: ServiceWorkerRegistration | null = null;
  let registrationScheduled = false;
  const observedInstallingWorkers = new WeakSet<ServiceWorker>();

  function reloadForUpdate(): void {
    updateReload = 'none';
    window.location.reload();
  }

  function deferReload(): void {
    updateReload = 'owed';
  }

  // The register() call itself still waits for an idle slot: the stroke gate
  // fires at stroke end, and kicking off the precache in that same frame could
  // contend with the commit fold of the stroke that tripped it.
  function scheduleRegistration() {
    // Save-Data users never get the offline install forced on them — offline
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
      if (document.visibilityState === 'visible') {
        void checkForUpdates();
        return;
      }
      applyPendingUpdate();
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

  async function fetchDeployedVersion(): Promise<string | null> {
    try {
      const resp = await fetch(VERSION_JSON_PATH, { cache: 'no-store' });
      if (!resp.ok) return null;
      const { version } = (await resp.json()) as { version?: unknown };
      return typeof version === 'string' && version.length > 0 ? version : null;
    } catch {
      // offline or version.json unavailable
      return null;
    }
  }

  async function checkVersionMismatch(attemptedVersion: string | null = null) {
    const version = await fetchDeployedVersion();
    if (version === null) return;
    if (version !== __APP_VERSION__ && version !== attemptedVersion) {
      if (!canvasState.canvasEmpty) return;
      const next = new URL(window.location.href);
      next.searchParams.set('v', version);
      window.location.replace(next.toString());
    }
  }

  // A waiting worker whose build matches the running page can take control
  // without a reload: this is every online cold launch (NetworkFirst serves
  // the new HTML before the new worker finishes installing), which used to
  // reload a page that was already current. Only a genuinely stale page — a
  // resumed session that predates the deploy — defers to the hidden edge.
  async function decideWaitingActivation(sw: ServiceWorker): Promise<void> {
    if (updateReload !== 'none') return;
    updateReload = 'ready';
    const deployedVersion = await fetchDeployedVersion();
    if (updateReload !== 'ready') return;
    if (deployedVersion === __APP_VERSION__) activateWaitingSW(sw, 'silent');
  }

  // Drains a pending update while nothing is on screen to disrupt — the
  // visibilitychange→hidden handler is the production caller, so the reload
  // half of 'reload' mode happens while the app is backgrounded and the next
  // resume boots the new version with no visible refresh.
  function applyPendingUpdate(): void {
    if (!canvasState.canvasEmpty) return;
    if (updateReload === 'owed') {
      reloadForUpdate();
      return;
    }
    if (updateReload !== 'ready') return;
    const waiting = updateRegistration?.waiting;
    if (!waiting) {
      // The waiting worker activated on its own (all clients closed) or was
      // discarded — nothing left to apply.
      updateReload = 'none';
      return;
    }
    try {
      activateWaitingSW(waiting, 'reload');
    } catch {
      // postMessage failed — activateWaitingSW restored 'ready', so the next
      // hidden moment retries.
    }
  }

  function activateWaitingSW(sw: ServiceWorker, mode: ActivationMode): void {
    const priorState = updateReload;
    let recoveryTimer: ReturnType<typeof setTimeout> | undefined = undefined;
    const onControllerChange = () => {
      clearTimeout(recoveryTimer);
      if (mode === 'silent') {
        updateReload = 'none';
        return;
      }
      if (!canvasState.canvasEmpty) {
        deferReload();
        return;
      }
      reloadForUpdate();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange, {
      once: true,
    });
    updateReload = 'activating';
    try {
      sw.postMessage({ type: 'SKIP_WAITING' });
    } catch (error) {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      updateReload = priorState;
      throw error;
    }
    // A dropped SKIP_WAITING — or an activation that never emits controllerchange —
    // must not pin the lifecycle in 'activating' for the rest of the session: that
    // short-circuits every later checkForUpdates (line: `if (updateReload ===
    // 'activating') return`), silently blocking all future updates. Release after
    // a grace period — silent mode back to none so a later check re-decides,
    // reload mode back to ready so the next hidden moment retries the apply;
    // controllerchange clears this the moment it fires.
    recoveryTimer = setTimeout(() => {
      if (updateReload !== 'activating') return;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      updateReload = mode === 'silent' ? 'none' : 'ready';
    }, ACTIVATION_RECOVERY_MS);
  }

  async function checkForUpdates() {
    try {
      if (updateReload === 'owed' || updateReload === 'activating') return;

      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) return;
      updateRegistration = registration;

      await registration.update();

      if (registration.waiting) {
        await decideWaitingActivation(registration.waiting);
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
                if (registration.waiting) void decideWaitingActivation(registration.waiting);
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
    applyPendingUpdate,
  };
}

export const pwaUpdates = createPWAUpdates();
