import { pwaUpdates } from '$lib/pwa/updates';
import { initInstallPrompt, recordInstallRepromptSession } from '$lib/state/install.svelte';

// The service worker only exists in the web build; the native apps bundle their
// shell on-device, so there's nothing to update-check there. The install prompt
// is likewise web-only (the native app is already installed).
// tools/mobile/check-static-bundle.mjs guards this tree-shaking boundary with these
// minification-stable source markers; tools/mobile/tests/static-bundle.test.mjs
// enforces this duplicated list:
// - web/src/lib/state/install.svelte.ts: beforeinstallprompt
// - web/src/lib/state/install.svelte.ts: appinstalled
// - web/src/lib/pwa/updates.ts: controllerchange
// - web/src/lib/pwa/updates.ts: /sw.js
export function initWebOnlyServices(): () => void {
  if (__IS_CAPACITOR__) return () => {};
  const teardownPWAUpdates = pwaUpdates.initPWAUpdates();
  initInstallPrompt();
  return () => teardownPWAUpdates?.();
}

export function recordWebInstallRepromptSession() {
  if (__IS_CAPACITOR__) return;
  recordInstallRepromptSession();
}
