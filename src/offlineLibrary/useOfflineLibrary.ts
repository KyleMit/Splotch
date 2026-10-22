import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { subscribeNetworkReturn } from '../platform/networkReturn';
import { offlineLibrary } from './runtime';
import { SETTLED_IN_STROKES } from '../install/installPolicy';

export function useOfflineLibrary(drawing: boolean, pickerOpen: boolean, committedStrokes: number) {
  const snapshot = useSyncExternalStore(
    offlineLibrary.subscribe,
    offlineLibrary.snapshot,
    offlineLibrary.snapshot
  );
  useEffect(() => {
    void offlineLibrary.initialize();
    offlineLibrary.setActive(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) => {
      offlineLibrary.setActive(state === 'active');
      if (state === 'active') offlineLibrary.retryStalled();
    });
    // A failed or waiting download retries on its own when the app returns to the foreground or
    // the network returns, as shipping's downloader does; drawing never retries it.
    const unsubscribeNetwork = subscribeNetworkReturn(() => offlineLibrary.retryStalled());
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
    if (pickerOpen || committedStrokes >= SETTLED_IN_STROKES) offlineLibrary.engage();
  }, [pickerOpen, committedStrokes]);
  return snapshot;
}
