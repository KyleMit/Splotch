import { browser } from '$app/environment';
import { isNative } from '$lib/platform';
import { readBool, writeBool } from '$lib/storage';
import { STORAGE_KEYS } from '$lib/storageKeys';

// Tracks connectivity so the UI can hide internet-only features (the AI button)
// when offline — everything else in Splotch works fully offline. On the web we
// lean on navigator.onLine + the online/offline events; on native we also use
// @capacitor/network, which reports real device connectivity reliably.
export interface NetworkState {
  readonly online: boolean;
  // Seeds `online` from the platform and subscribes to its changes.
  install(): void;
  dispose(): void;
}

// The two plugin members the native path uses, so a test can stand the plugin
// in without the rest of its surface. `loadNetworkPlugin` is a test seam:
// production always takes the default, and a test hands in a loader it can
// hold open to prove a disposal during the pending import subscribes to nothing.
interface NetworkPluginLike {
  getStatus(): Promise<{ connected: boolean }>;
  addListener(
    event: 'networkStatusChange',
    listener: (status: { connected: boolean }) => void
  ): Promise<{ remove(): void | Promise<void> }>;
}
type NetworkPluginModule = { Network: NetworkPluginLike };

export function createNetwork(
  loadNetworkPlugin?: () => Promise<NetworkPluginModule>,
  initialOnline = true
): NetworkState {
  const s = $state({ online: initialOnline });

  let installed = false;
  let removeNativeListener: (() => void) | null = null;

  const onOnline = () => updateOnline(true);
  const onOffline = () => updateOnline(false);

  function updateOnline(online: boolean) {
    s.online = online;
    writeBool(STORAGE_KEYS.lastNetworkOnline, online);
  }

  function followWindowEvents() {
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
  }

  // The plugin is the only writer on native, so each part of it that fails hands
  // its job to the WebView's own signal. Swallowed, the failure would leave a
  // stored "offline" in force for this session and every later one.
  function installNativeStatus(loadPlugin: () => Promise<NetworkPluginModule>) {
    let receivedStatusEvent = false;
    let disposed = false;
    removeNativeListener = () => {
      disposed = true;
    };
    const readNavigatorInstead = (error: unknown) => {
      console.warn('[network] device status read failed; using navigator.onLine', error);
      if (!receivedStatusEvent && !disposed) updateOnline(navigator.onLine ?? true);
    };
    const followWindowEventsInstead = (error: unknown) => {
      console.warn('[network] device status events failed; following window events', error);
      if (!disposed) followWindowEvents();
    };
    void loadPlugin()
      .then(({ Network }) => {
        if (disposed) return;
        Network.getStatus()
          .then((status) => {
            if (!receivedStatusEvent && !disposed) updateOnline(status.connected);
          })
          .catch(readNavigatorInstead);
        Network.addListener('networkStatusChange', (status) => {
          receivedStatusEvent = true;
          if (!disposed) updateOnline(status.connected);
        })
          .then((handle) => {
            if (disposed) void handle.remove();
            else
              removeNativeListener = () => {
                disposed = true;
                void handle.remove();
              };
          })
          .catch(followWindowEventsInstead);
      })
      .catch((error: unknown) => {
        readNavigatorInstead(error);
        followWindowEventsInstead(error);
      });
  }

  return {
    get online() {
      return s.online;
    },
    install() {
      if (installed) return;
      installed = true;
      const native = __IS_CAPACITOR__ && isNative();
      // Native WebViews can report online before the network plugin resolves.
      // Keep the stored state until the device status arrives.
      if (!native) {
        updateOnline(navigator.onLine ?? true);
        followWindowEvents();
      }
      // __IS_CAPACITOR__ makes the branch compile-time dead on web so Rollup drops
      // the plugin chunk (isNative() alone can't tree-shake across modules). The
      // default loader stays inside the branch for the same reason.
      if (native) {
        installNativeStatus(loadNetworkPlugin ?? (() => import('@capacitor/network')));
      }
    },
    dispose() {
      if (!installed) return;
      installed = false;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      removeNativeListener?.();
      removeNativeListener = null;
    },
  };
}

export const networkState = createNetwork(
  undefined,
  readBool(STORAGE_KEYS.lastNetworkOnline, true)
);

// Installed at module load (not from a component), gated on `browser`, so the
// value is live before the first component renders — ActionsPanel reads
// networkState.online on mount, before +page.svelte's onMount would run.
if (browser) networkState.install();
