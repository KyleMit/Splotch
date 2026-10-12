// Installs the debug build onto the connected physical phone, resolving the
// adb serial dynamically (issue #1645 removed the committed hardware pin).
// ANDROID_SERIAL, when set, wins; otherwise exactly one physical device must
// be attached — emulators are ignored, ambiguity fails with guidance.
// Used by android:run:device.

import { execFileSync } from 'node:child_process';
import { fail, isMain, run } from '../../lib/proc.mjs';
import { ADB, ANDROID_DIR, GRADLEW } from './lib/android-toolchain.mjs';

export function resolvePhysicalAndroidSerial({ adbOutput, envSerial }) {
  if (envSerial) return envSerial;
  const physical = adbOutput
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state === 'device' && !serial.startsWith('emulator-'))
    .map(([serial]) => serial);
  if (physical.length === 1) return physical[0];
  if (physical.length === 0)
    throw new Error('[run-on-device] no physical Android device attached (adb devices)');
  throw new Error(
    `[run-on-device] ${physical.length} physical Android devices attached — set ANDROID_SERIAL to pick one`
  );
}

if (isMain(import.meta.url)) {
  let serial;
  try {
    serial = resolvePhysicalAndroidSerial({
      adbOutput: execFileSync(ADB, ['devices']).toString('utf8'),
      envSerial: process.env.ANDROID_SERIAL,
    });
  } catch (error) {
    fail(error.message);
  }
  process.env.ANDROID_SERIAL = serial;
  run(GRADLEW, [':app:installDebug'], { cwd: ANDROID_DIR });
}
