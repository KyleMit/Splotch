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
import { promisify } from 'node:util';
import { join } from 'node:path';
import { ROOT, fail, sh } from '../../lib/proc.mjs';
import { runMaestroSmoke } from '../lib/mobile-smoke-test.mjs';

const execFileAsync = promisify(execFile);
const SKIP_SYNC_FLAG = '--skip-sync';

const args = process.argv.slice(2);
const unsupportedArgs = args.filter((arg) => arg !== SKIP_SYNC_FLAG);
if (unsupportedArgs.length > 0) fail(`Unknown argument: ${unsupportedArgs[0]}`);
const skipSync = args.includes(SKIP_SYNC_FLAG);

const simctl = async (...args) =>
  (await execFileAsync('xcrun', ['simctl', ...args], { maxBuffer: 16 * 1024 * 1024 })).stdout;

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
const iphones = Object.entries(devices)
  .filter(([runtime]) => runtime.includes('iOS'))
  .sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true })) // newest runtime first
  .flatMap(([, list]) => list.filter((d) => d.name.includes('iPhone')));

let device = iphones.find((d) => d.state === 'Booted');
const bootedByUs = !device;
if (bootedByUs) {
  device = iphones[0];
  if (!device)
    fail('No iPhone simulators available — open Xcode once so it installs an iOS runtime.');
  console.log(`Booting simulator: ${device.name} (${device.udid})`);
  await simctl('bootstatus', device.udid, '-b'); // boots the device and blocks until ready
} else {
  console.log(`Reusing booted simulator: ${device.name} (${device.udid})`);
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
