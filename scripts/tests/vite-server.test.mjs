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
  const fakeChild = () => ({ pid: FAKE_PID, unref: vi.fn(), kill: vi.fn(), stdout: null });

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

  it('stop() signals the whole group and drops its safety nets', () => {
    spawn.mockReturnValue(fakeChild());
    const listenersBefore = process.listenerCount('exit');

    const { stop } = spawnViteServer(5199);
    expect(process.listenerCount('exit')).toBe(listenersBefore + 1);
    stop();

    expect(process.kill).toHaveBeenCalledExactlyOnceWith(-FAKE_PID, 'SIGTERM');
    expect(process.listenerCount('exit')).toBe(listenersBefore);
  });

  it('release() unrefs the child and drops the nets without killing vite', () => {
    const child = fakeChild();
    spawn.mockReturnValue(child);
    const listenersBefore = process.listenerCount('exit');

    const { release } = spawnViteServer(5199);
    release();

    expect(child.unref).toHaveBeenCalledOnce();
    expect(process.kill).not.toHaveBeenCalled();
    expect(child.kill).not.toHaveBeenCalled();
    expect(process.listenerCount('exit')).toBe(listenersBefore);
  });
});
