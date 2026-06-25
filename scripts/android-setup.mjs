// cspell:ignore sdkmanager avdmanager avds cmdline playstore temurin libexec winget Adoptium
// One-time emulator setup for local Android work: installs the API 33 Play
// Store system image, creates the Pixel 7 Pro AVD, writes
// android/local.properties, and installs the Maestro smoke-test CLI. Checks the
// required SDK tools are on PATH first and prints per-platform fix instructions
// if not. Safe to re-run.

import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, isWindows, hasCommand, run, capture, fail, maestroInstalled } from './lib/utils.mjs';
import { ANDROID_HOME, AVD_NAME } from './lib/android.mjs';

const ABI = process.arch === 'arm64' ? 'arm64-v8a' : 'x86_64';
const SYSTEM_IMAGE = `system-images;android-33;google_apis_playstore;${ABI}`;
const DEVICE_ID = 'pixel_7_pro';

const addToPath = (subdir) =>
  isWindows
    ? `Add to PATH (System Properties → Environment Variables):  %LOCALAPPDATA%\\Android\\Sdk\\${subdir.replaceAll('/', '\\')}`
    : `Add to ~/.zshrc:  export PATH="$ANDROID_HOME/${subdir}:$PATH"`;

const javaFix = isWindows
  ? [
      'Install JDK 21:  winget install EclipseAdoptium.Temurin.21.JDK',
      'Then set JAVA_HOME to the install directory (System Properties → Environment Variables)',
    ]
  : [
      'Install JDK 21:  brew install --cask temurin@21',
      'Then add to ~/.zshrc:  export JAVA_HOME="$(/usr/libexec/java_home -v 21)"',
    ];

const cmdlineToolsFix = [
  'Android Studio → SDK Manager → SDK Tools → Android SDK Command-line Tools (latest) → Apply',
  addToPath('cmdline-tools/latest/bin'),
];

const REQUIRED = [
  { cmd: 'java', fix: javaFix },
  { cmd: 'sdkmanager', fix: cmdlineToolsFix },
  { cmd: 'avdmanager', fix: cmdlineToolsFix },
  { cmd: 'emulator', fix: [addToPath('emulator')] },
  { cmd: 'adb', fix: [addToPath('platform-tools')] },
];

const missing = REQUIRED.filter(({ cmd }) => !hasCommand(cmd));
if (missing.length > 0) {
  const lines = ['[android-setup] Missing tools — not found on PATH:', ''];
  for (const { cmd, fix } of missing) lines.push(`  ${cmd}:`, ...fix.map((f) => `    ${f}`));
  lines.push(
    '',
    isWindows
      ? 'After fixing, open a new terminal.'
      : 'After fixing, open a new terminal or run: source ~/.zshrc'
  );
  fail(lines.join('\n'));
}

const imageDir = join(ANDROID_HOME, 'system-images', 'android-33', 'google_apis_playstore', ABI);
if (existsSync(imageDir)) {
  console.log('[android-setup] System image already installed.');
} else {
  console.log(`[android-setup] Installing ${SYSTEM_IMAGE} (auto-accepting licenses) …`);
  run('sdkmanager', [SYSTEM_IMAGE], { input: 'y\n'.repeat(20) });
}

const avds = capture('avdmanager', ['list', 'avd', '--compact'])
  .split('\n')
  .map((l) => l.trim());
if (avds.includes(AVD_NAME)) {
  console.log(`[android-setup] AVD "${AVD_NAME}" already exists — nothing to do.`);
} else {
  console.log(`[android-setup] Creating AVD "${AVD_NAME}" …`);
  run(
    'avdmanager',
    ['create', 'avd', '--name', AVD_NAME, '--package', SYSTEM_IMAGE, '--device', DEVICE_ID],
    {
      input: 'no\n',
    }
  );
}

const localProps = join(ROOT, 'android', 'local.properties');
if (!existsSync(localProps)) {
  writeFileSync(localProps, `sdk.dir=${ANDROID_HOME.replaceAll('\\', '/')}\n`);
  console.log(`[android-setup] Wrote android/local.properties (sdk.dir=${ANDROID_HOME})`);
}

// Maestro drives the native smoke test (npm run test:android). It's a
// standalone JVM CLI, not an npm package, so it installs separately. The JDK 21
// checked above satisfies its Java requirement. macOS/Linux have a one-line
// installer; Windows has no clean CLI installer, so point the user at the
// manual steps instead of failing silently later in the smoke test.
if (maestroInstalled()) {
  console.log('[android-setup] Maestro already installed.');
} else if (isWindows) {
  fail(
    [
      '[android-setup] Maestro is not installed (needed for "npm run test:android").',
      '  Install it manually on Windows:',
      '    1. Download maestro.zip from https://github.com/mobile-dev-inc/maestro/releases',
      '    2. Extract it to %USERPROFILE%\\maestro',
      '    3. Add %USERPROFILE%\\maestro\\bin to your User PATH',
      '    4. Open a new terminal and verify:  maestro --version',
    ].join('\n')
  );
} else {
  console.log('[android-setup] Installing Maestro (https://get.maestro.mobile.dev) …');
  run('bash', ['-c', 'curl -fsSL https://get.maestro.mobile.dev | bash']);
}

console.log('[android-setup] Done — run "npm run android:boot" then "npm run android:emulator".');
