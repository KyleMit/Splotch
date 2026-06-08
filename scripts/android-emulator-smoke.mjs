// One-shot local Android smoke test (Windows). Boots a HEADLESS emulator, builds
// + installs the app, runs the Maestro smoke flow, then ALWAYS shuts the emulator
// down — even if the test fails. This is `npm run test:android`.
//
// It's just emulator-lifecycle glue: Maestro does the actual assertions
// (.maestro/smoke.yaml). For a faster inner loop against an emulator you keep
// running yourself, use `npm run test:android:device`.
//
// Assumes the standard local setup: the Pixel_7_Pro_API_33 AVD, the SDK in its
// default %LOCALAPPDATA% location, and Maestro installed under %USERPROFILE%.

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

const AVD = 'Pixel_7_Pro_API_33';
const ADB = join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe');
const EMULATOR = join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'emulator', 'emulator.exe');
const MAESTRO = join(process.env.USERPROFILE, 'maestro', 'bin', 'maestro.bat');

// Capture adb output (direct .exe call, no shell needed).
const adb = async (...args) => (await execFileAsync(ADB, args)).stdout.trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Run a command through the shell with live (inherited) output; reject on failure.
const sh = (command) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, { stdio: 'inherit', shell: true });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exited ${code}: ${command}`))));
  });

// 1. Check hardware acceleration before trying to boot (diagnoses 0xC0000005 crashes).
console.log('Checking emulator hardware acceleration...');
try {
  await execFileAsync(EMULATOR, ['-accel-check'], { env: process.env });
} catch (err) {
  // -accel-check exits non-zero when accel is unavailable; print its output and abort.
  process.stderr.write(err.stdout ?? '');
  process.stderr.write(err.stderr ?? '');
  throw new Error('Hardware acceleration check failed — emulator will not boot. See output above.');
}

// 2. Boot a headless emulator, detached so it keeps running until we kill it.
console.log(`Booting headless emulator: ${AVD}`);
const emulatorProc = spawn(EMULATOR, ['-avd', AVD, '-no-window', '-no-boot-anim', '-no-audio', '-no-snapshot-save', '-gpu', 'swiftshader_indirect'], {
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
});

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
let passed = false;
try {
  await sh('npm run android:run');
  await sh(`"${MAESTRO}" test .maestro/smoke.yaml`);
  passed = true;
} finally {
  console.log(`Shutting down ${serial}`);
  await execFileAsync(ADB, ['-s', serial, 'emu', 'kill']);
}

console.log(passed ? '\nSmoke test passed.' : '\nSmoke test FAILED.');
