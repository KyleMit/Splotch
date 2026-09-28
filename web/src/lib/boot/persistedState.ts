import { hydrateApiKey } from '$lib/state/aiKey';
import { hydrateAiAccessToken } from '$lib/state/aiAccessToken';
import { hydrateSaveFolder } from '$lib/state/saveFolder.svelte';
import { recordSession } from '$lib/state/sessionCounters.svelte';
import { settingsState } from '$lib/state/settings.svelte';
import { fullscreenState } from '$lib/state/fullscreen.svelte';
import { hydrateDurableStorage } from '$lib/storage';
import { applyDeviceOrientationPreference } from '$lib/platform/orientation';
import { persistedStateStatus, type PersistedStateStatus } from './persistedStateStatus.svelte';

// Runs again on every call, so a remount of `/` repeats the native durable pass.
// A per-document memo would pin a failed pass: storage.ts resolves a
// Preferences failure instead of rejecting it. The repeat is also the
// in-document retry that backs up a value whose mirror never reached
// Preferences, finishes a durable removal that failed, and reloads a folderSave
// chunk that failed to load.
async function hydrateSettingsStores(): Promise<void> {
  // Load the optional saved-photo folder name for display in Settings
  // (web/desktop only; no effect on whether saves happen). Fire-and-forget:
  // nothing downstream needs the folder name before it arrives.
  void hydrateSaveFolder();

  // Native only: recover any settings the WebView's localStorage may have
  // evicted from the durable Capacitor Preferences store. Each persisted store
  // registers its own reloader via onDurableRestore (issue #521), so hydrate
  // refreshes them all — no reload list to keep in sync here. No-op (and
  // instant) on the web.
  const restored = await hydrateDurableStorage();
  recordSession('settingsActivity');
  // A restored orientation choice normally reaches the device through the
  // drawing route's orientation $effect, which re-runs inside the restore, so
  // the latch in platform/orientation.ts turns this call away. It still
  // requests a lock where that $effect does not: a lock that failed earlier
  // (failure releases the latch, and an unchanged choice does not re-run the
  // $effect), and a route that mounts no such $effect (Parent Center on
  // /privacy). persistedState.orientation.svelte.test.ts pins each case.
  if (restored) {
    void applyDeviceOrientationPreference(
      settingsState.orientationChoice(),
      fullscreenState.active
    );
  }
}

// Not memoized: each credential's own write coordinator already serializes
// hydration onto its queue and stamps it with a write version, so a boot run and
// a later Settings open cannot interleave destructively. A module-level promise
// here would add state this module does not need and would outlive a test.
async function hydrateCredentials(status: PersistedStateStatus): Promise<void> {
  const hydrations = await Promise.allSettled([hydrateApiKey(), hydrateAiAccessToken()]);
  for (const hydration of hydrations) {
    if (hydration.status === 'rejected') {
      console.warn('Secure credential hydration failed', hydration.reason);
    }
  }
  status.markHydrated();
}

/**
 * Settings only. Resolves as soon as the stores a route needs in order to
 * decide what to do are usable; credential hydration continues in the
 * background and still flips `persistedStateStatus.hydrated` when it lands.
 *
 * This is what the drawing route's boot gate wants:
 * `installColoringPackDownloads` reads `settings.coloringBookEnabled` and
 * nothing credential-shaped, so waiting on a secure-storage round trip held it
 * behind work it does not depend on.
 */
export async function hydrateSettings(): Promise<void> {
  await hydrateSettingsStores();
  // Durable hydration must finish before the credential migrations, so a legacy
  // plaintext value that survived only in Preferences can move into secure
  // storage before both plaintext copies are scrubbed.
  void hydrateCredentials(persistedStateStatus);
}

/**
 * Settings *and* credentials. The Settings modal renders the stored key and
 * access code, so it must not open before those have loaded.
 */
// `status` is a test seam: the routes always pass the shared flag, and the test
// hands in a fresh one so a flip from an earlier case cannot satisfy a later one.
export async function hydratePersistedState(
  status: PersistedStateStatus = persistedStateStatus
): Promise<void> {
  await hydrateSettingsStores();
  await hydrateCredentials(status);
}
