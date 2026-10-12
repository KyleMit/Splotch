// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { lazyPluginModule } from './nativePlugin';

describe('lazyPluginModule', () => {
  it('memoizes a successful load across callers', async () => {
    const load = vi.fn(() => Promise.resolve('mod'));
    const get = lazyPluginModule(load);
    await expect(get()).resolves.toBe('mod');
    await expect(get()).resolves.toBe('mod');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('drops the memo when the load rejects, so the next caller retries', async () => {
    let attempts = 0;
    const load = vi.fn(() => {
      attempts += 1;
      return attempts === 1 ? Promise.reject(new Error('chunk')) : Promise.resolve('mod');
    });
    const get = lazyPluginModule(load);
    await expect(get()).rejects.toThrow('chunk');
    await expect(get()).resolves.toBe('mod');
    expect(load).toHaveBeenCalledTimes(2);
  });
});
