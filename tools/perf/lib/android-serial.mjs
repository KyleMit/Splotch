// Which Android device a capture-rig script acts on. perf:preflight pins the
// phone awake and the session runners capture on the serial it picks;
// perf:release unpins it. One rule for both, so the device a session held is
// the device its release lets go of.

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
// attached, emulators included, and no --android-serial there is no honest
// pick — the first one listed is whoever plugged in first.
export function selectAndroidSerial(devices, explicit) {
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
      problem: `--android-serial=${explicit} is not attached (adb lists ${attached.join(', ') || 'none'})`,
    };
  }
  if (explicit) return { serial: explicit, attached };
  if (attached.length > 1) {
    return {
      serial: null,
      attached,
      problem: `several devices attached (${attached.join(', ')}) — pass --android-serial=`,
    };
  }
  return { serial: attached[0] ?? null, attached };
}
