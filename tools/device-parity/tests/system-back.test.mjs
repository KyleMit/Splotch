import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendAndroidKey, sendAndroidKeyCombination } from '../lib/device-commands.mjs';
import { createParityDriver } from '../lib/parity-driver.mjs';

// Every adb call lands on this spy, so no test here reaches a device.
const { execFileSync } = vi.hoisted(() => ({ execFileSync: vi.fn() }));
vi.mock('node:child_process', () => ({ execFileSync, spawn: vi.fn() }));

const SERIAL = 'emulator-0000';
const APP = 'art.example.app';
const DISPLAYS = `  Display: mDisplayId=0 (organized)
    mCurrentFocus=Window{bb22 u0 ${APP}/${APP}.MainActivity}
`;
const keyevents = () =>
  execFileSync.mock.calls
    .map(([, args]) => args)
    .filter((args) => args.includes('keyevent'))
    .map((args) => args.at(-1));

beforeEach(() => {
  execFileSync.mockReset();
  execFileSync.mockImplementation((_, args) => (args.includes('dumpsys') ? DISPLAYS : ''));
});

describe('incidental Android keys', () => {
  it('send an ordinary key', () => {
    sendAndroidKey(SERIAL, 'KEYCODE_HOME');

    expect(keyevents()).toEqual(['KEYCODE_HOME']);
  });

  it.each(['KEYCODE_BACK', '4'])('refuse %s before reaching adb', (keycode) => {
    expect(() => sendAndroidKey(SERIAL, keycode)).toThrow(/Refusing KEYCODE_BACK/);
    expect(() => sendAndroidKeyCombination(SERIAL, 'KEYCODE_CTRL_LEFT', keycode)).toThrow(
      /Refusing KEYCODE_BACK/
    );
    expect(execFileSync).not.toHaveBeenCalled();
  });
});

describe('parity driver Back', () => {
  const session = {
    platform: 'android',
    device: SERIAL,
    exec: vi.fn(async () => APP),
  };
  const arm = { bundleId: APP, aliases: {} };

  it('is refused for a slice that does not test Back', async () => {
    const driver = createParityDriver({ session, arm, density: 1, onNote: vi.fn() });

    await expect(driver.back()).rejects.toThrow(
      'Back is sent only by a slice whose subject is Back'
    );
    expect(keyevents()).toEqual([]);
  });

  it('is sent, after the foreground check, for the slice that tests Back', async () => {
    const driver = createParityDriver({
      session,
      arm,
      density: 1,
      allowSystemBack: true,
      onNote: vi.fn(),
    });

    await driver.back();

    expect(keyevents()).toEqual(['KEYCODE_BACK']);
    expect(driver.inputs.map((input) => input.key)).toEqual(['BACK']);
  });
});
