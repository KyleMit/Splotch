import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { freePort } from '../lib/vite-server.mjs';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, spawnSync: vi.fn() };
});

beforeEach(() => {
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
