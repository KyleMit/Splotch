import { NativeModules } from 'react-native';

// SplotchDeviceLock (ios/Splotch/SplotchDeviceLock.swift, android .../SplotchDeviceLock.kt)
// answers whether Guided Access or App Pinning holds the app, as the shipping DeviceLock plugin
// does; native-device-lock.test.mjs reads both sides.
export const DEVICE_LOCK_MODULE = 'SplotchDeviceLock';

type DeviceLockModule = { isLocked: () => Promise<unknown> };

function isDeviceLockModule(value: unknown): value is DeviceLockModule {
  return (
    typeof value === 'object' &&
    value !== null &&
    'isLocked' in value &&
    typeof value.isLocked === 'function'
  );
}

// A missing module or a failed call reads as unlocked, so the parent sees how to turn the lock on.
export async function isDeviceLocked(): Promise<boolean> {
  const module: unknown = Reflect.get(NativeModules, DEVICE_LOCK_MODULE);
  if (!isDeviceLockModule(module)) return false;
  try {
    return (await module.isLocked()) === true;
  } catch {
    return false;
  }
}
