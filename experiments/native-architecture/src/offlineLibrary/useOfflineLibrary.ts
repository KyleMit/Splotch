import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { offlineLibrary } from './runtime';

export function useOfflineLibrary(drawing: boolean, pickerOpen: boolean) {
  const snapshot = useSyncExternalStore(offlineLibrary.subscribe, offlineLibrary.snapshot);
  useEffect(() => {
    void offlineLibrary.initialize();
    offlineLibrary.setActive(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) =>
      offlineLibrary.setActive(state === 'active')
    );
    return () => {
      subscription.remove();
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
