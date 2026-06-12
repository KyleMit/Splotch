// One-shot local Android smoke test. Boots a HEADLESS emulator, builds +
// installs the app, runs the Maestro smoke flow, then ALWAYS shuts the
// emulator down — even if the test fails. This is `npm run test:android`.
//
// It's just emulator-lifecycle glue: Maestro does the actual assertions
// (.maestro/smoke.yaml). For a faster inner loop against an emulator you keep
// running yourself, use `npm run test:android:device`.
//
// Assumes the standard local setup (see `npm run android:setup`): the
// Pixel_7_Pro_API_33 AVD, the SDK in its default location, Maestro installed.

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { ROOT, isWindows, sleep } from './lib/utils.mjs';
import { ADB, EMULATOR, AVD_NAME, maestroPath } from './lib/android.mjs';

const execFileAsync = promisify(execFile);

// Capture adb output (direct executable call, no shell needed).
const adb = async (...args) => (await execFileAsync(ADB, args)).stdout.trim();

// Run a command through the shell with live (inherited) output; reject on
// failure. Async (not lib/utils run(), which exits the process on failure) so
// a failed build still reaches the finally block that kills the emulator.
const sh = (command, cwd = ROOT) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, { cwd, stdio: 'inherit', shell: true });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exited ${code}: ${command}`))));
  });

// 1. Check hardware acceleration before trying to boot (diagnoses 0xC0000005 crashes).
console.log('Checking emulator hardware acceleration...');
try {
  await execFileAsync(EMULATOR, ['-accel-check']);
} catch (err) {
  // -accel-check exits non-zero when accel is unavailable; print its output and abort.
  process.stderr.write(err.stdout ?? '');
  process.stderr.write(err.stderr ?? '');
  throw new Error('Hardware acceleration check failed — emulator will not boot. See output above.');
}

// 2. Boot a headless emulator, detached so it keeps running until we kill it.
console.log(`Booting headless emulator: ${AVD_NAME}`);
const emulatorProc = spawn(
  EMULATOR,
  ['-avd', AVD_NAME, '-no-window', '-no-boot-anim', '-no-audio', '-no-snapshot-save', '-gpu', 'swiftshader_indirect'],
  { detached: true, stdio: 'ignore', windowsHide: true }
);

// Reject immediately if the emulator exits before the device comes online (e.g. 0xC0000005 crash).
const emulatorCrash = new Promise((_, reject) => {
  emulatorProc.on('exit', (code) => {
    if (code !== 0) reject(new Error(`Emulator process exited early with code ${code} (0x${(code >>> 0).toString(16).toUpperCase()})`));
  });
});

// 3. Wait for it to come online and finish booting — but bail if the emulator crashes first.
await Promise.race([adb('wait-for-device'), emulatorCrash]);
while ((await adb('shell', 'getprop', 'sys.boot_completed')) !== '1') await sleep(2000);
emulatorProc.unref(); // safe to detach now that we know it's alive
const serial = (await adb('devices')).match(/emulator-\d+/)[0];
console.log(`Emulator booted: ${serial}`);

// 4. Build + install, run the flow, and always tear the emulator down.
try {
  await sh('npm run cap:sync');
  await sh(isWindows ? 'gradlew.bat :app:installDebug' : './gradlew :app:installDebug', join(ROOT, 'android'));
  await sh(`"${maestroPath()}" test .maestro/smoke.yaml`);
} finally {
  console.log(`Shutting down ${serial}`);
  await execFileAsync(ADB, ['-s', serial, 'emu', 'kill']);
}

console.log('\nSmoke test passed.');
