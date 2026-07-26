import { initPWAUpdates } from '$lib/pwa/updates';
import { initInstallPrompt } from '$lib/state/install.svelte';

// The service worker only exists in the web build; the native apps bundle their
// shell on-device, so there's nothing to update-check there. The install prompt
// is likewise web-only (the native app is already installed).
export function initWebOnlyServices(): () => void {
  if (__IS_CAPACITOR__) return () => {};
  const teardownPWAUpdates = initPWAUpdates();
  initInstallPrompt();
  return () => teardownPWAUpdates?.();
}
