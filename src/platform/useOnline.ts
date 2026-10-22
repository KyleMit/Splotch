import { useEffect, useState } from 'react';
import { getNetworkStateAsync, addNetworkStateListener } from 'expo-network';
import { File, Paths } from 'expo-file-system';
import { STORAGE_KEYS } from '../lib/storageKeys';

function lastOnline() {
  try {
    const file = new File(Paths.document, STORAGE_KEYS.lastNetworkOnline);
    return !file.exists || file.textSync() !== 'false';
  } catch {
    return true;
  }
}

export function useOnline() {
  const [online, setOnline] = useState(lastOnline);
  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    let subscription: ReturnType<typeof addNetworkStateListener> | null = null;
    const update = (connected: boolean | undefined) => {
      if (!active || typeof connected !== 'boolean') return;
      setOnline(connected);
      try {
        const file = new File(Paths.document, STORAGE_KEYS.lastNetworkOnline);
        if (!file.exists) file.create();
        file.writeSync(String(connected));
      } catch (error) {
        console.warn('Network status could not be saved:', error);
      }
    };
    try {
      subscription = addNetworkStateListener(({ isConnected }) => {
        receivedEvent = true;
        update(isConnected);
      });
    } catch (error) {
      console.warn('Network changes could not be observed:', error);
    }
    void getNetworkStateAsync()
      .then(({ isConnected }) => {
        if (!receivedEvent) update(isConnected);
      })
      .catch((error: unknown) => {
        console.warn('Network status could not be read:', error);
        if (!receivedEvent) update(true);
      });
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);
  return online;
}
