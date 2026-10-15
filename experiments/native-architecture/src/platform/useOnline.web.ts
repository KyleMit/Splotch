import { useSyncExternalStore } from 'react';
import { STORAGE_KEYS } from '../../../../web/src/lib/storageKeys';

function online() {
  return navigator.onLine ?? true;
}

function subscribe(notify: () => void) {
  const update = () => {
    try {
      localStorage.setItem(STORAGE_KEYS.lastNetworkOnline, String(online()));
    } catch (error) {
      console.warn('Network status could not be saved:', error);
    }
    notify();
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
  return () => {
    window.removeEventListener('online', update);
    window.removeEventListener('offline', update);
  };
}

export function useOnline() {
  return useSyncExternalStore(subscribe, online, () => true);
}
