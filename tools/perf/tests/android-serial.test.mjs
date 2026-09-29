import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { requireCaptureSerial, selectAndroidSerial } from '../lib/android-serial.mjs';
import { FAKE_ANDROID_SERIAL } from '../lib/device-identifiers.mjs';
import { androidChecks } from '../prepare-capture.mjs';
import { releaseAndroid, releaseFailures } from '../release-capture.mjs';

const EMULATOR = 'emulator-5554';
const WEBVIEW_SESSION = join(import.meta.dirname, '..', 'android', 'capture-webview-session.mjs');
// The refusal lands before the first device step, so a run that gets further
// polls for a WebView socket for tens of seconds; this ends it first.
const WEBVIEW_REFUSAL_TIMEOUT_MS = 15_000;

const listing = (...rows) => ({
  ok: true,
  out: ['List of devices attached', ...rows].join('\n'),
  err: '',
});
const attached = (...serials) => listing(...serials.map((serial) => `${serial}\tdevice`));
const ADB_FAILED = { ok: false, out: '', err: 'spawnSync adb ENOENT' };

// Answers `adb devices` and nothing else by default: a device step aimed at a
// guess throws here instead of reaching a real adb.
function fakeAdb(devices, answers = {}) {
  const calls = [];
  const run = (command, args) => {
    const line = [command, ...args].join(' ');
    calls.push(line);
    if (line === 'adb devices') return devices;
    const answer = Object.entries(answers).find(([prefix]) => line.startsWith(prefix));
    if (!answer) throw new Error(`unexpected ${line}`);
    return answer[1];
  };
  return { run, calls };
}

describe('selectAndroidSerial', () => {
  it('takes the only attached device, or an explicit one that is attached', () => {
    expect(selectAndroidSerial(attached(FAKE_ANDROID_SERIAL), null).serial).toBe(
      FAKE_ANDROID_SERIAL
    );
    expect(selectAndroidSerial(attached(FAKE_ANDROID_SERIAL, EMULATOR), EMULATOR).serial).toBe(
      EMULATOR
    );
  });

  it('reports an empty rig as no device and no problem', () => {
    expect(selectAndroidSerial(attached(), null)).toEqual({ serial: null, attached: [] });
  });

  it('counts only devices adb can drive', () => {
    const rows = listing(`${FAKE_ANDROID_SERIAL}\tunauthorized`, `${EMULATOR}\tdevice`);
    expect(selectAndroidSerial(rows, null)).toEqual({ serial: EMULATOR, attached: [EMULATOR] });
    const offline = listing(`${EMULATOR}\tdevice`, `${FAKE_ANDROID_SERIAL}\toffline`, '');
    expect(selectAndroidSerial(offline, null).attached).toEqual([EMULATOR]);
  });

  it('refuses to guess between a phone and an emulator', () => {
    const pick = selectAndroidSerial(attached(FAKE_ANDROID_SERIAL, EMULATOR), null);
    expect(pick.serial).toBeNull();
    expect(pick.problem).toBe(
      `several devices attached (${FAKE_ANDROID_SERIAL}, ${EMULATOR}) — pass --android-serial=`
    );
  });

  it('refuses an explicit serial adb does not list', () => {
    const pick = selectAndroidSerial(attached(EMULATOR), FAKE_ANDROID_SERIAL);
    expect(pick.serial).toBeNull();
    expect(pick.problem).toBe(
      `--android-serial=${FAKE_ANDROID_SERIAL} is not attached (adb lists ${EMULATOR})`
    );
  });

  it('reports a failed adb devices as a problem, not as an empty rig', () => {
    expect(selectAndroidSerial(ADB_FAILED, FAKE_ANDROID_SERIAL)).toEqual({
      serial: null,
      attached: [],
      problem: 'adb devices failed (spawnSync adb ENOENT) — no device was checked',
    });
  });
});

describe('the preflight and the release refuse the same rigs', () => {
  it.each([
    ['a phone beside an emulator', attached(FAKE_ANDROID_SERIAL, EMULATOR), null],
    ['an explicit serial that is not attached', attached(EMULATOR), FAKE_ANDROID_SERIAL],
    ['a failed adb devices', ADB_FAILED, null],
  ])('%s: blocked, failed, and no device step run', (_, devices, explicit) => {
    const preflightAdb = fakeAdb(devices);
    const preflight = androidChecks({ fix: true, explicit, run: preflightAdb.run });
    const releaseAdb = fakeAdb(devices);
    const release = releaseAndroid({
      dryRun: false,
      hostOnly: false,
      explicit,
      run: releaseAdb.run,
    });

    const { problem } = selectAndroidSerial(devices, explicit);
    expect(preflight.serial).toBeNull();
    expect(preflight.checks).toEqual([
      { name: 'android device', status: 'blocked', detail: problem },
    ]);
    expect(releaseFailures(release)).toEqual([problem]);
    expect([...preflightAdb.calls, ...releaseAdb.calls]).toEqual(['adb devices', 'adb devices']);
  });

  it('fails a --host-only release whose adb devices failed', () => {
    const release = releaseAndroid({
      dryRun: false,
      hostOnly: true,
      explicit: null,
      run: fakeAdb(ADB_FAILED).run,
    });
    expect(releaseFailures(release)).toEqual([
      'adb devices failed (spawnSync adb ENOENT) — no device was checked',
    ]);
  });
});

describe('releaseAndroid', () => {
  it('drops the selected phone’s devtools forwards and resets that phone', () => {
    const adb = fakeAdb(attached(FAKE_ANDROID_SERIAL), {
      'adb forward --list': {
        ok: true,
        out: `${FAKE_ANDROID_SERIAL} tcp:9224 localabstract:chrome_devtools_remote`,
        err: '',
      },
      [`adb -s ${FAKE_ANDROID_SERIAL} `]: { ok: true, out: '', err: '' },
    });
    const release = releaseAndroid({
      dryRun: false,
      hostOnly: false,
      explicit: null,
      run: adb.run,
    });

    expect(releaseFailures(release)).toEqual([]);
    expect(release.forwards.map((forward) => forward.outcome)).toEqual(['removed']);
    expect(release.android.serial).toBe(FAKE_ANDROID_SERIAL);
    expect(adb.calls).toContain(`adb -s ${FAKE_ANDROID_SERIAL} shell svc power stayon false`);
  });

  it('reports an empty rig as nothing to reset', () => {
    const release = releaseAndroid({
      dryRun: false,
      hostOnly: false,
      explicit: null,
      run: fakeAdb(attached()).run,
    });
    expect(release).toEqual({ forwards: [], android: null });
    expect(releaseFailures(release)).toEqual([]);
  });
});

describe('requireCaptureSerial', () => {
  it('takes the only attached device, or an explicit one that is attached', () => {
    expect(requireCaptureSerial(attached(EMULATOR), undefined)).toBe(EMULATOR);
    expect(requireCaptureSerial(attached(FAKE_ANDROID_SERIAL, EMULATOR), EMULATOR)).toBe(EMULATOR);
  });

  it('refuses two attached devices, naming the capture runners’ flag', () => {
    expect(() => requireCaptureSerial(attached(FAKE_ANDROID_SERIAL, EMULATOR), undefined)).toThrow(
      `several devices attached (${FAKE_ANDROID_SERIAL}, ${EMULATOR}) — pass --device-id=`
    );
  });

  it('refuses an explicit serial adb does not list', () => {
    expect(() => requireCaptureSerial(attached(EMULATOR), FAKE_ANDROID_SERIAL)).toThrow(
      `--device-id=${FAKE_ANDROID_SERIAL} is not attached (adb lists ${EMULATOR})`
    );
  });

  it('stops on an empty rig and on a failed adb devices', () => {
    expect(() => requireCaptureSerial(attached(), undefined)).toThrow(
      'No Android device is attached — connect a phone or boot an emulator (npm run android:boot)'
    );
    expect(() => requireCaptureSerial(ADB_FAILED, undefined)).toThrow(
      'adb devices failed (spawnSync adb ENOENT) — no device was checked'
    );
  });
});

describe('perf:android device selection', () => {
  const roots = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  // A fake adb first on PATH lists the rig and logs every call it receives.
  function runWebviewSession(rig, args) {
    const root = mkdtempSync(join(tmpdir(), 'splotch-fake-adb-'));
    roots.push(root);
    const calls = join(root, 'calls.log');
    const listing = join(root, 'devices.txt');
    writeFileSync(listing, rig.out);
    writeFileSync(
      join(root, 'adb'),
      `#!/bin/sh\necho "$*" >> "${calls}"\n[ "$1" = devices ] && cat "${listing}"\nexit 0\n`
    );
    chmodSync(join(root, 'adb'), 0o755);
    const result = spawnSync(process.execPath, [WEBVIEW_SESSION, ...args], {
      encoding: 'utf8',
      timeout: WEBVIEW_REFUSAL_TIMEOUT_MS,
      env: { ...process.env, PATH: `${root}${delimiter}${process.env.PATH}` },
    });
    const log = existsSync(calls) ? readFileSync(calls, 'utf8').trim() : '';
    return { ...result, calls: log ? log.split('\n') : [] };
  }

  it('refuses two attached devices before any device step', () => {
    const run = runWebviewSession(attached(FAKE_ANDROID_SERIAL, EMULATOR), ['--no-build']);

    expect(run.status).toBe(1);
    expect(run.stderr.trim()).toBe(
      `several devices attached (${FAKE_ANDROID_SERIAL}, ${EMULATOR}) — pass --device-id=`
    );
    expect(run.calls).toEqual(['devices']);
  });

  // A mistyped --no-build would otherwise rebuild and reinstall the app it was
  // asked to profile as-is.
  it('refuses an unknown flag before listing devices', () => {
    const run = runWebviewSession(attached(FAKE_ANDROID_SERIAL, EMULATOR), ['--no-buld']);

    expect(run.status).toBe(1);
    expect(run.stderr.trim()).toBe('Unknown flag --no-buld — known flags: device-id, no-build');
    expect(run.calls).toEqual([]);
  });
});
