// The decisions a capture preflight makes, as pure functions over probe output.
//
// Every rule here was earned by a campaign that produced numbers before anyone
// noticed the setup was wrong. `prepare-capture.mjs` supplies the shell; this
// module decides, so the decisions are unit-testable without a device.

// The two identifiers an iPad answers to are not interchangeable, and mixing
// them is the single most expensive mistake this file exists to prevent.
// `xcrun devicectl list devices` prints a CoreDevice UUID; Appium's
// `appium:udid` wants the hardware UDID that `idevice_id -l` prints. Passing the
// former produces "Could not find a pair record for device <uuid>", which reads
// like the device is unreachable and is not.
const CORE_DEVICE_UUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;
const HARDWARE_UDID = /^[0-9A-F]{8}-[0-9A-F]{16}$/i;

export function classifyIosIdentifier(value) {
  if (!value) return 'missing';
  if (HARDWARE_UDID.test(value)) return 'hardware-udid';
  if (CORE_DEVICE_UUID.test(value)) return 'core-device-uuid';
  return 'unknown';
}

export function iosIdentifierProblem(value) {
  const kind = classifyIosIdentifier(value);
  if (kind === 'hardware-udid') return null;
  if (kind === 'core-device-uuid') {
    return (
      `${value} is a CoreDevice UUID from \`xcrun devicectl\`, not the hardware UDID Appium needs. ` +
      'Take the value `idevice_id -l` prints instead — the failure it causes ("Could not find a ' +
      'pair record") looks like an unreachable device.'
    );
  }
  return `${value} is not a recognizable iOS device identifier`;
}

// A port already in use is not automatically a problem. Something that required
// a human approval — the root-owned RemoteXPC tunnel above all — is worth
// reusing rather than restarting, and something cheap is worth moving off.
// Restarting a listener another session owns is never the answer: it is what the
// repo's concurrent-worktree rule forbids, and the tunnel takes a password.
export const PORT_ROLES = {
  preview: { port: 4173, onConflict: 'replace-if-ours' },
  appium: { port: 4723, onConflict: 'reuse-or-shift', shiftTo: [4733, 4743, 4753] },
  wda: { port: 8100, onConflict: 'shift', shiftTo: [8110, 8120, 8130] },
  androidCdp: { port: 9224, onConflict: 'shift', shiftTo: [9234, 9244] },
  inspector: { port: 9221, onConflict: 'shift', shiftTo: [9231, 9241] },
  // The floor control the Android input check serves; the phone loads it over
  // the LAN, so it needs a port of its own rather than sharing the preview's.
  floorControl: { port: 4177, onConflict: 'shift', shiftTo: [4187, 4197] },
};

// Whether an Appium server already on the port can be borrowed.
//
// Matching the holder's command line against /appium/ was the original test and
// it is barely a test at all: it passes for a crashed server, a half-started
// one, and a shell whose arguments merely mention the word. The handshake is the
// evidence — a live server answers `GET /status` with a build version.
//
// Idleness is a different question and usually **cannot be answered**.
// `GET /appium/sessions` is gated behind `--allow-insecure=session_discovery`,
// which no server here runs with, so `sessionCount` is normally null rather than
// zero. That is reported honestly instead of being assumed idle: borrowing is
// still the right default, because Appium serves concurrent sessions and the
// contention that actually bit this campaign was two servers defaulting to the
// same WebDriverAgent port (8100), which the `wda` role resolves separately.
export function appiumReuse({ responds, ready, version, sessionCount } = {}) {
  if (!responds) {
    return { reuse: false, reason: 'nothing answered GET /status — not a live Appium server' };
  }
  if (!ready) return { reuse: false, reason: 'GET /status reports the server is not ready' };
  if (sessionCount > 0) {
    return {
      reuse: false,
      reason: `${sessionCount} session(s) already active — it is driving a device`,
    };
  }
  const label = version ? `Appium ${version}` : 'a live Appium server';
  if (sessionCount === 0) return { reuse: true, reason: `${label}, idle` };
  return {
    reuse: true,
    reason: `${label}; session discovery is disabled so idleness is unprovable — pass an explicit wdaLocalPort`,
  };
}

export function resolvePort(role, { holder, free }) {
  const spec = PORT_ROLES[role];
  if (!spec) throw new Error(`Unknown capture port role ${role}`);
  if (!holder) return { port: spec.port, action: 'start', reason: 'free' };

  if (spec.onConflict === 'replace-if-ours') {
    return holder.ours
      ? { port: spec.port, action: 'restart', reason: 'held by this session' }
      : {
          port: spec.port,
          action: 'blocked',
          reason: `held by another process (pid ${holder.pid})`,
        };
  }
  if (spec.onConflict === 'reuse-or-shift') {
    const verdict = appiumReuse(holder.appium);
    if (verdict.reuse) return { port: spec.port, action: 'reuse', reason: verdict.reason };
    const next = (spec.shiftTo ?? []).find((candidate) => free.includes(candidate));
    return next
      ? { port: next, action: 'start', reason: `${spec.port}: ${verdict.reason}` }
      : { port: spec.port, action: 'blocked', reason: verdict.reason };
  }
  const next = (spec.shiftTo ?? []).find((candidate) => free.includes(candidate));
  return next
    ? { port: next, action: 'start', reason: `${spec.port} is taken (pid ${holder.pid})` }
    : { port: spec.port, action: 'blocked', reason: 'no alternate port is free' };
}

// Android goes to sleep mid-campaign and takes the capture with it. Screen state
// and the stay-awake setting are separate: `svc power stayon true` holds the
// screen on only while charging over USB, which is the campaign's case, and a
// device that is already dark needs waking first.
export function androidWakeActions({ screenOn, stayOn, locked }) {
  const actions = [];
  if (!screenOn) actions.push('wake');
  if (!stayOn) actions.push('stayon');
  const blockers = locked
    ? ['the device is locked — unlock it by hand; a PIN cannot be automated']
    : [];
  return { actions, blockers };
}

// Device-side conditions that deny an app launch, matched against the INNERMOST
// underlying error of a WebDriverAgent failure. Appium reports all of them as
// `xcodebuild failed with code 65`, and the outer frames name `SBMainWorkspace`,
// which is the service that refused rather than the reason it did — so matching
// anything but the innermost frame identifies the wrong cause. Each entry says
// what a human has to do, because none of these can be cleared from the host.
const LAUNCH_DENIAL_CAUSES = [
  {
    pattern: /Guided Access active/i,
    detail:
      'Guided Access is on — it locks the iPad to one app, so no test runner can launch. ' +
      'Triple-click the side button, enter the Guided Access passcode, and tap End.',
  },
  {
    pattern: /device.*(is )?(locked|passcode)/i,
    detail: 'the device is locked — unlock it by hand; a passcode cannot be automated',
  },
  {
    pattern: /Developer Mode/i,
    detail: 'Developer Mode is off — enable it in Settings → Privacy & Security → Developer Mode',
  },
];

// `ok` means a session started and was torn down. Anything else is reported with
// the most specific cause the log supports, falling back to the raw message
// rather than guessing — a wrong guess here is what sends a campaign chasing a
// signing problem that does not exist.
// The page's own dimensions, not the orientation the device reports. Those can
// disagree, and the disagreement IS the failure: on Android a device that
// accepted a rotation request while its page stayed portrait passed every cheap
// check and then failed all eight landscape cells. Asking the page is the only
// question worth asking.
export function pageFollowedRotation(requested, width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width === height) return null;
  return (width > height ? 'LANDSCAPE' : 'PORTRAIT') === requested;
}

export function classifyLaunchProbe({ ok, message = '', rotationVerified = false }) {
  if (ok) {
    return {
      status: 'ok',
      detail: rotationVerified
        ? 'a WebDriverAgent session started, the page followed a rotation, and it closed cleanly'
        : 'a WebDriverAgent session started and closed cleanly',
    };
  }
  for (const cause of LAUNCH_DENIAL_CAUSES) {
    if (cause.pattern.test(message)) return { status: 'blocked', detail: cause.detail };
  }
  if (/xcodebuild failed with code 65/i.test(message)) {
    return {
      status: 'blocked',
      detail:
        'WebDriverAgent could not launch and the cause is not one this knows. Run the xcodebuild ' +
        'line from the Appium log by hand and read to the innermost "Underlying Error" — the build ' +
        'itself usually succeeds, so this is rarely a signing problem.',
    };
  }
  return { status: 'blocked', detail: message.slice(0, 200) || 'the probe failed with no message' };
}

export function summarize(checks) {
  const blockers = checks.filter((check) => check.status === 'blocked');
  return {
    ready: blockers.length === 0,
    blockers: blockers.map((check) => `${check.name}: ${check.detail}`),
    checks,
  };
}
