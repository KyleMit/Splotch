// Capabilities for the Appium runners' sessions. An Android serial read as an
// XCUITest udid fails every cell with "Unknown device or simulator UDID" (issue
// 2341), so an Android native target gets a UiAutomator2 set built from its
// serial: the hand-written file the issue-2268 and issue-2225 native action
// sweeps were captured with.
import { readFileSync } from 'node:fs';
import { tryCapture } from '../../lib/proc.mjs';
import { ANDROID_NATIVE_PACKAGE } from './campaign-plan.mjs';

export const ANDROID_PLATFORM = 'android';
export const DEFAULT_APPIUM_URL = 'http://127.0.0.1:4723';

const ANDROID_NATIVE_ACTIVITY = '.MainActivity';
const NEW_COMMAND_TIMEOUT_SECONDS = 600;
// Off the driver's defaults (8200 and 9515) — the ports every other UiAutomator2
// session on this host reaches for first — and equal to the values the proven
// native sweeps ran with. A `--capabilities-file` overrides them.
const UIAUTOMATOR2_SYSTEM_PORT = 8262;
const UIAUTOMATOR2_CHROMEDRIVER_PORT = 9562;

// The driver accepts either name and reads it from the Appium SERVER's
// environment, never the client's.
const ANDROID_SDK_ENVIRONMENT_NAMES = ['ANDROID_HOME', 'ANDROID_SDK_ROOT'];
// Any process environment carries these, so their absence means the listing held
// no environment at all (another user's process, a restricted ps) rather than an
// environment that lacks the SDK variables.
const ENVIRONMENT_WITNESS_NAMES = ['PATH', 'HOME'];
const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

export function uiAutomator2Capabilities({ deviceId }) {
  return {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:udid': deviceId,
    'appium:appPackage': ANDROID_NATIVE_PACKAGE,
    'appium:appActivity': ANDROID_NATIVE_ACTIVITY,
    // The campaign installs the marked build itself; a reset would uninstall it.
    'appium:noReset': true,
    'appium:newCommandTimeout': NEW_COMMAND_TIMEOUT_SECONDS,
    'appium:systemPort': UIAUTOMATOR2_SYSTEM_PORT,
    'appium:chromedriverPort': UIAUTOMATOR2_CHROMEDRIVER_PORT,
  };
}

// Accepts a bare capability object or either W3C wrapper around one.
export function capabilitiesFromFile(path) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  return parsed.capabilities?.alwaysMatch ?? parsed.alwaysMatch ?? parsed;
}

const capabilityValue = (capabilities, name) =>
  capabilities?.[name] ?? capabilities?.[`appium:${name}`];

export function androidCapabilitiesProblem(capabilities) {
  const platformName = String(capabilityValue(capabilities, 'platformName') ?? '');
  const automationName = String(capabilityValue(capabilities, 'automationName') ?? '');
  if (
    platformName.toLowerCase() === ANDROID_PLATFORM &&
    automationName.toLowerCase() === 'uiautomator2'
  ) {
    return null;
  }
  return (
    `an Android native target needs a UiAutomator2 session, but these capabilities ask for ` +
    `platformName "${platformName || 'unset'}" with automationName "${automationName || 'unset'}". ` +
    'Drop the --capabilities-file and pass --device-id=<serial> to build the UiAutomator2 set, ' +
    'or fix the file.'
  );
}

export function androidSdkEnvironmentState(environmentEntries) {
  const values = new Map(
    environmentEntries.map((entry) => {
      const separator = entry.indexOf('=');
      return [entry.slice(0, separator), entry.slice(separator + 1)];
    })
  );
  if (!ENVIRONMENT_WITNESS_NAMES.some((name) => values.has(name))) return 'unreadable';
  return ANDROID_SDK_ENVIRONMENT_NAMES.some((name) => values.get(name)) ? 'present' : 'missing';
}

// macOS prints a process's environment after its command line with `ps -E`;
// entries are whitespace-separated there, which is lossless for the names this
// reads even when a value contains a space.
function processEnvironmentEntries(pid) {
  if (process.platform === 'linux') {
    const environ = tryCapture('cat', [`/proc/${pid}/environ`]);
    return environ.ok ? environ.stdout.split('\0').filter(Boolean) : [];
  }
  const listing = tryCapture('ps', ['-E', '-ww', '-o', 'command=', '-p', String(pid)]);
  return listing.ok
    ? listing.stdout.split(/\s+/).filter((token) => /^[A-Z_][A-Z0-9_]*=/.test(token))
    : [];
}

function listenerPid(port) {
  const listing = tryCapture('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN']);
  const pid = listing.ok ? listing.stdout.trim().split('\n')[0] : '';
  return /^\d+$/.test(pid) ? pid : null;
}

function appiumPort(url) {
  if (url.port) return url.port;
  return url.protocol === 'https:' ? '443' : '80';
}

// Every UiAutomator2 session fails on a server started without the SDK
// variables, so a campaign that did not check first spent each cell's every
// attempt on the same refusal (issue 2341). Only a loopback server's process
// can be read; anything else is 'unknown', which warns rather than refuses.
// `pidFor` and `environmentOf` are seams kept for tests.
export function appiumAndroidSdkState(
  appiumUrl,
  { pidFor = listenerPid, environmentOf = processEnvironmentEntries } = {}
) {
  const url = new URL(appiumUrl);
  if (!LOOPBACK_HOSTNAMES.has(url.hostname)) return 'unknown';
  const pid = pidFor(appiumPort(url));
  if (!pid) return 'unknown';
  const state = androidSdkEnvironmentState(environmentOf(pid));
  return state === 'unreadable' ? 'unknown' : state;
}

export function appiumAndroidSdkMessage(appiumUrl, state) {
  if (state === 'missing') {
    return (
      `the Appium server at ${appiumUrl} was started without ANDROID_HOME (or ANDROID_SDK_ROOT), ` +
      'so every UiAutomator2 session would fail before it starts. The driver reads it from the ' +
      "server's environment, not this one: restart that Appium with ANDROID_HOME exported."
    );
  }
  if (state === 'unknown') {
    return (
      `could not read the environment of the Appium server at ${appiumUrl}; UiAutomator2 needs ` +
      'it started with ANDROID_HOME exported, or every Android cell fails before its session opens.'
    );
  }
  return null;
}
