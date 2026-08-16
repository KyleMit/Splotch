import { hydrateApiKey } from '$lib/state/aiKey';
import { hydrateSaveFolder } from '$lib/state/saveFolder.svelte';
import { settings } from '$lib/state/settings.svelte';
import { recordSettingsActivitySession } from '$lib/state/settingsSessions.svelte';
import { hydrateDurableStorage } from '$lib/storage';
import { applyDeviceOrientationPreference } from '$lib/platform/orientation';
import { persistedStateStatus } from './persistedStateStatus.svelte';

export async function hydratePersistedState(): Promise<void> {
  // Load the optional saved-photo folder name for display in Settings
  // (web/desktop only; no effect on whether saves happen). Fire-and-forget:
  // nothing downstream needs the folder name before it arrives.
  void hydrateSaveFolder();

  // Native only: recover any settings the WebView's localStorage may have
  // evicted from the durable Capacitor Preferences store. Each persisted store
  // registers its own reloader via onDurableRestore (issue #521), so hydrate
  // refreshes them all — no reload list to keep in sync here. No-op (and
  // instant) on the web. Orientation is re-applied explicitly: it's an
  // imperative side effect, not a persisted store, and reloadSettings changing
  // an orientation setting also re-runs the orientation $effect in the shell,
  // but this guarantees the apply even when the restored value equals the
  // current one.
  const restored = await hydrateDurableStorage();
  recordSettingsActivitySession();
  if (restored) {
    void applyDeviceOrientationPreference(
      settings.lockRotationEnabled,
      settings.forceLandscapeOrientation
    );
  }

  // Durable hydration must finish before the BYOK key migration so a
  // legacy plaintext key that survived only in Preferences can move into secure
  // storage before both plaintext copies are scrubbed.
  await hydrateApiKey();
  persistedStateStatus.hydrated = true;
}
