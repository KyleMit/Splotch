// Android SDK locations and emulator constants shared by the android-* scripts.
// Everything resolves per-platform: macOS installs the SDK under
// ~/Library/Android/sdk, Linux under ~/Android/Sdk. ANDROID_HOME (or the older
// ANDROID_SDK_ROOT) overrides.

import { join } from 'node:path';
import { homedir } from 'node:os';
import { ROOT } from '../../../lib/proc.mjs';

export const CURRENT_ANDROID_API_LEVEL = 33;
export const AVD_NAME = `Pixel_7_Pro_API_${CURRENT_ANDROID_API_LEVEL}`;

export const ANDROID_HOME =
  process.env.ANDROID_HOME ??
  process.env.ANDROID_SDK_ROOT ??
  (process.platform === 'darwin'
    ? join(homedir(), 'Library', 'Android', 'sdk')
    : join(homedir(), 'Android', 'Sdk'));

export const ADB = join(ANDROID_HOME, 'platform-tools', 'adb');
export const EMULATOR = join(ANDROID_HOME, 'emulator', 'emulator');

export const ANDROID_DIR = join(ROOT, 'android');
export const GRADLEW = join(ANDROID_DIR, 'gradlew');

export const RELEASE_BUNDLE_DIR = join(
  ROOT,
  'android',
  'app',
  'build',
  'outputs',
  'bundle',
  'release'
);
export const RELEASE_AAB = join(RELEASE_BUNDLE_DIR, 'app-release.aab');
