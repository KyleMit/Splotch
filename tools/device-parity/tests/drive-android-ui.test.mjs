import { beforeEach, describe, expect, it, vi } from 'vitest';
import { driveAndroidUi } from '../drive-android-ui.mjs';

// Every adb call lands on this spy, so no test here reaches a device.
const { execFileSync } = vi.hoisted(() => ({ execFileSync: vi.fn() }));
vi.mock('node:child_process', () => ({ execFileSync, spawn: vi.fn() }));

const SERIAL = 'emulator-0000';
const APP = 'art.example.app';
const LAUNCHER = 'com.example.launcher';
const displaysFocusing = (pkg) => `  Display: mDisplayId=0 (organized)
    mCurrentFocus=Window{bb22 u0 ${pkg}/${pkg}.MainActivity}
`;
const keyevents = () =>
  execFileSync.mock.calls
    .map(([, args]) => args)
    .filter((args) => args.includes('keyevent'))
    .map((args) => args.at(-1));

let focused;

beforeEach(() => {
  focused = APP;
  execFileSync.mockReset();
  execFileSync.mockImplementation((_, args) => {
    if (args.includes('dumpsys')) return displaysFocusing(focused);
    if (args.includes('KEYCODE_HOME')) focused = LAUNCHER;
    return '';
  });
});

describe('driveAndroidUi keys', () => {
  it('sends every key while the app keeps Display0’s focus', () => {
    driveAndroidUi({
      serial: SERIAL,
      bundleId: APP,
      command: 'keys',
      args: ['KEYCODE_A', 'KEYCODE_B'],
    });

    expect(keyevents()).toEqual(['KEYCODE_A', 'KEYCODE_B']);
  });

  it('stops at the key after one that moved focus off the app', () => {
    const run = () =>
      driveAndroidUi({
        serial: SERIAL,
        bundleId: APP,
        command: 'keys',
        args: ['KEYCODE_HOME', 'KEYCODE_A'],
      });

    expect(run).toThrow(`foreground: Window{bb22 u0 ${LAUNCHER}/${LAUNCHER}.MainActivity}`);
    expect(keyevents()).toEqual(['KEYCODE_HOME']);
  });
});
