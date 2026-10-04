import { spawn, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sh } from '../../../lib/proc.mjs';
import { FAKE_ANDROID_SERIAL } from '../../../perf/lib/device-identifiers.mjs';
import { runMaestroSmoke } from '../../lib/mobile-smoke-test.mjs';
import { ADB, ANDROID_DIR, AVD_NAME, EMULATOR, GRADLEW } from '../lib/android-toolchain.mjs';
import {
  emulatorArgs,
  emulatorSerial,
  pickConsolePort,
  runAndroidSmokeTest,
} from '../run-smoke-test.mjs';

const desk = vi.hoisted(() => ({ execFileAsync: vi.fn(), busyPorts: new Set() }));

// run-smoke-test.mjs calls promisify(execFile), which Node answers with
// execFile[promisify.custom]; the double supplies that form, resolving { stdout, stderr }.
vi.mock('node:child_process', async (importOriginal) => {
  const { promisify } = await import('node:util');
  const execFile = Object.assign(vi.fn(), { [promisify.custom]: desk.execFileAsync });
  return { ...(await importOriginal()), execFile, spawn: vi.fn() };
});
vi.mock('../../../lib/net.mjs', () => ({
  portIsFree: async (port) => !desk.busyPorts.has(port),
}));
vi.mock('../../../lib/proc.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  sh: vi.fn(),
}));
vi.mock('../../lib/mobile-smoke-test.mjs', () => ({ runMaestroSmoke: vi.fn() }));

// `npm run android:boot` already has emulator-5554 open, and a phone is plugged in.
const OPEN_EMULATOR_PORTS = [5554, 5555];
const OCCUPIED_DESK = `List of devices attached\nemulator-5554\tdevice\n${FAKE_ANDROID_SERIAL}\tdevice\n\n`;
const NEW_SERIAL = 'emulator-5556';
const NOTHING_LISTED = 'List of devices attached\n\n';

const answer = (stdout) => ({ stdout, stderr: '' });

function fakeEmulator() {
  return Object.assign(new EventEmitter(), {
    exitCode: null,
    signalCode: null,
    kill: vi.fn(),
    unref: vi.fn(),
  });
}

// As Node reports a child's exit: the code or signal is set before 'exit' fires.
function exitEmulator(emulator, [code, signal]) {
  Object.assign(emulator, { exitCode: code, signalCode: signal });
  emulator.emit('exit', code, signal);
}

// What the emulator binary and adb answer while the new emulator boots normally.
async function bootingDesk(file, args) {
  if (file === ADB && args[0] === 'devices') return answer(OCCUPIED_DESK);
  return answer(args.includes('getprop') ? '1\n' : '');
}

// The new emulator exits while adb waits for it to come online, and adb, waiting
// for a device that never appears, returns only when its call is aborted.
function exitingDesk(emulator, exit) {
  const waits = [];
  const answerCall = async (file, args, options) => {
    if (!args.includes('wait-for-device')) return bootingDesk(file, args);
    const { signal } = options;
    waits.push(signal);
    setImmediate(() => exitEmulator(emulator, exit));
    return new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason));
    });
  };
  return { answerCall, waits };
}

const adbCalls = () =>
  desk.execFileAsync.mock.calls.filter(([file]) => file === ADB).map(([, args]) => args);

// A port probe that reports `isBusy` ports taken and records every port it is asked about.
function recordingProbe(isBusy) {
  const probed = [];
  const probe = async (port) => {
    probed.push(port);
    return !isBusy(port);
  };
  return { probe, probed };
}

describe('emulatorArgs', () => {
  it('boots the AVD headless on the given console port', () => {
    expect(emulatorArgs(5556)).toEqual([
      '-avd',
      AVD_NAME,
      '-port',
      '5556',
      '-no-window',
      '-no-boot-anim',
      '-no-audio',
      '-no-snapshot-save',
      '-gpu',
      'swiftshader_indirect',
    ]);
  });
});

describe('emulatorSerial', () => {
  it('is the serial adb gives the emulator on that console port', () => {
    expect(emulatorSerial(5556)).toBe('emulator-5556');
  });
});

describe('pickConsolePort', () => {
  it('takes the first console port when it and its adb port are free', async () => {
    const { probe, probed } = recordingProbe(() => false);
    await expect(pickConsolePort({ adbDevices: NOTHING_LISTED, probe })).resolves.toBe(5554);
    expect(probed).toEqual([5554, 5555]);
  });

  it('skips a console port whose adb port is taken', async () => {
    const { probe, probed } = recordingProbe((port) => port === 5555);
    await expect(pickConsolePort({ adbDevices: NOTHING_LISTED, probe })).resolves.toBe(5556);
    expect(probed).toEqual([5554, 5555, 5556, 5557]);
  });

  it('skips a console port whose emulator adb already lists, though its ports read free', async () => {
    const { probe, probed } = recordingProbe(() => false);
    const adbDevices = 'List of devices attached\nemulator-5554\toffline\n\n';
    await expect(pickConsolePort({ adbDevices, probe })).resolves.toBe(5556);
    expect(probed).toEqual([5556, 5557]);
  });

  it('fails once every console port the emulator accepts is taken', async () => {
    const { probe, probed } = recordingProbe(() => true);
    await expect(pickConsolePort({ adbDevices: NOTHING_LISTED, probe })).rejects.toThrow(
      new Error(
        'No free emulator console port: every even port from 5554 to 5584 is in use, has its adb port (the port above it) in use, or is already listed by adb devices. Shut an emulator down and retry.'
      )
    );
    // `emulator -help-port`: the console port is an even integer from 5554 to 5584.
    expect(probed).toEqual(Array.from({ length: 16 }, (_, index) => 5554 + 2 * index));
  });
});

describe('runAndroidSmokeTest', () => {
  beforeEach(() => {
    desk.busyPorts = new Set(OPEN_EMULATOR_PORTS);
    sh.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('boots, installs to, tests, and shuts down only the emulator it starts', async () => {
    const emulator = fakeEmulator();
    spawn.mockReturnValue(emulator);
    desk.execFileAsync.mockImplementation(bootingDesk);

    await runAndroidSmokeTest();

    expect(spawn).toHaveBeenCalledExactlyOnceWith(EMULATOR, emulatorArgs(5556), expect.any(Object));
    expect(adbCalls()).toEqual([
      ['devices'],
      ['-s', NEW_SERIAL, 'wait-for-device'],
      ['-s', NEW_SERIAL, 'shell', 'getprop', 'sys.boot_completed'],
      ['-s', NEW_SERIAL, 'emu', 'kill'],
    ]);
    expect(sh.mock.calls).toEqual([
      ['npm run cap:sync'],
      [`ANDROID_SERIAL=${NEW_SERIAL} "${GRADLEW}" :app:installDebug`, ANDROID_DIR],
    ]);
    expect(runMaestroSmoke).toHaveBeenCalledExactlyOnceWith({ device: NEW_SERIAL });
    expect(emulator.kill).not.toHaveBeenCalled();
  });

  it.each([
    ['exits with code 1', [1, null], 'exited with code 1'],
    ['exits with code 0', [0, null], 'exited with code 0'],
    ['is killed by a signal', [null, 'SIGKILL'], 'was stopped by SIGKILL'],
  ])('fails at once when the new emulator %s before it boots', async (_case, exit, how) => {
    const emulator = fakeEmulator();
    spawn.mockReturnValue(emulator);
    const { answerCall, waits } = exitingDesk(emulator, exit);
    desk.execFileAsync.mockImplementation(answerCall);

    await expect(runAndroidSmokeTest()).rejects.toThrow(
      new Error(
        `The emulator ${how} before it finished booting. ${AVD_NAME} may already be in use by another emulator (npm run android:boot): close that emulator and retry.`
      )
    );
    expect(waits.map((signal) => signal.aborted)).toEqual([true]);
    expect(adbCalls()).toEqual([['devices'], ['-s', NEW_SERIAL, 'wait-for-device']]);
    expect(emulator.kill).not.toHaveBeenCalled();
    expect(sh).not.toHaveBeenCalled();
    expect(runMaestroSmoke).not.toHaveBeenCalled();
  });

  it('kills only the process it spawned when the boot wait fails while that process runs', async () => {
    const emulator = fakeEmulator();
    spawn.mockReturnValue(emulator);
    const adbFailure = new Error('adb server went away');
    desk.execFileAsync.mockImplementation(async (file, args) => {
      if (args.includes('wait-for-device')) throw adbFailure;
      return bootingDesk(file, args);
    });

    await expect(runAndroidSmokeTest()).rejects.toBe(adbFailure);
    expect(emulator.kill).toHaveBeenCalledOnce();
    expect(adbCalls()).toEqual([['devices'], ['-s', NEW_SERIAL, 'wait-for-device']]);
    expect(sh).not.toHaveBeenCalled();
  });

  // Another emulator takes the console port between the probe and the spawn and
  // answers on the serial; this run's emulator, refused that port, exits later.
  it.each([
    ['while the app syncs', 'npm run cap:sync', [['npm run cap:sync']]],
    [
      'while the app installs',
      ':app:installDebug',
      [
        ['npm run cap:sync'],
        [`ANDROID_SERIAL=${NEW_SERIAL} "${GRADLEW}" :app:installDebug`, ANDROID_DIR],
      ],
    ],
  ])(
    'touches the serial no further once its own emulator exits %s',
    async (_case, exitingStep, shCalls) => {
      const emulator = fakeEmulator();
      spawn.mockReturnValue(emulator);
      desk.execFileAsync.mockImplementation(bootingDesk);
      sh.mockImplementation(async (command) => {
        if (command.includes(exitingStep)) exitEmulator(emulator, [1, null]);
      });

      await expect(runAndroidSmokeTest()).rejects.toThrow(
        new Error(
          `The emulator this run started has exited, so ${NEW_SERIAL} may belong to another emulator; the run stopped without touching it further.`
        )
      );
      expect(sh.mock.calls).toEqual(shCalls);
      expect(runMaestroSmoke).not.toHaveBeenCalled();
      expect(adbCalls()).toEqual([
        ['devices'],
        ['-s', NEW_SERIAL, 'wait-for-device'],
        ['-s', NEW_SERIAL, 'shell', 'getprop', 'sys.boot_completed'],
      ]);
      expect(emulator.kill).not.toHaveBeenCalled();
    }
  );
});

describe('run-smoke-test.mjs', () => {
  it('starts nothing when imported', () => {
    // An SDK folder holding no emulator or adb, so an import that did start the
    // smoke test could reach no device.
    const emptySdk = mkdtempSync(join(tmpdir(), 'no-android-sdk-'));
    try {
      const imported = spawnSync(
        process.execPath,
        ['--import', new URL('../run-smoke-test.mjs', import.meta.url).href, '--eval', ''],
        { encoding: 'utf8', env: { ...process.env, ANDROID_HOME: emptySdk } }
      );
      expect(imported).toMatchObject({ status: 0, stdout: '' });
    } finally {
      rmSync(emptySdk, { recursive: true, force: true });
    }
  });
});
