// Which Android device a capture-rig script acts on. perf:preflight pins the
// phone awake and the session runners capture on the serial it picks;
// perf:release unpins it. One rule for both, so the device a session held is
// the device its release lets go of.

import { spawnSync } from 'node:child_process';
import { parseOrFail } from '../../lib/proc.mjs';

const RIG_SERIAL_FLAG = 'android-serial';
const CAPTURE_SERIAL_FLAG = 'device-id';

function attachedAndroidSerials(adbDevicesOutput) {
  return adbDevicesOutput
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([, state]) => state === 'device')
    .map(([serial]) => serial);
}

// `devices` is the `{ ok, out, err }` of `adb devices`. A failed run (adb
// missing from PATH, a daemon the sandbox will not let start) lists nothing,
// and reading that as "nothing attached" lets a release report a phone still
// pinned awake as nothing to reset. The rig has one phone: with several
// attached, emulators included, and no serial named there is no honest pick —
// the first one listed is whoever plugged in first. `serialFlag` is the flag
// the refusal tells the user to pass.
export function selectAndroidSerial(devices, explicit, serialFlag = RIG_SERIAL_FLAG) {
  if (!devices.ok) {
    return {
      serial: null,
      attached: [],
      problem: `adb devices failed (${devices.err || 'no error output'}) — no device was checked`,
    };
  }
  const attached = attachedAndroidSerials(devices.out);
  if (explicit && !attached.includes(explicit)) {
    return {
      serial: null,
      attached,
      problem: `--${serialFlag}=${explicit} is not attached (adb lists ${attached.join(', ') || 'none'})`,
    };
  }
  if (explicit) return { serial: explicit, attached };
  if (attached.length > 1) {
    return {
      serial: null,
      attached,
      problem: `several devices attached (${attached.join(', ')}) — pass --${serialFlag}=`,
    };
  }
  return { serial: attached[0] ?? null, attached };
}

// A capture runner drives one device for its whole run, so where the
// preflight reports an empty rig as a blocked check, a runner stops before its
// first device step. Throws rather than exiting, so its tests read the refusal.
export function requireCaptureSerial(devices, requested) {
  const { serial, problem } = selectAndroidSerial(devices, requested, CAPTURE_SERIAL_FLAG);
  if (serial) return serial;
  throw new Error(
    problem ??
      'No Android device is attached — connect a phone or boot an emulator (npm run android:boot)'
  );
}

// `adb` is the binary the runner drives the device with, so the listing and
// every later `adb -s <serial>` call talk to the same adb server.
export function resolveAndroidDevice(requested, adb) {
  const listed = spawnSync(adb, ['devices'], { encoding: 'utf8' });
  const devices = {
    ok: listed.status === 0,
    out: listed.stdout ?? '',
    err: listed.error?.message ?? (listed.stderr ?? '').trim(),
  };
  return parseOrFail(() => requireCaptureSerial(devices, requested));
}
