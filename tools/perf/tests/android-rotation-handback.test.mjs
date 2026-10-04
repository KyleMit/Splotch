import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tryCaptureCalls = [];
// The phone's system settings: `settings get` answers `null` for one never
// written, as a device does, and `put` and `delete` change what it answers.
const phoneSettings = new Map();
// Setting name → how many more of its writes fail.
const failingWrites = new Map();

function phoneAnswer(args) {
  const [, , , , verb, , key, value] = args;
  if (verb === 'get') return `${phoneSettings.get(key) ?? 'null'}\n`;
  if (verb === 'put') phoneSettings.set(key, value);
  if (verb === 'delete') phoneSettings.delete(key);
  return '';
}

vi.mock('../../lib/proc.mjs', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    capture: (_cmd, args) => phoneAnswer(args),
    tryCapture: (cmd, args) => {
      tryCaptureCalls.push([cmd, ...args].join(' '));
      const key = args[6];
      if (failingWrites.get(key) > 0) {
        failingWrites.set(key, failingWrites.get(key) - 1);
        return { ok: false, stdout: '', stderr: 'device offline\n' };
      }
      return { ok: true, stdout: phoneAnswer(args), stderr: '' };
    },
  };
});

const { armAndroidRotationHandBack } =
  await import('../split-capture/lib/android-rotation-handback.mjs');

// Auto-rotate on and user_rotation never written: one setting to put back, one
// to delete, and the capture's own writes standing in between.
const AS_FOUND = { accelerometer_rotation: '1' };
const TURNED = { accelerometer_rotation: '0', user_rotation: '1' };
const turnPhone = () => {
  for (const [key, value] of Object.entries(TURNED)) phoneSettings.set(key, value);
};

describe('the Android rotation hand-back', () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries(AS_FOUND)) phoneSettings.set(key, value);
  });

  afterEach(() => {
    tryCaptureCalls.length = 0;
    phoneSettings.clear();
    failingWrites.clear();
    vi.restoreAllMocks();
  });

  it('puts back exactly what it read, deleting a setting never written', () => {
    const handBack = armAndroidRotationHandBack('SERIAL');
    turnPhone();

    handBack.release();

    expect(handBack.previous).toEqual({ accelerometer_rotation: '1', user_rotation: 'null' });
    expect(tryCaptureCalls).toEqual([
      'adb -s SERIAL shell settings put system accelerometer_rotation 1',
      'adb -s SERIAL shell settings delete system user_rotation',
    ]);
    expect(Object.fromEntries(phoneSettings)).toEqual(AS_FOUND);
  });

  // The tools fail through process.exit, which runs exit listeners and skips
  // every finally, so the exit hook has to be the release itself.
  it('is armed on exit and hands back once, leaving no listener behind', () => {
    const before = process.listeners('exit');
    const handBack = armAndroidRotationHandBack('SERIAL');
    const added = process.listeners('exit').filter((listener) => !before.includes(listener));
    turnPhone();

    added[0]?.(1);
    handBack.release();

    expect(added).toEqual([handBack.release]);
    expect(tryCaptureCalls).toHaveLength(2);
    expect(Object.fromEntries(phoneSettings)).toEqual(AS_FOUND);
    expect(process.listeners('exit')).toEqual(before);
  });

  it('puts one setting back even when the other cannot be, naming what was left', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    failingWrites.set('accelerometer_rotation', 2);
    const handBack = armAndroidRotationHandBack('SERIAL');
    turnPhone();

    expect(() => handBack.release()).not.toThrow();

    expect(phoneSettings.has('user_rotation')).toBe(false);
    expect(warn.mock.calls).toEqual([
      [
        'could not settings put system accelerometer_rotation 1 on SERIAL (device offline) — ' +
          'put the rotation back by hand before the next capture',
      ],
    ]);
  });

  it('tries a failed write once more before giving up on it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    failingWrites.set('accelerometer_rotation', 1);
    const handBack = armAndroidRotationHandBack('SERIAL');
    turnPhone();

    handBack.release();

    expect(Object.fromEntries(phoneSettings)).toEqual(AS_FOUND);
    expect(warn).not.toHaveBeenCalled();
  });
});

// The exit path itself: a launch step that fails AFTER the rotation writes
// exits the process through capture() → fail(), which no in-process test can
// take. Each tool runs in a child with a stand-in `adb` first on PATH that logs
// every call, answers like a phone with auto-rotate on and user_rotation never
// written, and fails `am start`.
const FAKE_ADB = `#!/bin/sh
shift 2
printf '%s\\n' "$*" >> "$FAKE_ADB_LOG"
case "$*" in
  'shell settings get system accelerometer_rotation') echo 1 ;;
  'shell settings get system user_rotation') echo null ;;
  'shell am start '*) echo 'Error: Activity not started' >&2; exit 1 ;;
esac
exit 0
`;

// Each tool waits out its own APP_STOP_SETTLE_MS and ROTATION_SETTLE_MS before
// the launch step fails, so a run takes seconds; the budget is several times
// the measured run.
const CHILD_EXIT_TIMEOUT_MS = 30_000;
const CHILD_TEST_TIMEOUT_MS = CHILD_EXIT_TIMEOUT_MS + 5_000;

const moduleUrl = (path) => JSON.stringify(new URL(path, import.meta.url).href);

const VERIFIER_RUN = `
  import { verifyAndroidRotation } from ${moduleUrl('../split-capture/verify-android-rotation.mjs')};
  await verifyAndroidRotation({ serial: 'FAKESERIAL', port: 0 });
`;

// The floor control is the probe host here because a hand capture holds its
// page to an identity check, and the floor's needs no build.
const HAND_CAPTURE_RUN = `
  import { captureHandInput } from ${moduleUrl('../split-capture/capture-hand-input.mjs')};
  import { createFloorControlHost } from ${moduleUrl('../split-capture/serve-floor-control.mjs')};
  const { server } = createFloorControlHost({ log: () => {} });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  await captureHandInput({
    platform: 'android',
    opener: 'adb',
    serial: 'FAKESERIAL',
    nativeApp: false,
    host: 'http://127.0.0.1:' + server.address().port,
    brush: 'pen',
    theme: 'light',
    orientation: 'LANDSCAPE',
    seconds: 1,
  });
`;

describe('a launch step that exits the process still hands the rotation back', () => {
  let fixtureDir;

  beforeEach(() => {
    fixtureDir = mkdtempSync(join(tmpdir(), 'splotch-rotation-handback-'));
    writeFileSync(join(fixtureDir, 'adb'), FAKE_ADB, { mode: 0o755 });
  });

  afterEach(() => {
    rmSync(fixtureDir, { recursive: true, force: true });
  });

  function runAgainstFakeAdb(source) {
    const log = join(fixtureDir, 'adb.log');
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
      encoding: 'utf8',
      timeout: CHILD_EXIT_TIMEOUT_MS,
      env: {
        ...process.env,
        PATH: `${fixtureDir}:${process.env.PATH}`,
        // An SDK path with no adb in it, so nothing reaches a real device.
        ANDROID_HOME: join(fixtureDir, 'no-android-sdk'),
        FAKE_ADB_LOG: log,
      },
    });
    const calls = readFileSync(log, 'utf8').trim().split('\n');
    return { result, calls };
  }

  const settingsTraffic = (calls) => calls.filter((call) => call.startsWith('shell settings '));

  it.each([
    ['the rotation verifier', VERIFIER_RUN],
    ['the hand capture', HAND_CAPTURE_RUN],
  ])(
    '%s',
    (_tool, source) => {
      const { result, calls } = runAgainstFakeAdb(source);
      const launch = calls.findIndex((call) => call.startsWith('shell am start '));

      expect(result.status, result.stderr).toBe(1);
      expect(result.stderr).toContain('adb failed (exit 1)');
      expect(settingsTraffic(calls.slice(0, launch))).toEqual([
        'shell settings get system accelerometer_rotation',
        'shell settings get system user_rotation',
        'shell settings put system accelerometer_rotation 0',
        'shell settings put system user_rotation 1',
      ]);
      expect(settingsTraffic(calls.slice(launch + 1))).toEqual([
        'shell settings put system accelerometer_rotation 1',
        'shell settings delete system user_rotation',
      ]);
    },
    CHILD_TEST_TIMEOUT_MS
  );
});
