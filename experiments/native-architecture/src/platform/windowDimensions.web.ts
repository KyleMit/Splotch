import { useSyncExternalStore } from 'react';
import { Dimensions, type ScaledSize } from 'react-native';
import { firstFrameWindow } from './firstFrameWindow';

function subscribe(changed: () => void) {
  const subscription = Dimensions.addEventListener('change', changed);
  return () => subscription.remove();
}

const liveWindow = () => Dimensions.get('window');

// React Native Web's hook reads the live window in its first render, so hydrating the shell's
// prerendered frame on any other viewport would keep that frame's markup and attributes. Through
// the server snapshot, hydration renders the frame's own window and the next render the live one.
export function useWindowDimensions(): ScaledSize {
  return useSyncExternalStore(subscribe, liveWindow, firstFrameWindow);
}
