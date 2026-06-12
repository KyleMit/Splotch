// cspell:ignore sdkmanager avdmanager cmdline playstore temurin libexec
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AVD_NAME = 'Pixel_7_Pro_API_33';
const ABI = process.arch === 'arm64' ? 'arm64-v8a' : 'x86_64';
const SYSTEM_IMAGE = `system-images;android-33;google_apis_playstore;${ABI}`;
const DEVICE_ID = 'pixel_7_pro';
const ANDROID_HOME = process.env.ANDROID_HOME ?? join(homedir(), 'Library', 'Android', 'sdk');

const REQUIRED = [
  {
    cmd: 'java',
    fix: [
      'Install JDK 21:  brew install --cask temurin@21',
      'Then add to ~/.zshrc:  export JAVA_HOME="$(/usr/libexec/java_home -v 21)"',
    ],
  },
  {
    cmd: 'sdkmanager',
    fix: [
      'Android Studio → SDK Manager → SDK Tools → Android SDK Command-line Tools (latest) → Apply',
      'Then add to ~/.zshrc:  export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"',
    ],
  },
  {
    cmd: 'avdmanager',
    fix: [
      'Android Studio → SDK Manager → SDK Tools → Android SDK Command-line Tools (latest) → Apply',
      'Then add to ~/.zshrc:  export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"',
    ],
  },
  {
    cmd: 'emulator',
    fix: ['Add to ~/.zshrc:  export PATH="$ANDROID_HOME/emulator:$PATH"'],
  },
  {
    cmd: 'adb',
    fix: ['Add to ~/.zshrc:  export PATH="$ANDROID_HOME/platform-tools:$PATH"'],
  },
];

const missing = REQUIRED.filter(({ cmd }) => spawnSync('which', [cmd], { stdio: 'ignore' }).status !== 0);
if (missing.length > 0) {
  console.error('[android-setup] Missing tools — not found on PATH:\n');
  for (const { cmd, fix } of missing) {
    console.error(`  ${cmd}:`);
    for (const line of fix) console.error(`    ${line}`);
  }
  console.error('\nAfter fixing, open a new terminal or run: source ~/.zshrc\n');
  process.exit(1);
}

const imageDir = join(ANDROID_HOME, 'system-images', 'android-33', 'google_apis_playstore', ABI);
if (!existsSync(imageDir)) {
  console.log(`[android-setup] Accepting SDK licenses …`);
  spawnSync('sdkmanager', ['--licenses'], {
    input: Array(20).fill('y').join('\n'),
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  console.log(`[android-setup] Installing ${SYSTEM_IMAGE} …`);
  const install = spawnSync('sdkmanager', [SYSTEM_IMAGE], { stdio: 'inherit' });
  if (install.status !== 0) {
    console.error(`[android-setup] sdkmanager failed (exit ${install.status})`);
    process.exit(install.status ?? 1);
  }
} else {
  console.log(`[android-setup] System image already installed.`);
}

const { stdout: avdList = '' } = spawnSync('avdmanager', ['list', 'avd', '--compact'], { encoding: 'utf8' });
if (avdList.split('\n').map(l => l.trim()).includes(AVD_NAME)) {
  console.log(`[android-setup] AVD "${AVD_NAME}" already exists — nothing to do.`);
} else {
  console.log(`[android-setup] Creating AVD "${AVD_NAME}" …`);
  const create = spawnSync('avdmanager', [
    'create', 'avd', '--name', AVD_NAME, '--package', SYSTEM_IMAGE, '--device', DEVICE_ID,
  ], {
    input: 'no\n',
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (create.status !== 0) {
    console.error(`[android-setup] avdmanager failed (exit ${create.status})`);
    process.exit(create.status ?? 1);
  }
}

const localProps = join(ROOT, 'android', 'local.properties');
if (!existsSync(localProps)) {
  writeFileSync(localProps, `sdk.dir=${ANDROID_HOME}\n`);
  console.log(`[android-setup] Wrote android/local.properties (sdk.dir=${ANDROID_HOME})`);
}

console.log(`[android-setup] Done — run "npm run android:boot" then "npm run android:emulator".`);
