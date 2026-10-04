import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import { portListenerOwners } from '../../lib/vite-server.mjs';
import { PORT_ROLES, resolvePort } from '../lib/capture-readiness.mjs';
import { connectDevice } from '../lib/profile-device-session.mjs';
import { PROXY_COMMAND, startInspectorProxy, waitForDevice } from '../lib/webkit-inspector.mjs';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, spawn: vi.fn() };
});

vi.mock('../../lib/vite-server.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, portListenerOwners: vi.fn() };
});

// A refusal lands within one DEVICE_POLL_INTERVAL_MS of webkit-inspector.mjs;
// one that waits out its DEVICE_READY_TIMEOUT_MS instead fails on this.
const REFUSAL_TIMEOUT_MS = 5_000;
// Room for one empty poll, far short of the real device budget.
const SHORT_DEVICE_WAIT_MS = 50;
const INSPECTOR_PORT = PORT_ROLES.inspector.port;
const RELAY_PID = 7101;
const HOLDER_PID = 4242;
const IPAD = {
  deviceId: 'fake-ipad',
  deviceName: 'Fake iPad',
  deviceOSVersion: '26.0',
  url: 'localhost:9222',
};
const BIND_FAILURE_LINE = `Unable to bind "devices list" on port ${INSPECTOR_PORT}-${INSPECTOR_PORT}`;
const relayListener = { pid: RELAY_PID, cwd: ROOT, owned: true };
const foreignListener = { pid: HOLDER_PID, cwd: '/elsewhere', owned: false };

// Stands in for the spawned ios_webkit_debug_proxy. `act` runs a macrotask
// after the spawn, once the caller has attached its listeners, which is when a
// real child's first events can arrive.
function relayThat(act = () => {}) {
  const relay = Object.assign(new EventEmitter(), {
    pid: RELAY_PID,
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
  });
  spawn.mockImplementation(() => {
    setImmediate(() => act(relay));
    return relay;
  });
  return relay;
}

const exits = (code, stderr) => (relay) => {
  relay.emit('exit', code, null);
  relay.stderr.once('end', () => relay.emit('close', code, null));
  relay.stderr.end(stderr);
};

const failsToStart = (relay) => {
  relay.emit(
    'error',
    Object.assign(new Error(`spawn ${PROXY_COMMAND} ENOENT`), { code: 'ENOENT' })
  );
  relay.emit('close', -2, null);
};

const reportsBindFailure = (relay) => relay.stderr.write(`${BIND_FAILURE_LINE}\n`);

// The device list whatever holds the port answers with. Each answer waits a
// macrotask, so anything the relay printed before it has been delivered.
function portLists(...devices) {
  const fetchStub = vi.fn(async () => {
    await new Promise((resolve) => setImmediate(resolve));
    return { ok: true, json: async () => devices };
  });
  vi.stubGlobal('fetch', fetchStub);
  return fetchStub;
}

let printed;

beforeEach(() => {
  printed = [];
  vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Error(`exit ${code}`);
  });
  vi.spyOn(console, 'error').mockImplementation((line) => printed.push(String(line)));
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  spawn.mockReset();
  portListenerOwners.mockReset();
});

async function refusal() {
  await expect(connectDevice()).rejects.toThrow('exit 1');
  return printed.join('\n');
}

describe('the inspector relay port', () => {
  it('blocks a holder from outside this checkout by name, with an alternate on offer', () => {
    const decision = resolvePort('inspector', {
      holder: { pid: HOLDER_PID, ours: false, cwd: '/elsewhere' },
      alternatives: [{ port: 9231, holder: null }],
    });

    expect(decision).toMatchObject({ port: 9221, action: 'blocked' });
    expect(decision.reason).toContain(`pid ${HOLDER_PID}, cwd /elsewhere`);
  });

  it("blocks this checkout's own leftover too, since nothing restarts it", () => {
    const decision = resolvePort('inspector', {
      holder: { pid: HOLDER_PID, ours: true, cwd: ROOT },
    });

    expect(decision).toMatchObject({ port: 9221, action: 'blocked' });
    expect(decision.reason).toContain(`pid ${HOLDER_PID}`);
    expect(decision.reason).toContain('npm run perf:release');
  });

  it('starts on its one port when free', () => {
    expect(resolvePort('inspector', { holder: null })).toMatchObject({
      port: 9221,
      action: 'start',
    });
  });
});

describe('connectDevice', () => {
  // The positive control: with its relay alone on the port, the refusals below
  // are about the relay rather than an unwired double.
  it('returns the device its own relay lists, on the declared port', async () => {
    relayThat();
    const fetchStub = portLists(IPAD);
    portListenerOwners.mockReturnValue([relayListener]);

    const { device, stopProxy } = await connectDevice();
    stopProxy();

    expect(device).toEqual(IPAD);
    expect(spawn).toHaveBeenCalledWith(
      PROXY_COMMAND,
      ['-c', `null:${INSPECTOR_PORT},:9222-9322`],
      expect.anything()
    );
    expect(fetchStub).toHaveBeenCalledWith(
      `http://localhost:${INSPECTOR_PORT}/json`,
      expect.anything()
    );
  });

  it(
    'refuses a relay that exits, with its own stderr, before any device appears',
    async () => {
      const relay = relayThat(exits(1, 'Could not connect to usbmuxd\n'));
      portLists();
      portListenerOwners.mockReturnValue([]);

      expect(await refusal()).toContain(
        `${PROXY_COMMAND} exited with code 1\nCould not connect to usbmuxd`
      );
      expect(relay.kill).toHaveBeenCalled();
    },
    REFUSAL_TIMEOUT_MS
  );

  it(
    'refuses a relay whose binary never started',
    async () => {
      relayThat(failsToStart);
      portLists();

      expect(await refusal()).toContain(`spawn ${PROXY_COMMAND} ENOENT`);
    },
    REFUSAL_TIMEOUT_MS
  );

  // What an exit check alone misses: a relay that loses the port keeps
  // running, and whatever holds the port lists the device in its place.
  it(
    'refuses a relay that reports a failed bind, though the port lists a device',
    async () => {
      const relay = relayThat(reportsBindFailure);
      portLists(IPAD);
      portListenerOwners.mockReturnValue([foreignListener]);

      expect(await refusal()).toContain(BIND_FAILURE_LINE);
      expect(relay.kill).toHaveBeenCalled();
    },
    REFUSAL_TIMEOUT_MS
  );

  // A holder bound to 127.0.0.1 lets the relay's wildcard bind succeed with
  // nothing on stderr, and lsof then lists both listeners.
  it(
    'refuses a device listed while another process shares the port',
    async () => {
      const relay = relayThat();
      portLists(IPAD);
      portListenerOwners.mockReturnValue([relayListener, foreignListener]);

      expect(await refusal()).toContain(
        `port ${INSPECTOR_PORT} is held outside this checkout (pid ${HOLDER_PID}, cwd /elsewhere)`
      );
      expect(relay.kill).toHaveBeenCalled();
    },
    REFUSAL_TIMEOUT_MS
  );

  it(
    'fails closed when lsof names no listener',
    async () => {
      relayThat();
      portLists(IPAD);
      portListenerOwners.mockReturnValue([]);

      expect(await refusal()).toContain(`lsof names no listener on port ${INSPECTOR_PORT}`);
    },
    REFUSAL_TIMEOUT_MS
  );
});

describe('waitForDevice', () => {
  // A holder that lists nothing would otherwise end the wait as "no device",
  // and send someone to check the cable instead of the port.
  it('names a holder sharing the port when no device appears', async () => {
    relayThat();
    portLists();
    portListenerOwners.mockReturnValue([relayListener, foreignListener]);
    const relay = startInspectorProxy();

    const outcome = await waitForDevice(relay, undefined, SHORT_DEVICE_WAIT_MS);
    relay.stop();

    expect(outcome.device).toBeUndefined();
    expect(outcome.problem).toContain(`pid ${HOLDER_PID}`);
  });

  it('reports no device and no problem when its own relay lists none', async () => {
    relayThat();
    portLists();
    portListenerOwners.mockReturnValue([relayListener]);
    const relay = startInspectorProxy();

    const outcome = await waitForDevice(relay, undefined, SHORT_DEVICE_WAIT_MS);
    relay.stop();

    expect(outcome).toEqual({});
  });
});
