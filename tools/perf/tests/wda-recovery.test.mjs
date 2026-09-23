import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import { classifyLaunchProbe } from '../lib/capture-readiness.mjs';
import { FAKE_IOS_UDID } from '../lib/device-identifiers.mjs';
import { isGrantDenial } from '../lib/grant-log.mjs';
import {
  describeRecovery,
  grantFromRunnerLaunch,
  iproxyForwardPorts,
  isStaleDeviceDiscovery,
  launchAttemptRows,
  newestDeviceXctestrun,
  runnerHoldsDevice,
} from '../lib/wda-recovery.mjs';
import { probeIosLaunch, recoverStaleDiscoveryLaunch } from '../prepare-capture.mjs';

// Not UDID-shaped on purpose: the device-identifier guard allows only FAKE_IOS_UDID.
const UDID = FAKE_IOS_UDID;
const OTHER_UDID = 'another-ipad';
const UNKNOWN_DEVICE = `Unknown device or simulator UDID: '${UDID}'`;
const AUTOMATION_TIMEOUT = 'Timed out while enabling automation mode';

describe('recognising stale device discovery', () => {
  it('matches the XCUITest discovery message and nothing about the grant', () => {
    expect(isStaleDeviceDiscovery(UNKNOWN_DEVICE)).toBe(true);
    expect(isStaleDeviceDiscovery('xcodebuild failed with code 65')).toBe(false);
    expect(isStaleDeviceDiscovery(undefined)).toBe(false);
  });
});

describe('iproxyForwardPorts', () => {
  // The shapes `ps -axo pid=,args=` printed on the rig this was written for.
  const ps = [
    `16717 iproxy -u ${UDID} 8100:8100`,
    `22376 iproxy -u ${UDID} 8110:8100`,
    `30000 iproxy 8130 8100 ${UDID}`,
    `30001 iproxy -u ${OTHER_UDID} 8140:8100`,
    `30002 iproxy -u ${UDID} 9222:9222`,
    `30003 node appium --port 8150:8100 ${UDID}`,
  ].join('\n');

  it('lists the host ports forwarded onto this iPad’s WebDriverAgent port', () => {
    expect(iproxyForwardPorts(ps, UDID).sort()).toEqual([8100, 8110, 8130]);
  });

  it('finds nothing for a device with no forward', () => {
    expect(iproxyForwardPorts(ps, 'unforwarded-ipad')).toEqual([]);
  });
});

describe('runnerHoldsDevice', () => {
  const runner =
    '22348 /Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild test-without-building ' +
    `-xctestrun /x/WebDriverAgentRunner_iphoneos26.5-arm64.xctestrun -destination id=${UDID}`;

  it('sees a runner holding this iPad and not one holding another', () => {
    expect(runnerHoldsDevice(runner, UDID)).toBe(true);
    expect(runnerHoldsDevice(runner, OTHER_UDID)).toBe(false);
    expect(runnerHoldsDevice(`1 xcodebuild build -destination id=${UDID}`, UDID)).toBe(false);
  });
});

describe('newestDeviceXctestrun', () => {
  it('picks the newest device test run and never a simulator one', () => {
    const picked = newestDeviceXctestrun([
      { path: '/a/WebDriverAgentRunner_iphoneos26.4-arm64.xctestrun', mtimeMs: 1 },
      { path: '/b/WebDriverAgentRunner_iphoneos26.5-arm64.xctestrun', mtimeMs: 3 },
      { path: '/c/WebDriverAgentRunner_iphonesimulator26.5-arm64.xctestrun', mtimeMs: 9 },
    ]);

    expect(picked).toBe('/b/WebDriverAgentRunner_iphoneos26.5-arm64.xctestrun');
    expect(newestDeviceXctestrun([])).toBeNull();
  });
});

describe('grantFromRunnerLaunch', () => {
  it('reads ready as a valid grant, the automation timeout as expired, and the rest as unknown', () => {
    expect(grantFromRunnerLaunch({ ready: true, log: '' }).grant).toBe('valid');
    const expired = grantFromRunnerLaunch({ ready: false, log: AUTOMATION_TIMEOUT });
    expect(expired.grant).toBe('expired');
    expect(expired.cause).toContain('Enable UI Automation');
    const locked = grantFromRunnerLaunch({ ready: false, log: 'the device is locked' });
    expect(locked.grant).toBe('undetermined');
    expect(locked.cause).toContain('locked');
    expect(grantFromRunnerLaunch({ ready: false, log: '' })).toEqual({
      grant: 'undetermined',
      cause: null,
    });
  });
});

describe('describeRecovery', () => {
  const base = { udid: UDID, wdaPort: 8120 };

  it('reports a reused runner as capturable with the grant undetermined', () => {
    const recovery = describeRecovery({
      ...base,
      route: 'reused',
      grant: 'undetermined',
      wdaUrl: 'http://127.0.0.1:8110',
      session: { ok: true, rotationVerified: true },
    });

    expect(recovery).toMatchObject({ status: 'warn', grant: 'undetermined', outcome: 'reused' });
    expect(recovery.detail).toContain('not the automation grant');
    expect(recovery.detail).toContain('followed a rotation');
    expect(recovery.detail).toContain('webDriverAgentUrl` http://127.0.0.1:8110');
  });

  it('names the forward to recreate when the recovery started it itself', () => {
    const recovery = describeRecovery({
      ...base,
      route: 'reused',
      grant: 'undetermined',
      forwardedHere: true,
      wdaUrl: 'http://127.0.0.1:8120',
      session: { ok: true },
    });

    expect(recovery.detail).toContain(`iproxy -u ${UDID} 8120:8100`);
  });

  it('records a ready direct launch as the ok row that proves the grant', () => {
    const recovery = describeRecovery({
      ...base,
      route: 'launched',
      grant: 'valid',
      xctestrun: '/x.xctestrun',
      wdaUrl: 'http://127.0.0.1:8120',
      session: { ok: true },
    });

    expect(recovery).toMatchObject({ status: 'warn', grant: 'valid', outcome: 'ok' });
    expect(recovery.detail).toContain('xcodebuild test-without-building -xctestrun /x.xctestrun');
    // The relaunch advice names host paths, so the tracked grant log omits it.
    expect(recovery.logDetail).not.toContain('/x.xctestrun');
  });

  it('writes an expired grant as a row the lifetime summary counts as a denial', () => {
    const recovery = describeRecovery({
      ...base,
      route: 'launched',
      grant: 'expired',
      cause: grantFromRunnerLaunch({ ready: false, log: AUTOMATION_TIMEOUT }).cause,
    });

    expect(recovery).toMatchObject({ status: 'blocked', grant: 'expired', outcome: 'blocked' });
    expect(isGrantDenial({ outcome: recovery.outcome, detail: recovery.detail })).toBe(true);
  });

  it('never lets a stale-discovery row read as a grant denial', () => {
    const recovery = describeRecovery({
      ...base,
      route: 'launched',
      grant: 'undetermined',
      reason: 'no built WebDriverAgent device test run.',
    });

    expect(recovery.status).toBe('blocked');
    expect(isGrantDenial({ outcome: recovery.outcome, detail: recovery.detail })).toBe(false);
  });
});

describe('launchAttemptRows', () => {
  it('keeps the discovery failure and adds the recovery row after it', () => {
    const recovery = { status: 'warn', outcome: 'ok', grant: 'valid', detail: 'recovered' };
    const launch = { ok: false, message: UNKNOWN_DEVICE, recovery };
    const rows = launchAttemptRows(launch, classifyLaunchProbe(launch));

    expect(rows).toEqual([
      { outcome: 'blocked', detail: UNKNOWN_DEVICE },
      { outcome: 'ok', detail: 'recovery: recovered' },
    ]);
  });

  it('writes one row for a launch that needed no recovery', () => {
    const launch = { ok: true, rotationVerified: true };
    const probe = classifyLaunchProbe(launch);

    expect(launchAttemptRows(launch, probe)).toEqual([{ outcome: 'ok', detail: probe.detail }]);
  });
});

// The stale-discovery path end to end, with every process the real rig would
// start replaced by one this file owns: a fake WebDriverAgent `/status`, node
// children standing in for iproxy and xcodebuild, and the fake Appium fixture
// in `stale-discovery` mode as both the borrowed server and the fresh one.
const servers = [];
const children = [];

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
  await Promise.all(servers.splice(0).map((server) => new Promise((r) => server.close(r))));
});

function listen(handler) {
  const server = createServer(handler);
  servers.push(server);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

// A WebDriverAgent `/status` whose readiness and session the test controls.
async function fakeWda({ ready = true, sessionId = null } = {}) {
  const state = { ready, sessionId };
  const port = await listen((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ value: { ready: state.ready }, sessionId: state.sessionId }));
  });
  return { state, port, url: `http://127.0.0.1:${port}` };
}

function track(child) {
  children.push(child);
  return child;
}

const idleChild = (script = 'setInterval(() => {}, 1000)') =>
  track(
    spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  );

const fakeAppium =
  (expectWdaUrl, env = {}) =>
  (port) =>
    track(
      spawn(
        process.execPath,
        [join(ROOT, 'tools/perf/tests/fixtures/fake-appium.mjs'), String(port)],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, MODE: 'stale-discovery', EXPECT_WDA_URL: expectWdaUrl, ...env },
          detached: true,
        }
      )
    );

const gone = (child) => child.exitCode !== null || child.signalCode !== null;

const FAST = { forwardSettleMs: 0, pollMs: 50, launchTimeoutMs: 5_000 };

describe('recovering a launch from stale device discovery', () => {
  it('routes an Unknown device refusal from the borrowed server into the recovery', async () => {
    const wda = await fakeWda();
    const borrowedPort = await listen((req, res) => {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ value: { error: 'unknown error', message: UNKNOWN_DEVICE } }));
    });
    const calls = { forward: 0, runner: 0 };

    const launch = await probeIosLaunch({
      udid: UDID,
      appiumUrl: `http://127.0.0.1:${borrowedPort}`,
      wdaPort: 1,
      recoverStaleDiscovery: true,
      wdaRig: {
        ...FAST,
        processList: () => `22376 iproxy -u ${UDID} ${wda.port}:8100`,
        startForward: () => (calls.forward += 1),
        startRunner: () => (calls.runner += 1),
        spawnAppium: fakeAppium(wda.url),
      },
    });
    const probe = classifyLaunchProbe(launch);

    expect(launch.message).toBe(UNKNOWN_DEVICE);
    expect(probe.status, probe.detail).toBe('warn');
    expect(probe.grant).toBe('undetermined');
    expect(launch.recovery.outcome).toBe('reused');
    // A runner already on the device is never launched over.
    expect(calls).toEqual({ forward: 0, runner: 0 });
  }, 60_000);

  it('launches a runner directly when none is on the device, proving the grant', async () => {
    const wda = await fakeWda({ ready: false });
    let forward;
    let runner;

    const recovery = await recoverStaleDiscoveryLaunch({
      udid: UDID,
      wdaPort: wda.port,
      rig: {
        ...FAST,
        processList: () => '',
        deviceXctestrun: () => '/x/WebDriverAgentRunner_iphoneos26.5-arm64.xctestrun',
        startForward: () => (forward = idleChild()),
        startRunner: () => {
          wda.state.ready = true;
          return (runner = idleChild());
        },
        spawnAppium: fakeAppium(wda.url),
      },
    });

    expect(recovery.status, recovery.detail).toBe('warn');
    expect(recovery).toMatchObject({ grant: 'valid', outcome: 'ok' });
    // Nothing the recovery started outlives it.
    expect(gone(forward) && gone(runner)).toBe(true);
  }, 60_000);

  it('reports an expired grant from the runner’s own output', async () => {
    const wda = await fakeWda({ ready: false });
    let runner;

    const recovery = await recoverStaleDiscoveryLaunch({
      udid: UDID,
      wdaPort: wda.port,
      rig: {
        ...FAST,
        processList: () => '',
        deviceXctestrun: () => '/x/WebDriverAgentRunner_iphoneos26.5-arm64.xctestrun',
        startForward: () => idleChild(),
        startRunner: () =>
          (runner = idleChild(
            `console.log(${JSON.stringify(AUTOMATION_TIMEOUT)}); setInterval(() => {}, 1000)`
          )),
        spawnAppium: () => {
          throw new Error('no session belongs on a runner that never came up');
        },
      },
    });

    expect(recovery).toMatchObject({ status: 'blocked', grant: 'expired', outcome: 'blocked' });
    expect(recovery.detail).toContain('Enable UI Automation');
    expect(gone(runner)).toBe(true);
  }, 60_000);

  it('refuses to launch over a runner that holds the iPad without a forward', async () => {
    const wda = await fakeWda({ ready: false });
    let started = false;

    const recovery = await recoverStaleDiscoveryLaunch({
      udid: UDID,
      wdaPort: wda.port,
      rig: {
        ...FAST,
        processList: () => `22348 xcodebuild test-without-building -destination id=${UDID}`,
        startForward: () => idleChild(),
        startRunner: () => {
          started = true;
          return idleChild();
        },
      },
    });

    expect(started).toBe(false);
    expect(recovery).toMatchObject({ status: 'blocked', grant: 'undetermined' });
    expect(recovery.detail).toContain('would end it');
  }, 60_000);

  it('leaves a runner that is already serving a session alone', async () => {
    const wda = await fakeWda({ sessionId: 'campaign-session' });

    const recovery = await recoverStaleDiscoveryLaunch({
      udid: UDID,
      wdaPort: 1,
      rig: {
        ...FAST,
        processList: () => `22376 iproxy -u ${UDID} ${wda.port}:8100`,
        spawnAppium: () => {
          throw new Error('a busy runner must not get a second session');
        },
      },
    });

    expect(recovery).toMatchObject({ status: 'blocked', grant: 'undetermined' });
    expect(recovery.detail).toContain('campaign-session');
  }, 60_000);

  // The rival review of PR 2244 found these three by fake-rig reproduction.
  it('does not call a session it could not delete a clean recovery', async () => {
    const wda = await fakeWda();

    const recovery = await recoverStaleDiscoveryLaunch({
      udid: UDID,
      wdaPort: 1,
      rig: {
        ...FAST,
        processList: () => `22376 iproxy -u ${UDID} ${wda.port}:8100`,
        spawnAppium: fakeAppium(wda.url, { DELETE_FAILS: '1' }),
      },
    });

    expect(recovery.status, recovery.detail).toBe('blocked');
    expect(recovery.detail).toContain('could not be deleted');
    expect(recovery.detail).not.toContain('closed cleanly');
  }, 60_000);

  it('never launches a runner behind a forward that failed to start', async () => {
    let started = false;

    const recovery = await recoverStaleDiscoveryLaunch({
      udid: UDID,
      wdaPort: 1,
      rig: {
        ...FAST,
        processList: () => '',
        startForward: () => track(spawn('definitely-not-a-real-iproxy-xyz', [])),
        deviceXctestrun: () => '/x/WebDriverAgentRunner_iphoneos26.5-arm64.xctestrun',
        startRunner: () => {
          started = true;
          return idleChild();
        },
      },
    });

    expect(started).toBe(false);
    expect(recovery).toMatchObject({ status: 'blocked', grant: 'undetermined' });
    expect(recovery.detail).toContain('forward');
  }, 60_000);

  it('stops the forward it started when acquisition throws', async () => {
    const wda = await fakeWda({ ready: false });
    let forward;

    await expect(
      recoverStaleDiscoveryLaunch({
        udid: UDID,
        wdaPort: wda.port,
        rig: {
          ...FAST,
          processList: () => '',
          startForward: () => (forward = idleChild()),
          deviceXctestrun: () => {
            throw new Error('DerivedData unreadable');
          },
        },
      })
    ).rejects.toThrow('DerivedData unreadable');
    expect(gone(forward)).toBe(true);
  }, 60_000);

  it('rechecks the forward immediately before launching a runner', async () => {
    let forward;
    let started = false;

    const recovery = await recoverStaleDiscoveryLaunch({
      udid: UDID,
      wdaPort: 1,
      rig: {
        ...FAST,
        processList: () => '',
        startForward: () => (forward = idleChild()),
        // The forward dies while the status check is in flight.
        wdaStatus: async () => {
          forward.kill('SIGKILL');
          await new Promise((resolve) => forward.once('exit', resolve));
          return null;
        },
        deviceXctestrun: () => '/x/WebDriverAgentRunner_iphoneos26.5-arm64.xctestrun',
        startRunner: () => {
          started = true;
          return idleChild();
        },
      },
    });

    expect(started).toBe(false);
    expect(recovery.detail).toContain('forward');
  }, 60_000);
});
