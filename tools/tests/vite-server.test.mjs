import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT } from '../lib/proc.mjs';
import {
  ForeignListenerError,
  freePort,
  portListenerOwners,
  portListenerPids,
  spawnViteServer,
} from '../lib/vite-server.mjs';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, spawn: vi.fn(), spawnSync: vi.fn() };
});

// What spawnSync reports when lsof is not on PATH.
function lsofNotFound() {
  const error = new Error('spawnSync lsof ENOENT');
  error.code = 'ENOENT';
  return { error, stdout: undefined };
}

beforeEach(() => {
  spawn.mockReset();
  spawnSync.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(process, 'kill').mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('freePort', () => {
  it('reports that automatic cleanup could not be checked when lsof is unavailable', async () => {
    spawnSync.mockReturnValue(lsofNotFound());

    await freePort(4173);

    expect(console.warn).toHaveBeenCalledExactlyOnceWith(
      'Unable to check or clear port 4173 automatically because lsof could not be launched. If the port is in use, stop its listener before retrying.'
    );
    expect(process.kill).not.toHaveBeenCalled();
  });

  // Only an lsof that never ran is tolerated: one that ran and failed would
  // otherwise read as "nothing to clear".
  it('fails when lsof reports an operational error', async () => {
    spawnSync.mockReturnValue({ status: 1, stdout: '', stderr: 'lsof: unsupported TCP state' });

    await expect(freePort(4173)).rejects.toThrow(
      'lsof failed while checking port 4173: lsof: unsupported TCP state'
    );
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('stays silent when lsof finds no listener', async () => {
    spawnSync.mockReturnValue({ status: 1, stdout: '' });

    await freePort(4173);

    expect(console.warn).not.toHaveBeenCalled();
    expect(process.kill).not.toHaveBeenCalled();
  });

  it('stops a listener this checkout owns', async () => {
    spawnSync
      .mockReturnValueOnce({ status: 0, stdout: '4242\n' })
      .mockReturnValueOnce({ status: 0, stdout: `p4242\nfcwd\nn${join(ROOT, 'web')}\n` })
      .mockReturnValueOnce({ status: 1, stdout: '' });

    await freePort(4173);

    expect(process.kill).toHaveBeenCalledExactlyOnceWith(4242, 'SIGTERM');
  });

  // One foreign listener is enough to refuse the whole port: stopping only the
  // owned one would leave strictPort failing against the other anyway.
  it('signals nothing when any listener belongs to another checkout', async () => {
    spawnSync
      .mockReturnValueOnce({ status: 0, stdout: '4242\n4343\n' })
      .mockReturnValueOnce({ status: 0, stdout: `p4242\nfcwd\nn${ROOT}\n` })
      .mockReturnValueOnce({ status: 0, stdout: 'p4343\nfcwd\nn/elsewhere\n' });

    const refusal = freePort(4173);

    await expect(refusal).rejects.toBeInstanceOf(ForeignListenerError);
    await expect(refusal).rejects.toThrow(
      'port 4173 is held by a listener outside this checkout (pid 4343)'
    );
    expect(process.kill).not.toHaveBeenCalled();
  });

  // The perf operator session reads ForeignListenerError as "the port changed
  // owners after preflight", so a port that never clears must not be one.
  it('rejects with the holding pid, not an ownership refusal, when the port is not released', async () => {
    vi.useFakeTimers();
    spawnSync.mockImplementation((_command, args) =>
      args.includes('-sTCP:LISTEN')
        ? { status: 0, stdout: '4242\n' }
        : { status: 0, stdout: `p4242\nfcwd\nn${ROOT}\n` }
    );

    const outcome = freePort(4173).catch((error) => error);
    await vi.runAllTimersAsync();
    const error = await outcome;

    expect(error).not.toBeInstanceOf(ForeignListenerError);
    expect(error.message).toBe('port 4173 is still held by pid 4242 after 5000ms');
  });
});

describe('portListenerPids', () => {
  it('throws when lsof cannot be launched rather than reporting no listener', () => {
    spawnSync.mockReturnValue(lsofNotFound());

    expect(() => portListenerPids(4173)).toThrow(
      'lsof could not be launched to check port 4173: spawnSync lsof ENOENT'
    );
  });
});

describe('portListenerOwners', () => {
  it('throws when lsof cannot be launched rather than reporting no listener', () => {
    spawnSync.mockReturnValue(lsofNotFound());

    expect(() => portListenerOwners(4173, '/repo')).toThrow(
      'lsof could not be launched to check port 4173: spawnSync lsof ENOENT'
    );
  });

  it('treats an unreadable listener cwd as foreign', () => {
    spawnSync
      .mockReturnValueOnce({ status: 0, stdout: '4242\n' })
      .mockReturnValueOnce({ status: 1, stdout: '' });

    expect(portListenerOwners(4173, '/repo')).toEqual([{ pid: 4242, cwd: null, owned: false }]);
  });
});

// Every case here must end in stop() or release(): a spawn whose safety-net
// listeners are still registered would fire kill() against this fake pid at the
// real process exit, long after the process.kill spy is restored.
describe('spawnViteServer', () => {
  const FAKE_PID = 424242;
  // No stream properties: every case that reaches release() spawns durable
  // sinks, and node gives such a child a null stdout/stderr.
  const fakeChild = () => ({ pid: FAKE_PID, unref: vi.fn(), kill: vi.fn() });

  /** Both nets, because dropping only one still leaks a listener per server. */
  const netCounts = () => ({
    exit: process.listenerCount('exit'),
    sigint: process.listenerCount('SIGINT'),
  });

  it('runs vite directly under node in its own process group', () => {
    spawn.mockReturnValue(fakeChild());

    const { stop } = spawnViteServer(5199, {
      env: { PUBLIC_ENABLE_DEV_HARNESS: 'true' },
      stdout: 'pipe',
    });
    stop();

    const [command, args, options] = spawn.mock.calls[0];
    expect(command).toBe(process.execPath);
    expect(args[0].endsWith(join('node_modules', 'vite', 'bin', 'vite.js'))).toBe(true);
    expect(args.slice(1)).toEqual(['dev', '--port', '5199', '--strictPort']);
    expect(options.detached).toBe(true);
    expect(options.stdio).toEqual(['ignore', 'pipe', 'inherit']);
    expect(options.env.PUBLIC_ENABLE_DEV_HARNESS).toBe('true');
  });

  it('gives the child the stderr the caller asked for', () => {
    spawn.mockReturnValue(fakeChild());

    const { stop } = spawnViteServer(5199, { stdout: 'ignore', stderr: 'pipe' });
    stop();

    expect(spawn.mock.calls[0][2].stdio).toEqual(['ignore', 'ignore', 'pipe']);
  });

  it('stop() signals the whole group and drops its safety nets', () => {
    spawn.mockReturnValue(fakeChild());
    const before = netCounts();

    const { stop } = spawnViteServer(5199);
    expect(netCounts()).toEqual({ exit: before.exit + 1, sigint: before.sigint + 1 });
    stop();

    expect(process.kill).toHaveBeenCalledExactlyOnceWith(-FAKE_PID, 'SIGTERM');
    expect(netCounts()).toEqual(before);
  });

  it('release() unrefs the child and drops its safety nets, without killing vite', () => {
    const child = fakeChild();
    spawn.mockReturnValue(child);
    const before = netCounts();

    const { release } = spawnViteServer(5199, { stdout: 'ignore', stderr: 'ignore' });
    release();

    expect(child.unref).toHaveBeenCalledOnce();
    expect(process.kill).not.toHaveBeenCalled();
    expect(child.kill).not.toHaveBeenCalled();
    expect(netCounts()).toEqual(before);
  });

  // Which stream, and which borrowed target, decide nothing: a survivor holding
  // any handle of this process's breaks something once this process exits, so
  // release() refuses instead of choosing. tools/tests/vite-server-release.test.mjs
  // is where the two failures are demonstrated against a live server.
  it.each([
    ['stdout', { stdout: 'pipe', stderr: 'ignore' }],
    ['stderr', { stdout: 'ignore', stderr: 'pipe' }],
    ['an inherited stream', { stdout: 'ignore', stderr: 'inherit' }],
    ['the defaults', undefined],
  ])('release() refuses a server holding %s', (_label, options) => {
    spawn.mockReturnValue(fakeChild());
    const before = netCounts();

    const { stop, release } = spawnViteServer(5199, options);

    expect(release).toThrow(/durable stdio sinks/);
    stop();
    expect(netCounts()).toEqual(before);
  });

  it('release() accepts a file descriptor as a sink', () => {
    const child = fakeChild();
    spawn.mockReturnValue(child);
    const logFd = 7;

    const { release } = spawnViteServer(5199, { stdout: logFd, stderr: logFd });
    release();

    expect(child.unref).toHaveBeenCalledOnce();
  });
});
