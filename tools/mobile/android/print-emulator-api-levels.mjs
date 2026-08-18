import { MIN_ANDROID_API_LEVEL } from '../../../web/src/lib/components/beta/androidBeta.ts';
import { isMain } from '../../lib/proc.mjs';
import { CURRENT_ANDROID_API_LEVEL } from './lib/android-toolchain.mjs';

export function androidEmulatorApiLevels() {
  return [CURRENT_ANDROID_API_LEVEL, MIN_ANDROID_API_LEVEL];
}

export function printAndroidEmulatorApiLevels() {
  console.log(JSON.stringify(androidEmulatorApiLevels()));
}

if (isMain(import.meta.url)) printAndroidEmulatorApiLevels();
