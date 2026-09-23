import { classifyAppiumLog } from './capture-readiness.mjs';

// The pure half of the preflight's recovery from a borrowed Appium that cannot
// see the iPad (issue 2218). The process plumbing lives in prepare-capture.mjs.
//
// XCUITest throws `Unknown device or simulator UDID` from device discovery,
// before it builds or launches anything. Discovery short-circuits on the root
// RemoteXPC tunnel's registry, so when that registry is empty or stale every
// Appium on the host, long-running or fresh, reports it (2026-09-19 evidence
// package), while `idevice_id`, `devicectl`, and the tunnel all still see the
// device. `appium:webDriverAgentUrl` is the one capability that skips
// discovery, so a recovery has to end with a WebDriverAgent it can name by URL.
const STALE_DEVICE_DISCOVERY = /Unknown device or simulator UDID/i;

// The port WebDriverAgent listens on inside the device; every host forward
// (iproxy) maps some host port onto this one.
export const DEVICE_WDA_PORT = 8100;

export function isStaleDeviceDiscovery(message) {
  return STALE_DEVICE_DISCOVERY.test(String(message ?? ''));
}

function commandLines(psOutput) {
  return String(psOutput ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function namesDevice(line, udid) {
  return Boolean(udid) && line.split(/[\s=]+/).includes(udid);
}

// Host ports an `iproxy` process already forwards onto this device's
// WebDriverAgent port, read from `ps`/`pgrep -fl` output. Both iproxy argument
// shapes appear on this rig: `-u <udid> <host>:<device>` and the legacy
// positional `<host> <device> <udid>`.
export function iproxyForwardPorts(psOutput, udid, devicePort = DEVICE_WDA_PORT) {
  const ports = new Set();
  for (const line of commandLines(psOutput)) {
    if (!/\biproxy\b/.test(line) || !namesDevice(line, udid)) continue;
    for (const [, host, device] of line.matchAll(/(?:^|\s)(\d+):(\d+)(?=\s|$)/g)) {
      if (Number(device) === devicePort) ports.add(Number(host));
    }
    const positional = line.match(/\biproxy\s+(\d+)\s+(\d+)\s/);
    if (positional && Number(positional[2]) === devicePort) ports.add(Number(positional[1]));
  }
  return [...ports];
}

// Only one XCTest runner can hold a device. A second `xcodebuild test` against
// it ends the first, and on a shared rig the first is usually a campaign's.
export function runnerHoldsDevice(psOutput, udid) {
  return commandLines(psOutput).some(
    (line) =>
      /\bxcodebuild\b/.test(line) &&
      /\btest(-without-building)?\b/.test(line) &&
      namesDevice(line, udid)
  );
}

// Appium leaves one DerivedData tree per WebDriverAgent build; the newest
// device (not simulator) test run is the one matching the installed runner.
export function newestDeviceXctestrun(entries) {
  return (
    entries
      .filter(({ path }) => /WebDriverAgentRunner_iphoneos[^/]*\.xctestrun$/.test(path))
      .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.path ?? null
  );
}

// What a direct runner launch says about the XCTest automation grant. A runner
// that answered `/status` ready got past "enabling automation mode", which is
// the step an expired grant blocks, so ready proves the grant. The expiry has
// its own innermost line; any other cause (a locked device, Developer Mode)
// stops the launch before the grant is consulted.
export function grantFromRunnerLaunch({ ready, log }) {
  if (ready) return { grant: 'valid', cause: null };
  const cause = classifyAppiumLog(log);
  if (/Timed out while enabling automation mode/i.test(String(log ?? ''))) {
    return { grant: 'expired', cause };
  }
  return { grant: 'undetermined', cause };
}

const DISCOVERY_PREFIX =
  'The borrowed Appium could not see the iPad (`Unknown device or simulator UDID`): its device ' +
  'discovery is stale, which is not the automation grant.';

const GRANT_REASON = {
  reused: (wdaUrl) =>
    `A WebDriverAgent already running at ${wdaUrl} was reused, so no launch exercised the grant`,
  launched: (wdaUrl) => `A direct WebDriverAgent launch came up ready at ${wdaUrl}`,
};

const CAPABILITY_ADVICE = (wdaUrl) =>
  `\`appium:webDriverAgentUrl\` ${wdaUrl} in a --capabilities-file (docs/PROFILING-CAMPAIGNS.md)`;

// What a capture needs next. A forward or runner this recovery started is gone
// by the time the operator reads this, so the advice names how to bring it back.
function captureAdvice({ route, forwardedHere, udid, xctestrun, wdaPort, wdaUrl }) {
  const forward = `\`iproxy -u ${udid} ${wdaPort}:${DEVICE_WDA_PORT}\``;
  if (route === 'launched') {
    return (
      'Captures need it running: ' +
      `\`xcodebuild test-without-building -xctestrun ${xctestrun} -destination id=${udid}\` plus ` +
      `${forward}, then ${CAPABILITY_ADVICE(wdaUrl)}.`
    );
  }
  if (forwardedHere) return `Captures need ${forward}, then ${CAPABILITY_ADVICE(wdaUrl)}.`;
  return `Appium-transport captures reach it only through ${CAPABILITY_ADVICE(wdaUrl)}.`;
}

// The launch line and grant-log row a recovery produces. `status` is the
// preflight's: `warn` when the iPad took a session and only the borrowed
// server is broken, `blocked` when nothing proved the iPad capturable.
// `outcome` is the grant log's: `ok` is reserved for a launch that proved the
// grant, and a reused runner gets its own `reused` so the lifetime summary
// never counts it as a successful launch.
export function describeRecovery({
  route,
  grant,
  cause = null,
  reason = null,
  wdaUrl = null,
  session = null,
  udid,
  xctestrun = null,
  wdaPort = null,
  forwardedHere = false,
}) {
  const grantLine = `Grant: ${grant}`;
  if (!wdaUrl) {
    const why = cause ?? reason ?? 'no WebDriverAgent answered';
    return {
      status: 'blocked',
      grant,
      outcome: 'blocked',
      detail: `${DISCOVERY_PREFIX} Recovery failed: ${why} ${grantLine}.`,
    };
  }
  const grantWhy = GRANT_REASON[route](wdaUrl);
  const outcome = route === 'launched' ? 'ok' : 'reused';
  if (!session?.ok) {
    return {
      status: 'blocked',
      grant,
      outcome,
      detail:
        `${DISCOVERY_PREFIX} ${grantWhy}, but no session was proved through it: ` +
        `${session?.message ?? 'no message'}. ${grantLine}.`,
    };
  }
  const proved = session.rotationVerified
    ? 'a Safari session through it followed a rotation and closed cleanly'
    : 'a Safari session through it started and closed cleanly';
  const summary = `${DISCOVERY_PREFIX} ${grantWhy}; ${proved}. ${grantLine}.`;
  const advice = captureAdvice({ route, forwardedHere, udid, xctestrun, wdaPort, wdaUrl });
  // The advice names host paths and stays out of the tracked grant log.
  return { status: 'warn', grant, outcome, detail: `${summary} ${advice}`, logDetail: summary };
}

// The grant-log rows one preflight launch check writes. A recovery adds its own
// row after the borrowed server's, so the log keeps both the discovery failure
// and what the recovery learned about the grant.
export function launchAttemptRows(launch, probe) {
  if (!launch.recovery) return [{ outcome: probe.status, detail: probe.detail }];
  return [
    { outcome: 'blocked', detail: launch.message },
    {
      outcome: launch.recovery.outcome,
      detail: `recovery: ${launch.recovery.logDetail ?? launch.recovery.detail}`,
    },
  ];
}
