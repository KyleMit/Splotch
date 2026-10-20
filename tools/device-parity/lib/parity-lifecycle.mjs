// Install, launch, appearance, and orientation for a parity arm on a simulator or emulator.
import { display0Orientation, readDisplays } from './android-display.mjs';
import { adb, simctl } from './device-commands.mjs';

const TERMINATE_SETTLE_MS = 500;
const IOS_ROTATION_SETTLE_MS = 1200;
const EMULATOR_ROTATE_SETTLE_MS = 1500;
const EMULATOR_ROTATED_SETTLE_MS = 800;
const EMULATOR_ROTATIONS_MAX = 4;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ignoreFailure = (step) => {
  try {
    step();
  } catch {
    // The app may not be installed or running yet; the next step proves the state it needs.
  }
};

export function freshInstall({ platform, device, arm }) {
  if (platform === 'ios') {
    ignoreFailure(() => simctl('terminate', device, arm.bundleId));
    ignoreFailure(() => simctl('uninstall', device, arm.bundleId));
    simctl('install', device, arm.ios.app);
    return;
  }
  ignoreFailure(() => adb(device, 'uninstall', arm.bundleId));
  adb(device, 'install', '-r', arm.android.apk);
}

export async function launchArm({ session, platform, device, arm }) {
  if (platform === 'ios') await session.exec('mobile: launchApp', { bundleId: arm.bundleId });
  else adb(device, 'shell', 'am', 'start', '-W', '-n', arm.android.activity);
}

export async function terminateArm({ session, platform, device, arm }) {
  if (platform === 'ios') {
    await session.exec('mobile: terminateApp', { bundleId: arm.bundleId }).catch(() => {});
  } else {
    adb(device, 'shell', 'am', 'force-stop', arm.bundleId);
  }
  await sleep(TERMINATE_SETTLE_MS);
}

export function setAppearance({ platform, device, theme }) {
  if (platform === 'ios') simctl('ui', device, 'appearance', theme);
  else adb(device, 'shell', 'cmd', 'uimode', 'night', theme === 'dark' ? 'yes' : 'no');
}

export function androidDisplayState(device) {
  return display0Orientation(readDisplays(device));
}

// Android's Auto orientation follows the device sensor, which ignores a UiAutomator display
// rotation, so the emulator console turns the virtual sensor instead. A pinned landscape rotation
// keeps the camera cutout on the same side for both arms of a pair.
export async function setDeviceOrientation({
  session,
  platform,
  device,
  orientation,
  landscapeRotation,
}) {
  if (platform === 'ios') {
    await session.setOrientation(orientation === 'landscape' ? 'LANDSCAPE' : 'PORTRAIT');
    await sleep(IOS_ROTATION_SETTLE_MS);
    return;
  }
  const wanted = (rotation) => {
    if (orientation !== 'landscape') return rotation === 0;
    return landscapeRotation === undefined ? rotation % 2 === 1 : rotation === landscapeRotation;
  };
  const rotation = () => androidDisplayState(device).rotation;
  for (let turn = 0; turn < EMULATOR_ROTATIONS_MAX && !wanted(rotation()); turn += 1) {
    adb(device, 'emu', 'rotate');
    await sleep(EMULATOR_ROTATE_SETTLE_MS);
  }
  if (!wanted(rotation())) throw new Error(`could not reach ${orientation}`);
  await sleep(EMULATOR_ROTATED_SETTLE_MS);
}

// "iOS 26.5 simulator" from simctl's runtime key; "Android API 34 emulator" from the device.
export function runtimeLabel(platform, device) {
  if (platform === 'android') {
    return `Android API ${adb(device, 'shell', 'getprop', 'ro.build.version.sdk').trim()} emulator`;
  }
  const { devices } = JSON.parse(simctl('list', 'devices', '--json'));
  const runtime = Object.keys(devices).find((key) =>
    devices[key].some((candidate) => candidate.udid === device)
  );
  const version = runtime?.match(/SimRuntime\.(\w+)-([\d-]+)$/);
  return version ? `${version[1]} ${version[2].replaceAll('-', '.')} simulator` : 'iOS simulator';
}
