import { describe, it, expect, vi } from 'vitest';

// registerPlugin lazily resolves the web fallback on non-native platforms; in the unit
// env we invoke that factory directly so we're asserting our own fallback, not Capacitor's
// runtime selection.
vi.mock('@capacitor/core', () => ({
  registerPlugin: (_name: string, impls: { web: () => unknown }) => impls.web(),
}));

import { DeviceLock } from './deviceLock';

describe('DeviceLock web fallback', () => {
  it('reports never locked on the web', async () => {
    expect(await DeviceLock.isLocked()).toEqual({ locked: false });
  });
});
