import { describe, expect, it } from 'vitest';
import {
  androidWakeActions,
  appiumReuse,
  classifyIosIdentifier,
  classifyLaunchProbe,
  iosIdentifierProblem,
  resolvePort,
  summarize,
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
