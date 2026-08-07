// One-shot local Android smoke test. Boots a HEADLESS emulator, builds +
// installs the app, runs the Maestro smoke flow, then ALWAYS shuts the
// emulator down — even if the test fails. This is `npm run test:android`.
//
// It's just emulator-lifecycle glue: Maestro does the actual assertions
// (the shared flow in lib/native-smoke.mjs). For a faster inner loop against an
// emulator you keep running yourself, use `npm run test:android:device`.
//
// Assumes the standard local setup (see `npm run android:setup`): the AVD named
// by AVD_NAME in lib/android.mjs, the SDK in its default location, Maestro
// installed.

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pollUntil, sh } from './lib/proc.mjs';
import { ADB, EMULATOR, AVD_NAME, ANDROID_DIR, GRADLEW } from './lib/android.mjs';
import { runMaestroSmoke } from './lib/native-smoke.mjs';

const execFileAsync = promisify(execFile);
const EMULATOR_BOOT_TIMEOUT_MS = 5 * 60 * 1000;
const EMULATOR_BOOT_POLL_INTERVAL_MS = 2000;

// Capture adb output (direct executable call, no shell needed).
const adb = async (...args) => (await execFileAsync(ADB, args)).stdout.trim();

// 1. Check hardware acceleration before trying to boot (diagnoses 0xC0000005 crashes).
console.log('Checking emulator hardware acceleration...');
try {
  await execFileAsync(EMULATOR, ['-accel-check']);
} catch (err) {
  // -accel-check exits non-zero when accel is unavailable; print its output and abort.
  process.stderr.write(err.stdout ?? '');
  process.stderr.write(err.stderr ?? '');
  throw new Error(
    'Hardware acceleration check failed — emulator will not boot. See output above.',
    {
      cause: err,
    }
  );
}

// 2. Boot a headless emulator, detached so it keeps running until we kill it.
console.log(`Booting headless emulator: ${AVD_NAME}`);
const emulatorProc = spawn(
  EMULATOR,
  [
    '-avd',
    AVD_NAME,
    '-no-window',
    '-no-boot-anim',
    '-no-audio',
    '-no-snapshot-save',
    '-gpu',
    'swiftshader_indirect',
  ],
  { detached: true, stdio: 'ignore', windowsHide: true }
);

// Reject immediately if the emulator exits before the device comes online (e.g. 0xC0000005 crash).
const emulatorCrash = new Promise((_, reject) => {
  emulatorProc.on('exit', (code) => {
    if (code !== 0)
      reject(
        new Error(
          `Emulator process exited early with code ${code} (0x${(code >>> 0).toString(16).toUpperCase()})`
        )
      );
  });
});

// 3. Wait for it to come online and finish booting — but bail if the emulator crashes first.
let serial;
try {
  serial = await Promise.race([
    (async () => {
      await adb('wait-for-device');
      const bootCompleted = await pollUntil(
        async () => (await adb('shell', 'getprop', 'sys.boot_completed')) === '1',
        EMULATOR_BOOT_TIMEOUT_MS,
        EMULATOR_BOOT_POLL_INTERVAL_MS
      );
      if (!bootCompleted)
        throw new Error(`Emulator did not finish booting within ${EMULATOR_BOOT_TIMEOUT_MS}ms.`);

      const serialMatch = (await adb('devices')).match(/emulator-\d+/);
      if (!serialMatch) throw new Error('No emulator serial was found in adb devices output.');
      return serialMatch[0];
    })(),
    emulatorCrash,
  ]);
  emulatorProc.unref(); // safe to detach now that we know it's alive
  console.log(`Emulator booted: ${serial}`);

  // 4. Build + install, run the flow, and always tear the emulator down.
  await sh('npm run cap:sync');
  await sh(`"${GRADLEW}" :app:installDebug`, ANDROID_DIR);
  await runMaestroSmoke();
} finally {
  if (serial) {
    console.log(`Shutting down ${serial}`);
    await execFileAsync(ADB, ['-s', serial, 'emu', 'kill']);
  } else {
    emulatorProc.kill();
  }
}

console.log('\nSmoke test passed.');
