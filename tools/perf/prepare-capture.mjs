// Preflight for a physical-device performance campaign.
//
//   npm run perf:preflight                    report only
//   npm run perf:preflight -- --wake-android        wake it and set stay-awake
//   npm run perf:preflight -- --hold-android-awake  the same, re-asserted for the session
//   npm run perf:preflight -- --verify-ios-launch   launch a real WDA session (slow, exclusive)
//   npm run perf:preflight -- --verify-android-input drive a real touch and read the cadence
//   npm run perf:preflight -- --json                machine-readable, for a campaign runner
//
// Every check here exists because a campaign produced numbers without it and the
// numbers were wrong. See docs/PROFILING-CAMPAIGNS.md for what each failure looks
// like when it is not caught.
//
// Everything except --verify-ios-launch is host-side, which is the gap it closes: a
// device blocked by Guided Access stays enumerated, answers ideviceinfo, keeps
// its tunnel up and reports ready here, because none of those launch an app.
//
// It never stops a listener another session owns. Anything that cost a human
// approval — the root-owned RemoteXPC tunnel above all — is reused where it is
// already running, and anything cheap moves to a free port instead.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, argFlag, hasCommand, isMain, runMain } from '../lib/proc.mjs';
import {
  androidWakeActions,
  classifyLaunchProbe,
  iosIdentifierProblem,
  PORT_ROLES,
  resolvePort,
  summarize,
} from './lib/capture-readiness.mjs';
import { verifyAndroidInput } from './split-capture/verify-android-input.mjs';

const ANDROID_STAY_AWAKE_TIMEOUT_MS = 1_800_000;
// Android clears stay-awake on its own across a USB reconnect or a reboot, and a
// campaign that spans hours will meet one. Re-asserting costs one adb round trip
// and is the difference between an overnight run and a locked screen at 3am.
const ANDROID_WATCH_INTERVAL_MS = 60_000;

const sh = (cmd, args) => {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  return {
    ok: result.status === 0,
    out: (result.stdout ?? '').trim(),
    err: (result.stderr ?? '').trim(),
  };
};

function portHolder(port) {
  const { out } = sh('lsof', ['-ti', `tcp:${port}`]);
  const pid = out.split('\n').filter(Boolean)[0];
  if (!pid) return null;
  const { out: args } = sh('ps', ['-p', pid, '-o', 'args=']);
  return { pid: Number(pid), args };
}

function freePorts(candidates) {
  return candidates.filter((port) => !portHolder(port));
}

function androidChecks({ fix }) {
  const checks = [];
  const devices = sh('adb', ['devices'])
    .out.split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([, state]) => state === 'device')
    .map(([serial]) => serial);

  if (devices.length === 0) {
    checks.push({
      name: 'android device',
      status: 'blocked',
      detail: 'no device in `adb devices`',
    });
    return { checks, serial: null };
  }
  const serial = argFlag('android-serial', devices[0]);
  checks.push({ name: 'android device', status: 'ok', detail: serial });

  const trust = sh('adb', ['-s', serial, 'shell', 'dumpsys', 'trust']).out;
  const locked = /deviceLocked=1/.test(trust);
  const power = sh('adb', ['-s', serial, 'shell', 'dumpsys', 'power']).out;
  const screenOn = /Display Power: state=ON/i.test(power) || /mWakefulness=Awake/i.test(power);
  const stayOn = /mStayOn=true/i.test(power) || /stayOn=true/i.test(power);

  const { actions, blockers } = androidWakeActions({ screenOn, stayOn, locked });
  for (const blocker of blockers) {
    checks.push({ name: 'android lock', status: 'blocked', detail: blocker });
  }

  if (actions.length === 0) {
    checks.push({ name: 'android stays awake', status: 'ok', detail: 'screen on, stay-awake set' });
  } else if (!fix) {
    checks.push({
      name: 'android stays awake',
      status: 'warn',
      detail: `would ${actions.join(' + ')} — re-run with --wake-android`,
    });
  } else {
    if (actions.includes('wake'))
      sh('adb', ['-s', serial, 'shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']);
    if (actions.includes('stayon')) {
      sh('adb', ['-s', serial, 'shell', 'svc', 'power', 'stayon', 'true']);
      sh('adb', [
        '-s',
        serial,
        'shell',
        'settings',
        'put',
        'system',
        'screen_off_timeout',
        String(ANDROID_STAY_AWAKE_TIMEOUT_MS),
      ]);
    }
    checks.push({
      name: 'android stays awake',
      status: 'ok',
      detail: `applied ${actions.join(' + ')}`,
    });
  }

  const chrome = sh('adb', [
    '-s',
    serial,
    'shell',
    'pm',
    'list',
    'packages',
    'com.android.chrome',
  ]).out;
  checks.push({
    name: 'android chrome',
    status: chrome.includes('com.android.chrome') ? 'ok' : 'blocked',
    detail: chrome ? 'installed' : 'com.android.chrome is not installed',
  });

  return { checks, serial };
}

function iosChecks() {
  const checks = [];
  if (!hasCommand('idevice_id')) {
    checks.push({
      name: 'ios tooling',
      status: 'blocked',
      detail: 'idevice_id is missing — brew install libimobiledevice',
    });
    return { checks, udid: null };
  }
  const udids = sh('idevice_id', ['-l']).out.split('\n').filter(Boolean);
  if (udids.length === 0) {
    checks.push({
      name: 'ios device',
      status: 'blocked',
      detail: 'no device from `idevice_id -l`',
    });
    return { checks, udid: null };
  }
  const udid = argFlag('ios-udid', udids[0]);
  const problem = iosIdentifierProblem(udid);
  checks.push({
    name: 'ios device',
    status: problem ? 'blocked' : 'ok',
    detail: problem ?? `${udid} (hardware UDID — not the devicectl CoreDevice UUID)`,
  });

  // The tunnel is root-owned and its password prompt cannot be answered
  // unattended, so a running one is reused rather than restarted.
  const tunnel = sh('pgrep', ['-fl', 'tunnel-creation.mjs']).out;
  const tunnelForDevice = tunnel.includes(udid);
  checks.push({
    name: 'ios remotexpc tunnel',
    status: tunnelForDevice ? 'ok' : 'blocked',
    detail: tunnelForDevice
      ? 'already running for this device — reused, no approval needed'
      : 'not running. Start it once, then leave it up:\n' +
        `      osascript -e 'do shell script "$(which node) ~/.appium/node_modules/appium-xcuitest-driver/scripts/tunnel-creation.mjs --udid ${udid} --disconnect-retry-max-attempts 3 > /tmp/ios-tunnel.log 2>&1" with administrator privileges'`,
  });

  checks.push({
    name: 'ios signing config',
    status: existsSync(join(ROOT, 'ios', 'local.xcconfig')) ? 'ok' : 'blocked',
    detail: 'ios/local.xcconfig',
  });

  return { checks, udid };
}

// Short: a live server answers immediately on loopback, and a hung one must not
// hold up a preflight that exists to be run before every campaign.
const APPIUM_PROBE_TIMEOUT_MS = 4_000;

async function probeAppium(port) {
  const get = async (path) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      signal: AbortSignal.timeout(APPIUM_PROBE_TIMEOUT_MS),
    }).catch(() => null);
    if (!response) return null;
    return response.json().catch(() => null);
  };
  const status = await get('/status');
  if (!status?.value) return { responds: false };
  const sessions = await get('/appium/sessions');
  return {
    responds: true,
    ready: status.value.ready === true,
    version: status.value.build?.version,
    // Absent unless the server runs with --allow-insecure=session_discovery, so
    // null means "unknown", never "idle".
    sessionCount: Array.isArray(sessions?.value) ? sessions.value.length : null,
  };
}

async function portChecks() {
  const checks = [];
  const resolved = {};
  for (const [role, spec] of Object.entries(PORT_ROLES)) {
    const holder = portHolder(spec.port);
    const decision = resolvePort(role, {
      holder: holder && {
        pid: holder.pid,
        // "Ours" means this repo started it; a preview server is the only thing
        // safe to restart, and only when it is ours.
        ours: holder.args.includes('serve-profile-build') || holder.args.includes('vite preview'),
        // Proven by handshake rather than inferred from a command line.
        appium: role === 'appium' ? await probeAppium(spec.port) : undefined,
      },
      free: freePorts(spec.shiftTo ?? []),
    });
    resolved[role] = decision.port;
    checks.push({
      name: `port ${role}`,
      status: decision.action === 'blocked' ? 'blocked' : 'ok',
      detail: `${decision.port} — ${decision.action} (${decision.reason})`,
    });
  }
  return { checks, resolved };
}

// Holds BOTH devices ready for the length of a session, not just the one being
// captured right now. Captures are serialized — two campaigns driving input from
// one host is the contention that corrupts input cadence — but the idle device
// still has to be awake and enumerated when its turn comes, and still has to be
// reachable afterwards for a follow-up question.
//
// Android is held actively (stay-awake is a setting this can re-assert). iOS is
// only observed: nothing here can hold an iPad awake, so Auto-Lock must be Never
// on the device itself, and all this can do is say when it has gone away.
export async function watchAndroid(
  serial,
  { intervalMs = ANDROID_WATCH_INTERVAL_MS, iosUdid } = {}
) {
  console.log(`watching ${serial}; re-asserting stay-awake every ${intervalMs / 1000}s`);
  let lastIos = null;
  let lastLocked = null;
  for (;;) {
    const locked = /deviceLocked=1/.test(
      sh('adb', ['-s', serial, 'shell', 'dumpsys', 'trust']).out
    );
    if (locked !== lastLocked) {
      console.log(
        locked
          ? `LOCKED ${serial} — unlock it by hand; captures from here are not scoreable`
          : `awake ${serial}`
      );
      lastLocked = locked;
    }
    if (!locked) {
      // Stay-awake is STAY_ON_WHILE_PLUGGED_IN, so it only holds while the
      // framework reports the device plugged. A phone that has reached 100% and
      // stopped drawing current still reports `AC powered: true` on the hardware
      // this was written against — but firmware that does not would silently
      // stop honouring stay-awake mid-campaign. The debug override makes the
      // framework report plugged regardless; `dumpsys battery reset` undoes it.
      const battery = sh('adb', ['-s', serial, 'shell', 'dumpsys', 'battery']).out;
      const plugged = /(AC|USB|Wireless) powered: true/.test(battery);
      if (!plugged) {
        console.log(
          `unplugged-looking ${serial} — forcing a plugged state so stay-awake still applies`
        );
        sh('adb', ['-s', serial, 'shell', 'dumpsys', 'battery', 'set', 'ac', '1']);
      }
      sh('adb', ['-s', serial, 'shell', 'svc', 'power', 'stayon', 'true']);
      sh('adb', [
        '-s',
        serial,
        'shell',
        'settings',
        'put',
        'system',
        'screen_off_timeout',
        String(ANDROID_STAY_AWAKE_TIMEOUT_MS),
      ]);
    }
    if (iosUdid) {
      const enumerated = sh('idevice_id', ['-l']).out.includes(iosUdid);
      const tunnel = sh('pgrep', ['-f', 'tunnel-creation.mjs']).ok;
      const state = enumerated && tunnel;
      if (state !== lastIos) {
        console.log(
          state
            ? `ios ready ${iosUdid}`
            : `IOS UNAVAILABLE ${iosUdid} — ${enumerated ? 'tunnel gone' : 'device not enumerated'}`
        );
        lastIos = state;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

// Building and launching WebDriverAgent is the only check here that proves the
// device will actually accept a capture, and the only one that catches a
// device-side denial — Guided Access above all. It costs a real WDA build, so it
// is opt-in rather than part of the default report, and it must not run while a
// capture holds the device.
const LAUNCH_PROBE_TIMEOUT_MS = 300_000;

export async function probeIosLaunch({ udid, appiumUrl, wdaPort }) {
  const body = {
    capabilities: {
      alwaysMatch: {
        platformName: 'iOS',
        'appium:automationName': 'XCUITest',
        'appium:udid': udid,
        'appium:xcodeConfigFile': join(ROOT, 'ios', 'local.xcconfig'),
        'appium:updatedWDABundleId': 'art.splotch.WebDriverAgentRunner',
        'appium:wdaLocalPort': wdaPort,
        'appium:browserName': 'Safari',
        'appium:newCommandTimeout': 120,
      },
      firstMatch: [{}],
    },
  };
  try {
    const response = await fetch(`${appiumUrl}/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(LAUNCH_PROBE_TIMEOUT_MS),
    });
    const payload = await response.json();
    const sessionId = payload.value?.sessionId;
    if (!sessionId) return { ok: false, message: String(payload.value?.message ?? '') };
    await fetch(`${appiumUrl}/session/${sessionId}`, { method: 'DELETE' });
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export async function prepareCapture(argv = process.argv.slice(2)) {
  const fix = argv.includes('--wake-android');
  const android = androidChecks({ fix });
  const ios = iosChecks();
  const ports = await portChecks();
  const result = summarize([...android.checks, ...ios.checks, ...ports.checks]);
  const report = {
    ...result,
    androidSerial: android.serial,
    iosUdid: ios.udid,
    ports: ports.resolved,
  };

  if (argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const check of report.checks) {
      const mark = check.status === 'ok' ? '✓' : check.status === 'warn' ? '!' : '✗';
      console.log(`${mark} ${check.name.padEnd(22)} ${check.detail}`);
    }
    console.log(
      report.ready ? '\nReady to capture.' : `\nNot ready: ${report.blockers.length} blocker(s).`
    );
  }
  if (!report.ready) process.exitCode = 1;
  return report;
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    const argv = process.argv.slice(2);
    const report = await prepareCapture(argv);
    // Android first: it is the cheaper of the two verifications, so a bad
    // input path surfaces before a minute is spent building WebDriverAgent.
    if (argv.includes('--verify-android-input') && report.androidSerial) {
      console.log('\nverifying Android input against the floor control…');
      const input = await verifyAndroidInput({
        serial: report.androidSerial,
        port: report.ports.floorControl,
      });
      console.log(`${input.ok ? '✓' : '✗'} ${'android input'.padEnd(22)} ${input.detail}`);
      if (input.contact) console.log(`  ${''.padEnd(22)} observed: ${input.contact}`);
      if (!input.ok) process.exitCode = 1;
    }
    if (argv.includes('--verify-ios-launch') && report.iosUdid) {
      console.log('\nprobing a real WebDriverAgent launch (this builds WDA and takes a minute)…');
      const probe = classifyLaunchProbe(
        await probeIosLaunch({
          udid: report.iosUdid,
          appiumUrl: argFlag('appium-url', `http://127.0.0.1:${report.ports.appium}`),
          wdaPort: report.ports.wda,
        })
      );
      console.log(
        `${probe.status === 'ok' ? '✓' : '✗'} ${'ios launch'.padEnd(22)} ${probe.detail}`
      );
      if (probe.status !== 'ok') process.exitCode = 1;
    }
    if (argv.includes('--hold-android-awake') && report.androidSerial) {
      process.exitCode = 0;
      await watchAndroid(report.androidSerial, { iosUdid: report.iosUdid });
    }
  });
}
