import { useEffect, useState, useSyncExternalStore } from 'react';
import { Dimensions, Platform } from 'react-native';
import {
  lockAsync,
  lockPlatformAsync,
  OrientationLock,
  unlockAsync,
} from 'expo-screen-orientation';
import { TABLET_MIN_SIDE_PX } from '../../../../web/src/lib/breakpoints';
import type { OrientationChoice } from '../settings/orientation';

// ActivityInfo.SCREEN_ORIENTATION_SENSOR: follows the sensor even with the
// device's Auto-rotate off, the request the shipping SensorOrientationPlugin
// makes for Auto. expo-screen-orientation names no lock that maps to it.
const ANDROID_SCREEN_ORIENTATION_SENSOR = 4;

// The same single-direction masks the shipping @capacitor/screen-orientation
// lock requests: SCREEN_ORIENTATION_PORTRAIT / _LANDSCAPE on Android and the
// portrait / landscapeRight masks on iOS.
const CHOICE_LOCKS: Record<Exclude<OrientationChoice, 'auto'>, OrientationLock> = {
  portrait: OrientationLock.PORTRAIT_UP,
  landscape: OrientationLock.LANDSCAPE_RIGHT,
};

export function autoOverridesSystemLock(): boolean {
  return Platform.OS === 'android';
}

// A tablet is left to the OS: Android 16 ignores the request at 600dp and up,
// and windowed iPadOS only letterboxes a locked app (docs/ORIENTATION.md).
function orientationLockApplies(): boolean {
  const screen = Dimensions.get('screen');
  return Math.min(screen.width, screen.height) < TABLET_MIN_SIDE_PX;
}

function subscribeToScreen(changed: () => void) {
  const subscription = Dimensions.addEventListener('change', changed);
  return () => subscription.remove();
}

// Live, so a foldable or a resized window crossing the tablet line shows or
// hides the picker and takes or releases the lock in the same render.
export function useOrientationLockApplies(): boolean {
  return useSyncExternalStore(subscribeToScreen, orientationLockApplies, orientationLockApplies);
}

function lockDeviceOrientation(choice: OrientationChoice): Promise<void> {
  if (choice !== 'auto') return lockAsync(CHOICE_LOCKS[choice]);
  if (autoOverridesSystemLock())
    return lockPlatformAsync({
      screenOrientationConstantAndroid: ANDROID_SCREEN_ORIENTATION_SENSOR,
    });
  return unlockAsync();
}

type OrientationTarget = OrientationChoice | 'released';

// Requests run one at a time, and each settles the newest target when it runs,
// so a request queued before the gate or the choice changed can never land
// after it. A refused request leaves the last applied target, so the next
// change retries.
function createOrientationRequests() {
  let wanted: OrientationTarget = 'released';
  let applied: OrientationTarget = 'released';
  let queue = Promise.resolve();
  async function settle() {
    const next = wanted;
    if (next === applied) return;
    await (next === 'released' ? unlockAsync() : lockDeviceOrientation(next));
    applied = next;
  }
  return {
    request(next: OrientationTarget) {
      wanted = next;
      queue = queue.then(settle).catch(() => undefined);
    },
  };
}

export function useDeviceOrientation(choice: OrientationChoice): void {
  const applies = useOrientationLockApplies();
  const [requests] = useState(createOrientationRequests);
  useEffect(() => {
    requests.request(applies ? choice : 'released');
  }, [requests, applies, choice]);
}
