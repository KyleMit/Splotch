import { describe, it, expect, vi } from 'vitest';

// registerPlugin lazily resolves the web fallback on non-native platforms; in the unit env
// we invoke that factory directly so we're asserting our own fallback, not Capacitor's
// runtime selection.
vi.mock('@capacitor/core', () => ({
  registerPlugin: (_name: string, impls: { web: () => unknown }) => impls.web()
}));

import { PencilEraser, initPencilEraser } from './pencilEraser';

describe('PencilEraser web fallback', () => {
  it('addListener returns a removable, no-op handle', async () => {
    const handle = await PencilEraser.addListener('doubleTap', () => {});
    await expect(handle.remove()).resolves.toBeUndefined();
  });

  it('initPencilEraser is a no-op off iOS-native', () => {
    const cleanup = initPencilEraser();
    expect(() => cleanup()).not.toThrow();
  });
});
