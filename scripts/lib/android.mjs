// Android SDK locations and emulator constants shared by the android-* scripts.
// Everything resolves per-platform: Windows installs the SDK under
// %LOCALAPPDATA%\Android\Sdk, macOS under ~/Library/Android/sdk.

import { join } from 'node:path';
import { homedir } from 'node:os';
import { hasCommand, isWindows } from './utils.mjs';

export const AVD_NAME = 'Pixel_7_Pro_API_33';

export const ANDROID_HOME =
  process.env.ANDROID_HOME ??
  (isWindows
    ? join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk')
    : join(homedir(), 'Library', 'Android', 'sdk'));

const exe = (name) => (isWindows ? `${name}.exe` : name);

export const ADB = join(ANDROID_HOME, 'platform-tools', exe('adb'));
export const EMULATOR = join(ANDROID_HOME, 'emulator', exe('emulator'));

// Prefer Maestro from PATH; fall back to its default install location.
export const maestroPath = () => {
  if (hasCommand('maestro')) return 'maestro';
  return isWindows
    ? join(process.env.USERPROFILE ?? '', 'maestro', 'bin', 'maestro.bat')
    : join(homedir(), '.maestro', 'bin', 'maestro');
};
