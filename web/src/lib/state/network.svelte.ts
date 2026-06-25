import { browser } from '$app/environment';
import { isNative } from '$lib/platform';

// Tracks connectivity so the UI can hide internet-only features (the AI button)
// when offline — everything else in Splotch works fully offline. On the web we
// lean on navigator.onLine + the online/offline events; on native we also use
// @capacitor/network, which reports real device connectivity reliably.
export const network = $state({
  online: true,
});

let initialized = false;

export function initNetwork() {
  if (!browser || initialized) return;
  initialized = true;

  network.online = navigator.onLine !== false;
  window.addEventListener('online', () => (network.online = true));
  window.addEventListener('offline', () => (network.online = false));

  if (isNative()) {
    import('@capacitor/network')
      .then(({ Network }) => {
        Network.getStatus().then((status) => (network.online = status.connected));
        Network.addListener('networkStatusChange', (status) => {
          network.online = status.connected;
        });
      })
      .catch(() => {});
  }
}
