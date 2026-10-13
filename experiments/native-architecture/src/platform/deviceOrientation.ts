import { useEffect, useRef } from 'react';
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

export function useOrientationLockApplies(): boolean {
  return orientationLockApplies();
}

function lockDeviceOrientation(choice: OrientationChoice): Promise<void> {
  if (choice !== 'auto') return lockAsync(CHOICE_LOCKS[choice]);
  if (autoOverridesSystemLock())
    return lockPlatformAsync({
      screenOrientationConstantAndroid: ANDROID_SCREEN_ORIENTATION_SENSOR,
    });
  return unlockAsync();
}

export function useDeviceOrientation(choice: OrientationChoice): void {
  const requests = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    if (!orientationLockApplies()) return;
    // Chained so a newer choice always reaches the platform last. A refused lock
    // leaves the saved choice for the next launch.
    requests.current = requests.current
      .then(() => lockDeviceOrientation(choice))
      .catch(() => undefined);
  }, [choice]);
}
