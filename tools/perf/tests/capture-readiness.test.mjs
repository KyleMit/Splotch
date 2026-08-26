import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { ROOT } from '../../lib/proc.mjs';
import { diagnoseLaunchFailure } from '../prepare-capture.mjs';
import { describe, expect, it } from 'vitest';
import {
  androidWakeActions,
  appiumReuse,
  classifyIosIdentifier,
  classifyLaunchProbe,
  iosIdentifierProblem,
  resolvePort,
  summarize,
  pageFollowedRotation,
  classifyAppiumLog,
} from '../lib/capture-readiness.mjs';

describe('iOS device identifiers', () => {
  // The mistake that cost a whole overnight campaign: `xcrun devicectl` prints a
  // CoreDevice UUID, Appium wants the hardware UDID, and the resulting error
  // ("Could not find a pair record") reads like an unreachable device.
  it('tells the hardware UDID from the CoreDevice UUID', () => {
    expect(classifyIosIdentifier('00008103-0006202E3CF1001E')).toBe('hardware-udid');
    expect(classifyIosIdentifier('BF6A40F5-B68E-5029-9BF8-7798D202F71C')).toBe('core-device-uuid');
    expect(classifyIosIdentifier('')).toBe('missing');
  });

  it('accepts a hardware UDID without comment', () => {
    expect(iosIdentifierProblem('00008103-0006202E3CF1001E')).toBeNull();
  });

  it('names the confusion rather than reporting an unreachable device', () => {
    const problem = iosIdentifierProblem('BF6A40F5-B68E-5029-9BF8-7798D202F71C');
    expect(problem).toContain('CoreDevice UUID');
    expect(problem).toContain('idevice_id -l');
  });
});

describe('port resolution', () => {
  it('takes a free port as-is', () => {
    expect(resolvePort('appium', { holder: null, free: [] })).toMatchObject({
      port: 4723,
      action: 'start',
    });
  });

  // Anything that cost a human approval is reused, never restarted.
  it('reuses an Appium server that answers the handshake', () => {
    expect(
      resolvePort('appium', {
        holder: { pid: 1, appium: { responds: true, ready: true, version: '3.6.0' } },
        free: [4733],
      })
    ).toMatchObject({ port: 4723, action: 'reuse' });
  });

  it('shifts off a port whose holder never answers the handshake', () => {
    // A process whose command line merely mentions appium is not a server.
    expect(
      resolvePort('appium', { holder: { pid: 1, appium: { responds: false } }, free: [4733] })
    ).toMatchObject({ port: 4733, action: 'start' });
  });

  it('shifts off a server that is already driving a device', () => {
    expect(
      resolvePort('appium', {
        holder: { pid: 1, appium: { responds: true, ready: true, sessionCount: 1 } },
        free: [4733],
      })
    ).toMatchObject({ port: 4733, action: 'start' });
  });

  // The collision that produced "WebDriverAgent is not initialized": two Appium
  // servers forwarding the same WDA port, the second proxying into the first's
  // session.
  it('moves WDA to another local port rather than stopping the holder', () => {
    const decision = resolvePort('wda', { holder: { pid: 39823 }, free: [8110, 8120] });
    expect(decision).toMatchObject({ port: 8110, action: 'start' });
    expect(decision.reason).toContain('39823');
  });

  it('gives the floor control its own port rather than sharing the preview', () => {
    // The phone loads it over the LAN while the preview server is also serving,
    // so they cannot be the same port.
    expect(resolvePort('floorControl', { holder: null, free: [] }).port).toBe(4177);
    expect(resolvePort('floorControl', { holder: { pid: 1 }, free: [4187] })).toMatchObject({
      port: 4187,
      action: 'start',
    });
  });

  it('restarts a preview server only when this session owns it', () => {
    expect(resolvePort('preview', { holder: { pid: 1, ours: true }, free: [] })).toMatchObject({
      action: 'restart',
    });
    expect(resolvePort('preview', { holder: { pid: 1, ours: false }, free: [] })).toMatchObject({
      action: 'blocked',
    });
  });

  it('blocks rather than guessing when no alternate is free', () => {
    expect(resolvePort('wda', { holder: { pid: 1 }, free: [] })).toMatchObject({
      action: 'blocked',
    });
  });
});

describe('android wake actions', () => {
  it('asks for nothing when the device is already awake and held', () => {
    expect(androidWakeActions({ screenOn: true, stayOn: true, locked: false }).actions).toEqual([]);
  });

  it('wakes a dark screen and sets stay-awake', () => {
    expect(androidWakeActions({ screenOn: false, stayOn: false, locked: false }).actions).toEqual([
      'wake',
      'stayon',
    ]);
  });

  it('reports a locked device as a blocker rather than trying to unlock it', () => {
    const { blockers } = androidWakeActions({ screenOn: true, stayOn: true, locked: true });
    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toContain('unlock it by hand');
  });
});

describe('classifyLaunchProbe', () => {
  // The real failure from 2026-08-22: Appium's message, the outer frame naming a
  // service that is not the cause, and the innermost frame that is.
  const guidedAccess =
    'Unable to launch WebDriverAgent. Original error: xcodebuild failed with code 65. ' +
    'The request to open "art.splotch.WebDriverAgentRunner.xctrunner" failed. The request was ' +
    'denied by service delegate (SBMainWorkspace) for reason: Unspecified. ' +
    '(Underlying Error: Guided Access active)';

  it('names Guided Access rather than the service that refused', () => {
    const { status, detail } = classifyLaunchProbe({ ok: false, message: guidedAccess });

    expect(status).toBe('blocked');
    expect(detail).toContain('Guided Access');
    expect(detail).toContain('Triple-click');
    expect(detail).not.toContain('SBMainWorkspace');
  });

  it('does not read a code 65 as a signing problem when the cause is unknown', () => {
    const { status, detail } = classifyLaunchProbe({
      ok: false,
      message: 'Unable to launch WebDriverAgent. Original error: xcodebuild failed with code 65.',
    });

    expect(status).toBe('blocked');
    expect(detail).toContain('Underlying Error');
    expect(detail).toContain('rarely a signing problem');
  });

  it('passes a probe that started and closed a session', () => {
    expect(classifyLaunchProbe({ ok: true }).status).toBe('ok');
  });

  it('falls back to the raw message rather than guessing a cause', () => {
    const { status, detail } = classifyLaunchProbe({ ok: false, message: 'ECONNREFUSED 4733' });

    expect(status).toBe('blocked');
    expect(detail).toBe('ECONNREFUSED 4733');
  });
});

describe('appiumReuse', () => {
  it('refuses a holder that does not answer /status', () => {
    const { reuse, reason } = appiumReuse({ responds: false });

    expect(reuse).toBe(false);
    expect(reason).toContain('not a live Appium server');
  });

  it('refuses a server that reports itself not ready', () => {
    expect(appiumReuse({ responds: true, ready: false }).reuse).toBe(false);
  });

  it('refuses a server with an active session rather than contending for it', () => {
    const { reuse, reason } = appiumReuse({ responds: true, ready: true, sessionCount: 2 });

    expect(reuse).toBe(false);
    expect(reason).toContain('2 session(s) already active');
  });

  it('borrows a provably idle server', () => {
    const { reuse, reason } = appiumReuse({
      responds: true,
      ready: true,
      version: '3.6.0',
      sessionCount: 0,
    });

    expect(reuse).toBe(true);
    expect(reason).toContain('idle');
  });

  it('borrows when idleness is unprovable, and says so', () => {
    // /appium/sessions is gated behind --allow-insecure=session_discovery, so
    // sessionCount is normally null. Null must not be read as zero.
    const { reuse, reason } = appiumReuse({ responds: true, ready: true, version: '3.6.0' });

    expect(reuse).toBe(true);
    expect(reason).toContain('unprovable');
    expect(reason).toContain('wdaLocalPort');
  });
});

describe('summarize', () => {
  it('is ready only when nothing is blocked', () => {
    expect(
      summarize([
        { name: 'a', status: 'ok' },
        { name: 'b', status: 'warn' },
      ]).ready
    ).toBe(true);
    const blocked = summarize([{ name: 'tunnel', status: 'blocked', detail: 'not running' }]);
    expect(blocked.ready).toBe(false);
    expect(blocked.blockers).toEqual(['tunnel: not running']);
  });
});

// #1248 closed this hole on Android after a rotation fault passed every cheap
// check and then failed all eight landscape cells. The iPad had no equivalent,
// and half the matrix is landscape on both devices.
describe('whether a page followed the device round', () => {
  it('accepts a page whose dimensions match what was asked for', () => {
    expect(pageFollowedRotation('LANDSCAPE', 1366, 934)).toBe(true);
    expect(pageFollowedRotation('PORTRAIT', 934, 1366)).toBe(true);
  });

  // The device accepting the request is not the question. This is the exact
  // shape observed on Android: the rotation is honoured, the page is not.
  it('rejects a page still in the orientation it was asked to leave', () => {
    expect(pageFollowedRotation('LANDSCAPE', 934, 1366)).toBe(false);
    expect(pageFollowedRotation('PORTRAIT', 1366, 934)).toBe(false);
  });

  // A square or unreadable viewport answers neither way, and saying "failed"
  // would send someone to Control Centre for a rotation lock that is not set.
  it('declines to answer when the dimensions cannot decide it', () => {
    expect(pageFollowedRotation('LANDSCAPE', 1024, 1024)).toBeNull();
    expect(pageFollowedRotation('LANDSCAPE', undefined, 934)).toBeNull();
  });
});

describe('what the launch probe reports once rotation is proven', () => {
  it('says the page followed a rotation only when that was checked', () => {
    expect(classifyLaunchProbe({ ok: true, rotationVerified: true }).detail).toContain(
      'followed a rotation'
    );
    expect(classifyLaunchProbe({ ok: true }).detail).not.toContain('followed a rotation');
  });
});

// Captured from a real failure on the physical iPad, 2026-08-24. The HTTP payload
// for this failure — message AND stacktrace — carried only Appium's outer
// `xcodebuild failed with code 65`, so no pattern over the response could ever
// have classified it. The cause appears in the server log and nowhere else.
const AUTOMATION_DENIAL_LOG = [
  '[XCUITest] Setting up remote logger for real device',
  '[XCUITest] Error: Timed out while enabling automation mode',
  '[XCUITest] Failed to create session. Will try to remove the WDA and start again',
].join('\n');

describe('classifying a WebDriverAgent launch failure from the server log', () => {
  it('names the on-device automation prompt, which no host-side change can clear', () => {
    const detail = classifyAppiumLog(AUTOMATION_DENIAL_LOG);

    expect(detail).toContain('Enable UI Automation');
    expect(detail).toContain('Look at the device');
  });

  // Absent is not the same as unrecognised, and neither is the same as a known
  // cause — reporting the wrong one sends a human to the wrong place.
  it('answers null for a log it does not recognise, and for no log at all', () => {
    expect(classifyAppiumLog('[XCUITest] something else entirely')).toBeNull();
    expect(classifyAppiumLog('')).toBeNull();
    expect(classifyAppiumLog(undefined)).toBeNull();
  });

  it('prefers a cause read from the log over the generic outer message', () => {
    const generic = classifyLaunchProbe({
      ok: false,
      message: 'xcodebuild failed with code 65',
    });
    const classified = classifyLaunchProbe({
      ok: false,
      message: 'xcodebuild failed with code 65',
      logCause: classifyAppiumLog(AUTOMATION_DENIAL_LOG),
    });

    expect(generic.detail).toContain('cause is not one this knows');
    expect(classified.detail).toContain('Enable UI Automation');
  });
});

// The integration the review found broken: the classifier recognised the fixture
// while the path that has to DELIVER it returned nothing on a real blocked
// device. Driven here with a controllable child, because the only other way to
// reach this code is an iPad refusing automation.
// Module scope: the end-to-end describe and the teardown-timing describe both
// drive the diagnostic through this controllable child.
const fakeAppium = (mode) => (port) =>
  spawn(process.execPath, [join(ROOT, 'tools/perf/tests/fixtures/fake-appium.mjs'), String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, MODE: mode },
  });

describe('the launch diagnostic end to end', () => {
  it('delivers the automation-mode cause the server logged', async () => {
    const probe = await diagnoseLaunchFailure({}, { spawnDiagnostic: fakeAppium('denial') });

    // Asserted FIRST so a failure prints why the diagnostic gave up, rather than
    // only that `cause` was null — which is the same "clean negative hides a
    // broken path" shape this whole diagnostic exists to avoid.
    expect(probe.diagnostic).toBeNull();
    expect(probe.cause).toContain('Enable UI Automation');
  }, 60_000);

  // "Ran and found nothing" and "never ran" must not read the same. They did,
  // which is why a broken diagnostic looked like an unrecognised cause.
  it('says so when the server logged nothing it knows', async () => {
    const probe = await diagnoseLaunchFailure({}, { spawnDiagnostic: fakeAppium('silent') });

    expect(probe.cause).toBeNull();
    expect(probe.diagnostic).toContain('logged no cause');
  }, 60_000);

  it('reports a server that died instead of hanging on it, naming how it exited', async () => {
    const probe = await diagnoseLaunchFailure({}, { spawnDiagnostic: fakeAppium('crash') });

    expect(probe.cause).toBeNull();
    // "with code N" / "with signal SIG…": a signal kill reports code null, and
    // printing that null is what once made a signal-exited server read as a
    // still-running one (issue 1309).
    expect(probe.diagnostic).toMatch(/exited early with (code -?\d+|signal SIG\w+)/);
  }, 60_000);

  // spawn reports a missing binary asynchronously, so this used to escape the
  // try/catch and could take the preflight down with it.
  it('survives a diagnostic binary that does not exist', async () => {
    const probe = await diagnoseLaunchFailure(
      {},
      { spawnDiagnostic: () => spawn('definitely-not-a-real-binary-xyz', []) }
    );

    expect(probe.cause).toBeNull();
    expect(probe.diagnostic).toContain('could not start');
  }, 60_000);

  it('tells the operator when the diagnostic itself failed', () => {
    const detail = classifyLaunchProbe({
      ok: false,
      message: 'xcodebuild failed with code 65',
      diagnostic: 'diagnostic server never became ready',
    }).detail;

    expect(detail).toContain('never became ready');
  });
});

// The mirror-image defect (issue 1309): a child that HONOURS SIGTERM exits
// with `code === null, signal === 'SIGTERM'`, and tracking only the code left
// it indistinguishable from a child still running — teardown escalated to
// SIGKILL against a corpse and then waited out the full escalation timeout,
// 5.53 s for a child that was already gone. Bounded through the PRODUCTION
// seam on purpose: the first version of this test built its own {code,signal}
// tracker and handed it in, which supplied the exact object the fix exists to
// supply — the whole fix could be reverted and the test stayed green, the
// isolation mistake issue 1309's finding 1 indicts. diagnoseLaunchFailure's
// own exit listener and finally are the code under test here.
describe('tearing down a diagnostic server that goes quietly', () => {
  // The `denial` fixture, deliberately: the silent server pays the full 5 s
  // log settle before teardown, which left no cutoff that both tolerates
  // shared-runner scheduling delay and stays reliably below the broken shape
  // (round-2 review: 5.6 s measured against a 9.5 s bound with the regression
  // at ~10.5). A classified cause exits the settle loop immediately, so the
  // correct path here is sub-second and the broken shape's extra SIGKILL
  // settle on the already-exited child is the ONLY multi-second contributor —
  // structural separation instead of a margin contest.
  it('returns promptly after the server exits by signal, without a second escalation wait', async () => {
    const startedAt = Date.now();
    const probe = await diagnoseLaunchFailure({}, { spawnDiagnostic: fakeAppium('denial') });
    const elapsedMs = Date.now() - startedAt;

    expect(probe.cause).toContain('Enable UI Automation');
    // Fixed shape ≈ fixture startup + classification (~0.5 s measured) plus a
    // ~10 ms SIGTERM exit; the broken tracking adds a full 5 s SIGKILL settle.
    expect(elapsedMs).toBeLessThan(4_000);
  }, 60_000);

  // The same clause spares the ENOENT child: spawn's error path never emits
  // `exit`, so only the child object's own exitCode/signalCode can say it is
  // gone — without them, teardown spent two settles on a process that never
  // started.
  it('returns promptly when the diagnostic binary never existed', async () => {
    const startedAt = Date.now();
    const probe = await diagnoseLaunchFailure(
      {},
      { spawnDiagnostic: () => spawn('definitely-not-a-real-binary-xyz', []) }
    );
    const elapsedMs = Date.now() - startedAt;

    expect(probe.diagnostic).toContain('could not start');
    expect(elapsedMs).toBeLessThan(5_000);
  }, 60_000);
});

// Bounding how long teardown WAITS is not ensuring the child left. A server that
// ignores SIGTERM outlived the old race: the function returned, its comment said
// nothing was left behind, and the process kept listening.
describe('tearing down a diagnostic server that will not go quietly', () => {
  it('escalates past SIGTERM and leaves nothing running', async () => {
    let child;
    const probe = await diagnoseLaunchFailure(
      {},
      {
        spawnDiagnostic: (port) => {
          child = spawn(
            process.execPath,
            [join(ROOT, 'tools/perf/tests/fixtures/stubborn-appium.mjs'), String(port)],
            { stdio: ['ignore', 'pipe', 'pipe'], detached: true }
          );
          return child;
        },
      }
    );

    expect(probe.cause).toBeNull();
    // The assertion the review asked for: the child is gone, not merely awaited.
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(child.killed || child.exitCode !== null || child.signalCode !== null).toBe(true);
    expect(() => process.kill(child.pid, 0)).toThrow();
  }, 60_000);
});
