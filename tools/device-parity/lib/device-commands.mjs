// Host commands against a simulator, emulator, or attached device: adb, simctl, devicectl.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ADB } from '../../mobile/android/lib/android-toolchain.mjs';

const COMMAND_OUTPUT_LIMIT_BYTES = 512 << 20;

function runCommand(cmd, args, options = {}) {
  return execFileSync(cmd, args, {
    encoding: 'utf8',
    maxBuffer: COMMAND_OUTPUT_LIMIT_BYTES,
    ...options,
  });
}

// Evidence probes read whatever a command printed even when it exits non-zero: `pidof` exits 1
// for a dead app, and a dead app is the answer, not a failure.
export function readCommand(cmd, args, options = {}) {
  try {
    return runCommand(cmd, args, options);
  } catch (error) {
    return error.stdout?.toString?.() ?? '';
  }
}

export function adb(serial, ...args) {
  return runCommand(ADB, ['-s', serial, ...args]);
}

export function readAdb(serial, ...args) {
  return readCommand(ADB, ['-s', serial, ...args]);
}

export function simctl(...args) {
  return runCommand('xcrun', ['simctl', ...args]);
}

function simulatorScreenshot(udid) {
  const dir = mkdtempSync(join(tmpdir(), 'device-parity-shot-'));
  const file = join(dir, 'shot.png');
  try {
    execFileSync('xcrun', ['simctl', 'io', udid, 'screenshot', '--type=png', file], {
      stdio: 'ignore',
    });
    return readFileSync(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function adbScreenshot(serial) {
  return execFileSync(ADB, ['-s', serial, 'exec-out', 'screencap', '-p'], {
    maxBuffer: COMMAND_OUTPUT_LIMIT_BYTES,
  });
}

// Simulator and Android screens only: a physical iPad has no host screenshot path here.
export function screenshot(platform, device) {
  return platform === 'ios' ? simulatorScreenshot(device) : adbScreenshot(device);
}

export function writeScreenshot(platform, device, file) {
  writeFileSync(file, screenshot(platform, device));
}

function launchableActivity(serial, pkg) {
  const lines = adb(serial, 'shell', 'cmd', 'package', 'resolve-activity', '--brief', pkg)
    .trim()
    .split('\n');
  return lines.at(-1).trim();
}

export function startAndroidApp(serial, pkg) {
  adb(serial, 'shell', 'am', 'start', '-n', launchableActivity(serial, pkg));
}

export function relaunchAndroidApp(serial, pkg) {
  adb(serial, 'shell', 'am', 'force-stop', pkg);
  startAndroidApp(serial, pkg);
}

export function relaunchSimulatorApp(udid, bundleId) {
  simctl('launch', '--terminate-running-process', udid, bundleId);
}

export function relaunchIosDeviceApp(udid, bundleId) {
  runCommand('xcrun', [
    'devicectl',
    'device',
    'process',
    'launch',
    '--device',
    udid,
    '--terminate-existing',
    bundleId,
  ]);
}

// Back on the app's root screen leaves the app, and every later input then lands on whatever is in
// front of it. No key path here sends it; the one slice whose subject is Back calls sendSystemBack.
const SYSTEM_BACK_KEYS = new Set(['KEYCODE_BACK', '4']);

export function sendAndroidKey(serial, keycode) {
  if (SYSTEM_BACK_KEYS.has(String(keycode))) {
    throw new Error('Refusing KEYCODE_BACK: Back is sent only by a slice that tests Back');
  }
  adb(serial, 'shell', 'input', 'keyevent', keycode);
}

export function sendAndroidKeyCombination(serial, ...keycodes) {
  if (keycodes.some((keycode) => SYSTEM_BACK_KEYS.has(String(keycode)))) {
    throw new Error('Refusing KEYCODE_BACK: Back is sent only by a slice that tests Back');
  }
  adb(serial, 'shell', 'input', 'keycombination', ...keycodes);
}

export function sendSystemBack(serial) {
  adb(serial, 'shell', 'input', 'keyevent', 'KEYCODE_BACK');
}
