import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT } from '../lib/proc.mjs';
import { portListenerPids, spawnSiteServer } from '../lib/site-server.mjs';

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

describe('portListenerPids', () => {
  it('throws when lsof cannot be launched rather than reporting no listener', () => {
    spawnSync.mockReturnValue(lsofNotFound());

    expect(() => portListenerPids(4173)).toThrow(
      'lsof could not be launched to check port 4173: spawnSync lsof ENOENT'
    );
  });
});

describe('spawnSiteServer', () => {
  const FAKE_PID = 424242;
  // No stream properties: every case that reaches release() spawns durable
  // sinks, and node gives such a child a null stdout/stderr.
  const fakeChild = () => ({ pid: FAKE_PID, unref: vi.fn(), kill: vi.fn() });

  /** Both nets, because dropping only one still leaks a listener per server. */
  const netCounts = () => ({
    exit: process.listenerCount('exit'),
    sigint: process.listenerCount('SIGINT'),
  });

  it('runs the export host directly under node in its own process group', () => {
    spawn.mockReturnValue(fakeChild());

    const { stop } = spawnSiteServer(5199, { stdout: 'pipe' });
    stop();

    const [command, args, options] = spawn.mock.calls[0];
    expect(command).toBe(process.execPath);
    expect(args).toEqual([
      '--experimental-strip-types',
      '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
      join(ROOT, 'e2e', 'server', 'serve.ts'),
      '--port',
      '5199',
    ]);
    expect(options.cwd).toBe(ROOT);
    expect(options.detached).toBe(true);
    expect(options.stdio).toEqual(['ignore', 'pipe', 'inherit']);
  });

  it('gives the child the stderr the caller asked for', () => {
    spawn.mockReturnValue(fakeChild());

    const { stop } = spawnSiteServer(5199, { stdout: 'ignore', stderr: 'pipe' });
    stop();

    expect(spawn.mock.calls[0][2].stdio).toEqual(['ignore', 'ignore', 'pipe']);
  });

  it('stop() signals the whole group and drops its safety nets', () => {
    spawn.mockReturnValue(fakeChild());
    const before = netCounts();

    const { stop } = spawnSiteServer(5199);
    expect(netCounts()).toEqual({ exit: before.exit + 1, sigint: before.sigint + 1 });
    stop();

    expect(process.kill).toHaveBeenCalledExactlyOnceWith(-FAKE_PID, 'SIGTERM');
    expect(netCounts()).toEqual(before);
  });

  it('release() unrefs the child and drops its safety nets, without killing the site', () => {
    const child = fakeChild();
    spawn.mockReturnValue(child);
    const before = netCounts();

    const { release } = spawnSiteServer(5199, { stdout: 'ignore', stderr: 'ignore' });
    release();

    expect(child.unref).toHaveBeenCalledOnce();
    expect(process.kill).not.toHaveBeenCalled();
    expect(child.kill).not.toHaveBeenCalled();
    expect(netCounts()).toEqual(before);
  });

  // Which stream, and which borrowed target, decide nothing: a survivor holding
  // any handle of this process's breaks something once this process exits, so
  // release() refuses instead of choosing. tools/tests/site-server-release.test.mjs
  // is where the two failures are demonstrated against a live server.
  it.each([
    ['stdout', { stdout: 'pipe', stderr: 'ignore' }],
    ['stderr', { stdout: 'ignore', stderr: 'pipe' }],
    ['an inherited stream', { stdout: 'ignore', stderr: 'inherit' }],
    ['the defaults', undefined],
  ])('release() refuses a server holding %s', (_label, options) => {
    spawn.mockReturnValue(fakeChild());
    const before = netCounts();

    const { stop, release } = spawnSiteServer(5199, options);

    expect(release).toThrow(/durable stdio sinks/);
    stop();
    expect(netCounts()).toEqual(before);
  });

  it('release() accepts a file descriptor as a sink', () => {
    const child = fakeChild();
    spawn.mockReturnValue(child);
    const logFd = 7;

    const { release } = spawnSiteServer(5199, { stdout: logFd, stderr: logFd });
    release();

    expect(child.unref).toHaveBeenCalledOnce();
  });
});
