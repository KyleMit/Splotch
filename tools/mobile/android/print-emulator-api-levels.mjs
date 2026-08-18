import { MIN_ANDROID_API_LEVEL } from '../../../web/src/lib/components/beta/androidBeta.ts';
import { isMain, fail } from '../../lib/proc.mjs';
import { CURRENT_ANDROID_API_LEVEL } from './lib/android-toolchain.mjs';

const CURRENT_MODE = 'current';
const ALL_MODE = 'all';

export function androidEmulatorApiLevels(mode) {
  if (mode === CURRENT_MODE) return [CURRENT_ANDROID_API_LEVEL];
  if (mode === ALL_MODE) return [CURRENT_ANDROID_API_LEVEL, MIN_ANDROID_API_LEVEL];
  fail(`Expected emulator API-level mode "${CURRENT_MODE}" or "${ALL_MODE}".`);
}

export function printAndroidEmulatorApiLevels(mode) {
  console.log(JSON.stringify(androidEmulatorApiLevels(mode)));
}

if (isMain(import.meta.url)) printAndroidEmulatorApiLevels(process.argv[2]);
