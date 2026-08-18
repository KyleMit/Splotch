// One-shot local iOS smoke test. Boots a simulator (or reuses one that is
// already booted), builds + installs the debug app, runs the Maestro smoke
// flow, then shuts the simulator down if this script booted it. This is
// `npm run test:ios`.
//
// It's just simulator-lifecycle glue: Maestro does the actual assertions (the
// shared flow in ../lib/mobile-smoke-test.mjs — the same one the Android smoke runs).
//
// Requires macOS with full Xcode (simulators ship with it) and Maestro.

import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { ROOT, fail, sh } from '../../lib/proc.mjs';
import { runMaestroSmoke } from '../lib/mobile-smoke-test.mjs';
import {
  IOS_RUNTIME_VERSION_PATTERN,
  selectIphoneSimulator,
} from './lib/ios-simulator-runtime.mjs';

const execFileAsync = promisify(execFile);
const SIMCTL_MAX_BUFFER_BYTES = 16 * 1024 * 1024;

let values;
try {
  ({ values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      'skip-sync': { type: 'boolean' },
      runtime: { type: 'string' },
    },
    strict: true,
  }));
} catch (error) {
  fail(error.message);
}
const skipSync = values['skip-sync'];
const requestedRuntime = values.runtime;
if (requestedRuntime && !IOS_RUNTIME_VERSION_PATTERN.test(requestedRuntime)) {
  fail(`Invalid iOS runtime "${requestedRuntime}". Expected a major.minor version such as 16.4.`);
}

const simctl = async (...args) =>
  (await execFileAsync('xcrun', ['simctl', ...args], { maxBuffer: SIMCTL_MAX_BUFFER_BYTES })).stdout;

// 1. Preflight: macOS with full Xcode (Command Line Tools alone has no simctl).
if (process.platform !== 'darwin')
  fail('test:ios needs macOS — Xcode and the iOS simulators are Mac-only.');
try {
  await execFileAsync('xcodebuild', ['-version']);
} catch {
  fail(
    'xcodebuild is not usable. Install full Xcode from the App Store, then point the tools at it:\n' +
      '  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer'
  );
}

// 2. Pick a simulator: reuse a booted iPhone, else boot the newest available one.
const { devices } = JSON.parse(await simctl('list', 'devices', 'available', '--json'));
const device = selectIphoneSimulator(devices, requestedRuntime);
if (!device) {
  if (requestedRuntime) {
    fail(
      `No iPhone simulators available for iOS ${requestedRuntime}. Install that runtime before retrying.`
    );
  }
  fail('No iPhone simulators available — open Xcode once so it installs an iOS runtime.');
}
const bootedByUs = device.state !== 'Booted';
if (bootedByUs) {
  console.log(`Booting simulator: ${device.name} (${device.udid}, ${device.runtime})`);
  await simctl('bootstatus', device.udid, '-b'); // boots the device and blocks until ready
} else {
  console.log(`Reusing booted simulator: ${device.name} (${device.udid}, ${device.runtime})`);
}

// 3. Build + install, run the flow, and shut down anything we started.
const APP_DIR = join(ROOT, 'ios', 'App');
const APP_PATH = join(APP_DIR, 'build', 'Build', 'Products', 'Debug-iphonesimulator', 'App.app');

try {
  if (!skipSync) await sh('npm run cap:sync');
  await sh(
    `xcodebuild -scheme App -configuration Debug -destination "id=${device.udid}" -derivedDataPath build build`,
    APP_DIR
  );
  await simctl('install', device.udid, APP_PATH);
  await runMaestroSmoke({ device: device.udid });
} finally {
  if (bootedByUs) {
    console.log(`Shutting down ${device.name}`);
    await simctl('shutdown', device.udid);
  }
}

console.log('\nSmoke test passed.');
