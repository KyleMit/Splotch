import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));
vi.mock('../lib/proc.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, sleep: vi.fn() };
});

import { spawnSync } from 'node:child_process';
import { killDevPorts } from '../dev-kill.mjs';
import { sleep } from '../lib/proc.mjs';

const noListeners = { status: 1, stdout: '', stderr: '' };

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('killDevPorts', () => {
  it('terminates listeners and succeeds once the port clears', async () => {
    spawnSync
      .mockReturnValueOnce({ status: 0, stdout: '123\n', stderr: '' })
      .mockReturnValueOnce(noListeners);
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);

    await killDevPorts([5199]);

    expect(kill).toHaveBeenCalledTimes(1);
    expect(kill).toHaveBeenCalledWith(123, 'SIGTERM');
  });

  it('succeeds without signaling when nothing listens', async () => {
    spawnSync.mockReturnValue(noListeners);
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);

    await killDevPorts([5199]);

    expect(kill).not.toHaveBeenCalled();
  });

  it('escalates a listener that survives SIGTERM and verifies that it exits', async () => {
    vi.useFakeTimers({ now: 0 });
    sleep.mockImplementation(async () => vi.setSystemTime(Date.now() + 1_000));
    spawnSync
      .mockReturnValueOnce({ status: 0, stdout: '123\n', stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: '123\n', stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: '123\n', stderr: '' })
      .mockReturnValueOnce(noListeners);
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);

    await killDevPorts([5199]);

    expect(kill).toHaveBeenCalledWith(123, 'SIGTERM');
    expect(kill).toHaveBeenCalledWith(123, 'SIGKILL');
  });

  it('fails when a listener survives SIGKILL', async () => {
    vi.useFakeTimers({ now: 0 });
    sleep.mockImplementation(async () => vi.setSystemTime(Date.now() + 1_000));
    spawnSync.mockReturnValue({ status: 0, stdout: '123\n', stderr: '' });
    vi.spyOn(process, 'kill').mockImplementation(() => true);

    await expect(killDevPorts([5199])).rejects.toThrow(
      'Port 5199 is still in use after SIGKILL (pids 123).'
    );
  });

  it('fails when lsof cannot be launched', async () => {
    spawnSync.mockReturnValue({ error: new Error('lsof missing') });

    await expect(killDevPorts([5199])).rejects.toThrow('lsof missing');
  });

  it('fails when lsof is terminated by a signal', async () => {
    spawnSync.mockReturnValue({ signal: 'SIGKILL', status: null, stdout: '', stderr: '' });

    await expect(killDevPorts([5199])).rejects.toThrow(
      'lsof was terminated by SIGKILL while checking port 5199.'
    );
  });

  it('fails when lsof reports an operational error instead of an empty match', async () => {
    spawnSync.mockReturnValue({ status: 1, stdout: '', stderr: 'lsof: unsupported TCP state' });

    await expect(killDevPorts([5199])).rejects.toThrow(
      'lsof failed while checking port 5199: lsof: unsupported TCP state'
    );
  });
});
