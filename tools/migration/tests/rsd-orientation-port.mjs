// expo-screen-orientation as the RSD host serves it: the package's own lock
// values, with every platform request recorded in call order.
export { OrientationLock } from 'expo-screen-orientation/build/ScreenOrientation.types.js';

export const orientationCalls = [];

export async function lockAsync(lock) {
  orientationCalls.push(['lockAsync', lock]);
}

export async function lockPlatformAsync(options) {
  orientationCalls.push(['lockPlatformAsync', options]);
}

export async function unlockAsync() {
  orientationCalls.push(['unlockAsync']);
}
