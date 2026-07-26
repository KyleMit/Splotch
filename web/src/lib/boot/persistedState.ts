import { hydrateApiKey } from '$lib/state/aiKey.svelte';
import { hydrateSaveFolder } from '$lib/state/saveFolder.svelte';
import { hydrateDurableStorage } from '$lib/storage';
import { applyDeviceOrientationPreference } from '$lib/orientation';

export function hydratePersistedState(): void {
  // Load the BYOK Gemini key from secure storage into the live store (async,
  // transparent — the AI button is only used long after boot completes).
  hydrateApiKey();
  // Load the optional saved-photo folder name for the Parent Center display
  // (web/desktop only; no effect on whether saves happen).
  hydrateSaveFolder();

  // Native only: recover any settings the WebView's localStorage may have
  // evicted from the durable Capacitor Preferences store. Each persisted store
  // registers its own reloader via onDurableRestore (issue #521), so hydrate
  // refreshes them all — no reload list to keep in sync here. No-op (and
  // instant) on the web. Orientation is re-applied explicitly: it's an
  // imperative side effect, not a persisted store, and reloadSettings changing
  // an orientation setting also re-runs the orientation $effect in the shell,
  // but this guarantees the apply even when the restored value equals the
  // current one.
  hydrateDurableStorage().then((restored) => {
    if (restored) applyDeviceOrientationPreference();
  });
}
