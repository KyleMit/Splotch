// One-shot iOS smoke test of the React Native app. Builds the store-identity
// Release simulator app, boots an iPhone simulator no one else has booted,
// installs the app, runs the Maestro smoke flow, then shuts that simulator down.
// This is `npm run test:ios`; the deploy workflow passes --skip-build after
// building the same app in its own step.
//
// A simulator that is already booted belongs to whoever booted it, so it is
// never reused, installed to, or shut down.
//
// It's just simulator-lifecycle glue: Maestro does the actual assertions (the
// shared flow in ../lib/mobile-smoke-test.mjs — the same one the Android smoke runs).
//
// Requires macOS with full Xcode (simulators ship with it), CocoaPods, and Maestro.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { ROOT, fail, isMain, runMain, sh } from '../../lib/proc.mjs';
import { RELEASE_SIMULATOR_APP } from '../../release/build-native-release.mjs';
import { runIosSmokeWithDiagnostics } from './lib/smoke-diagnostics.mjs';

const execFileAsync = promisify(execFile);
const SIMCTL_MAX_BUFFER_BYTES = 16 * 1024 * 1024;
export const SKIP_BUILD_FLAG = '--skip-build';
const BUILD_SIMULATOR_APP = 'node tools/release/build-native-release.mjs simulator';

const simctl = async (...args) =>
  (await execFileAsync('xcrun', ['simctl', ...args], { maxBuffer: SIMCTL_MAX_BUFFER_BYTES }))
    .stdout;

export function parseArgs(args) {
  const unsupported = args.filter((arg) => arg !== SKIP_BUILD_FLAG);
  if (unsupported.length > 0) throw new Error(`Unknown argument: ${unsupported[0]}`);
  return { skipBuild: args.includes(SKIP_BUILD_FLAG) };
}

// Command Line Tools alone has no simctl, so only full Xcode passes.
async function requireXcode() {
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
}

// `devices` is `simctl list devices available --json`'s map of runtime to devices.
export function pickShutdownIphone(devices) {
  const iphones = Object.entries(devices)
    .filter(([runtime]) => runtime.includes('iOS'))
    .sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true }))
    .flatMap(([, list]) => list.filter((device) => device.name.includes('iPhone')));
  if (iphones.length === 0)
    throw new Error('No iPhone simulators available — open Xcode once so it installs an iOS runtime.');
  const device = iphones.find(({ state }) => state === 'Shutdown');
  if (!device)
    throw new Error(
      'Every available iPhone simulator is already booted, and a booted one belongs to another run. Shut one down or create another, then retry.'
    );
  return device;
}

// The generic simulator destination needs no booted device, so the build runs
// before this run holds one.
export async function runIosSmokeTest(args = process.argv.slice(2)) {
  const { skipBuild } = parseArgs(args);
  await requireXcode();
  if (!skipBuild) await sh(BUILD_SIMULATOR_APP);
  const { devices } = JSON.parse(await simctl('list', 'devices', 'available', '--json'));
  const device = pickShutdownIphone(devices);
  console.log(`Booting simulator: ${device.name} (${device.udid})`);
  try {
    await simctl('bootstatus', device.udid, '-b');
    await simctl('install', device.udid, join(ROOT, RELEASE_SIMULATOR_APP));
    await runIosSmokeWithDiagnostics(device.udid);
  } finally {
    console.log(`Shutting down ${device.name}`);
    // A shutdown that fails must not replace the smoke's own failure.
    await simctl('shutdown', device.udid).catch((error) =>
      console.warn(`Could not shut down ${device.udid}:`, error.message)
    );
  }
  console.log('\nSmoke test passed.');
}

if (isMain(import.meta.url)) runMain(runIosSmokeTest);
