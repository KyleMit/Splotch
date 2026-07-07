// Android SDK locations and emulator constants shared by the android-* scripts.
// Everything resolves per-platform: Windows installs the SDK under
// %LOCALAPPDATA%\Android\Sdk, macOS under ~/Library/Android/sdk, Linux under
// ~/Android/Sdk. ANDROID_HOME (or the older ANDROID_SDK_ROOT) overrides.

import { join } from 'node:path';
import { homedir } from 'node:os';
import { isWindows } from './utils.mjs';

export const AVD_NAME = 'Pixel_7_Pro_API_33';

export const ANDROID_HOME =
  process.env.ANDROID_HOME ??
  process.env.ANDROID_SDK_ROOT ??
  (isWindows
    ? join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk')
    : process.platform === 'darwin'
      ? join(homedir(), 'Library', 'Android', 'sdk')
      : join(homedir(), 'Android', 'Sdk'));

const exe = (name) => (isWindows ? `${name}.exe` : name);

export const ADB = join(ANDROID_HOME, 'platform-tools', exe('adb'));
export const EMULATOR = join(ANDROID_HOME, 'emulator', exe('emulator'));
