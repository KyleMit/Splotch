// expo-screen-orientation as the RSD host serves it: the package's own lock
// values, with every platform request recorded in call order, and the display
// rotation a test sets.
import { Orientation } from 'expo-screen-orientation/build/ScreenOrientation.types.js';

export {
  Orientation,
  OrientationLock,
} from 'expo-screen-orientation/build/ScreenOrientation.types.js';

export const orientationCalls = [];

export const displayOrientation = { current: Orientation.PORTRAIT_UP };

export async function getOrientationAsync() {
  return displayOrientation.current;
}

export async function lockAsync(lock) {
  orientationCalls.push(['lockAsync', lock]);
}

export async function lockPlatformAsync(options) {
  orientationCalls.push(['lockPlatformAsync', options]);
}

export async function unlockAsync() {
  orientationCalls.push(['unlockAsync']);
}
