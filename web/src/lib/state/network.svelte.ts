import { browser } from '$app/environment';
import { isNative } from '$lib/platform';

// Tracks connectivity so the UI can hide internet-only features (the AI button)
// when offline — everything else in Splotch works fully offline. On the web we
// lean on navigator.onLine + the online/offline events; on native we also use
// @capacitor/network, which reports real device connectivity reliably.
export const network = $state({
  online: true,
});

// Installed at module load (not from a component), gated on `browser`, so the
// value is live before the first component renders — ActionsPanel reads
// network.online on mount, before +page.svelte's onMount would run.
if (browser) {
  // Some old WebViews report `undefined` for navigator.onLine; assume online then.
  network.online = navigator.onLine ?? true;
  window.addEventListener('online', () => (network.online = true));
  window.addEventListener('offline', () => (network.online = false));

  // __IS_CAPACITOR__ makes the branch compile-time dead on web so Rollup drops
  // the plugin chunk (isNative() alone can't tree-shake across modules).
  if (__IS_CAPACITOR__ && isNative()) {
    import('@capacitor/network')
      .then(({ Network }) => {
        Network.getStatus()
          .then((status) => (network.online = status.connected))
          .catch(() => {});
        Network.addListener('networkStatusChange', (status) => {
          network.online = status.connected;
        }).catch(() => {});
      })
      .catch(() => {});
  }
}
