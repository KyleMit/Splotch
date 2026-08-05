import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { freePort, spawnViteServer } from '../lib/vite-server.mjs';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, spawn: vi.fn(), spawnSync: vi.fn() };
});

beforeEach(() => {
  spawn.mockReset();
  spawnSync.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(process, 'kill').mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('freePort', () => {
  it('reports that automatic cleanup could not be checked when lsof is unavailable', () => {
    const error = new Error('spawnSync lsof ENOENT');
    error.code = 'ENOENT';
    spawnSync.mockReturnValue({ error, stdout: undefined });

    freePort(4173);

    expect(console.warn).toHaveBeenCalledExactlyOnceWith(
      'Unable to check or clear port 4173 automatically because lsof could not be launched. If the port is in use, stop its listener before retrying.'
    );
    expect(process.kill).not.toHaveBeenCalled();
  });

  it('stays silent when lsof finds no listener', () => {
    spawnSync.mockReturnValue({ status: 1, stdout: '' });

    freePort(4173);

    expect(console.warn).not.toHaveBeenCalled();
    expect(process.kill).not.toHaveBeenCalled();
  });
});

// Every case here must end in stop() or release(): a spawn whose safety-net
// listeners are still registered would fire kill() against this fake pid at the
// real process exit, long after the process.kill spy is restored.
describe('spawnViteServer', () => {
  const FAKE_PID = 424242;
  const fakeChild = () => ({
    pid: FAKE_PID,
    unref: vi.fn(),
    kill: vi.fn(),
    stdout: { destroy: vi.fn() },
    stderr: { destroy: vi.fn() },
  });

  /** Both nets, because dropping only one still leaks a listener per server. */
  const netCounts = () => ({
    exit: process.listenerCount('exit'),
    sigint: process.listenerCount('SIGINT'),
  });

  it('runs vite directly under node in its own process group', () => {
    spawn.mockReturnValue(fakeChild());

    const { release } = spawnViteServer(5199, {
      env: { PUBLIC_ENABLE_DEV_HARNESS: 'true' },
      stdout: 'pipe',
    });
    release();

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

    const { release } = spawnViteServer(5199, { stdout: 'ignore', stderr: 'pipe' });
    release();

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

  // A released server outlives this process, so anything it still holds is a leak
  // in the other direction: an undropped pipe keeps the event loop alive and the
  // invoking command never returns.
  it('release() drops the pipes and unrefs the child, without killing vite', () => {
    const child = fakeChild();
    spawn.mockReturnValue(child);
    const before = netCounts();

    const { release } = spawnViteServer(5199, { stdout: 'pipe', stderr: 'pipe' });
    release();

    expect(child.stdout.destroy).toHaveBeenCalledOnce();
    expect(child.stderr.destroy).toHaveBeenCalledOnce();
    expect(child.unref).toHaveBeenCalledOnce();
    expect(process.kill).not.toHaveBeenCalled();
    expect(child.kill).not.toHaveBeenCalled();
    expect(netCounts()).toEqual(before);
  });
});
