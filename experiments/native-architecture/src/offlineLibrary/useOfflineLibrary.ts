import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { subscribeNetworkReturn } from '../platform/networkReturn';
import { offlineLibrary } from './runtime';

// A download that failed or is waiting for a network retries on its own when the app returns to
// the foreground or the device comes back online, as shipping's downloader does. Drawing never
// retries it.
function retryStalledDownloads() {
  const { status } = offlineLibrary.snapshot();
  if (status === 'failed' || status === 'waiting') offlineLibrary.retry();
}

export function useOfflineLibrary(drawing: boolean, pickerOpen: boolean) {
  const snapshot = useSyncExternalStore(offlineLibrary.subscribe, offlineLibrary.snapshot);
  useEffect(() => {
    void offlineLibrary.initialize();
    offlineLibrary.setActive(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) => {
      offlineLibrary.setActive(state === 'active');
      if (state === 'active') retryStalledDownloads();
    });
    const unsubscribeNetwork = subscribeNetworkReturn(retryStalledDownloads);
    return () => {
      subscription.remove();
      unsubscribeNetwork();
      offlineLibrary.setActive(false);
    };
  }, []);
  useEffect(() => {
    offlineLibrary.setDrawing(drawing);
  }, [drawing]);
  useEffect(() => {
    if (pickerOpen) offlineLibrary.engage();
  }, [pickerOpen]);
  return snapshot;
}
