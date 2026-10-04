// One-shot local Android smoke test. Boots a HEADLESS emulator on a console
// port no other emulator holds, builds + installs the app, runs the Maestro
// smoke flow, then ALWAYS shuts that emulator down — even if the test fails.
// This is `npm run test:android`.
//
// Every device step names the emulator this run started, `emulator-<port>`:
// adb gets `-s`, Gradle's install gets ANDROID_SERIAL, and Maestro gets
// `--device`. An emulator that is already open, or a phone that is plugged in,
// is never driven, installed to, or shut down.
//
// It's just emulator-lifecycle glue: Maestro does the actual assertions
// (the shared flow in ../lib/mobile-smoke-test.mjs). For a faster inner loop against an
// emulator you keep running yourself, use `npm run test:android:device`.
//
// Assumes the standard local setup (see `npm run android:setup`): the AVD named
// by AVD_NAME in lib/android-toolchain.mjs, the SDK in its default location, Maestro
// installed.

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { portIsFree } from '../../lib/net.mjs';
import { isMain, pollUntil, runMain, sh } from '../../lib/proc.mjs';
import { ADB, EMULATOR, AVD_NAME, ANDROID_DIR, GRADLEW } from './lib/android-toolchain.mjs';
import { runMaestroSmoke } from '../lib/mobile-smoke-test.mjs';

const execFileAsync = promisify(execFile);
const EMULATOR_BOOT_TIMEOUT_MS = 5 * 60 * 1000;
const EMULATOR_BOOT_POLL_INTERVAL_MS = 2000;
// `emulator -port` accepts only even console ports in this range, and reserves the
// port above each one for adb, which then names the device `emulator-<console port>`.
const EMULATOR_CONSOLE_PORTS = { first: 5554, last: 5584 };

export const emulatorSerial = (consolePort) => `emulator-${consolePort}`;

export function emulatorArgs(consolePort) {
  return [
    '-avd',
    AVD_NAME,
    '-port',
    String(consolePort),
    '-no-window',
    '-no-boot-anim',
    '-no-audio',
    '-no-snapshot-save',
    '-gpu',
    'swiftshader_indirect',
  ];
}

// The serial that starts each `adb devices` row, whatever its state: an emulator
// that is still booting lists as `offline` and holds its serial all the same.
function listedSerials(adbDevices) {
  return new Set(adbDevices.split('\n').map((row) => row.trim().split(/\s+/)[0]));
}

// `adbDevices` is the output of `adb devices`; `probe` answers whether a local
// port is free.
export async function pickConsolePort({ adbDevices, probe }) {
  const listed = listedSerials(adbDevices);
  const { first, last } = EMULATOR_CONSOLE_PORTS;
  for (let consolePort = first; consolePort <= last; consolePort += 2) {
    if (listed.has(emulatorSerial(consolePort))) continue;
    if ((await probe(consolePort)) && (await probe(consolePort + 1))) return consolePort;
  }
  throw new Error(
    `No free emulator console port: every even port from ${first} to ${last} is in use, has its adb port (the port above it) in use, or is already listed by adb devices. Shut an emulator down and retry.`
  );
}

const listAdbDevices = async () => (await execFileAsync(ADB, ['devices'])).stdout;

// With `-s`, adb fails rather than reach another device, and the flag outranks an
// ANDROID_SERIAL already in the environment.
const adb = async (serial, args, options) =>
  (await execFileAsync(ADB, ['-s', serial, ...args], options)).stdout.trim();

// Checked before boot: without acceleration the emulator cannot start, and its own
// output is discarded (spawnHeadlessEmulator).
async function checkHardwareAcceleration() {
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
}

// Detached, so it keeps running until this run shuts it down.
function spawnHeadlessEmulator(consolePort) {
  return spawn(EMULATOR, emulatorArgs(consolePort), {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
}

function exitedBeforeBootError(code, signal) {
  const exit = signal ? `was stopped by ${signal}` : `exited with code ${code}`;
  return new Error(
    `The emulator ${exit} before it finished booting. ${AVD_NAME} may already be in use by another emulator (npm run android:boot): close that emulator and retry.`
  );
}

async function pollBootCompleted(serial, signal) {
  await adb(serial, ['wait-for-device'], { signal });
  const bootCompleted = await pollUntil(
    async () => (await adb(serial, ['shell', 'getprop', 'sys.boot_completed'], { signal })) === '1',
    EMULATOR_BOOT_TIMEOUT_MS,
    EMULATOR_BOOT_POLL_INTERVAL_MS
  );
  if (!bootCompleted)
    throw new Error(`Emulator did not finish booting within ${EMULATOR_BOOT_TIMEOUT_MS}ms.`);
}

// Any exit before boot completes fails the run at once, whatever its code: an
// emulator whose AVD another emulator already has open exits straight away.
async function waitForBoot(serial, emulator) {
  const stopWaiting = new AbortController();
  const exited = new Promise((_, reject) => {
    emulator.once('exit', (code, signal) => reject(exitedBeforeBootError(code, signal)));
    emulator.once('error', reject);
  });
  try {
    await Promise.race([exited, pollBootCompleted(serial, stopWaiting.signal)]);
  } finally {
    // adb waits for a missing device indefinitely; the emulator it waits for may have exited.
    stopWaiting.abort();
  }
}

async function installAndRunSmoke(serial) {
  await sh('npm run cap:sync');
  // AGP's install tasks read ANDROID_SERIAL; without it, installDebug installs on every device.
  await sh(`ANDROID_SERIAL=${serial} "${GRADLEW}" :app:installDebug`, ANDROID_DIR);
  await runMaestroSmoke({ device: serial });
}

// Stops only what this run started: by serial once it booted, otherwise the
// process it spawned.
async function shutDownEmulator({ serial, emulator, booted }) {
  if (!booted) {
    emulator.kill();
    return;
  }
  console.log(`Shutting down ${serial}`);
  await adb(serial, ['emu', 'kill']);
}

export async function runAndroidSmokeTest() {
  await checkHardwareAcceleration();
  const consolePort = await pickConsolePort({
    adbDevices: await listAdbDevices(),
    probe: portIsFree,
  });
  const serial = emulatorSerial(consolePort);
  console.log(`Booting headless emulator ${AVD_NAME} as ${serial}`);
  const emulator = spawnHeadlessEmulator(consolePort);
  let booted = false;
  try {
    await waitForBoot(serial, emulator);
    booted = true;
    emulator.unref(); // safe to detach now that we know it's alive
    console.log(`Emulator booted: ${serial}`);
    await installAndRunSmoke(serial);
  } finally {
    await shutDownEmulator({ serial, emulator, booted });
  }
  console.log('\nSmoke test passed.');
}

if (isMain(import.meta.url)) runMain(runAndroidSmokeTest);
