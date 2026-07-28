import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({ native: false, platform: 'web' as 'ios' | 'web' }));

// registerPlugin lazily resolves the web fallback on non-native platforms; in the unit env
// we invoke that factory directly so we're asserting our own fallback, not Capacitor's
// runtime selection.
vi.mock('@capacitor/core', () => ({
  registerPlugin: (_name: string, impls: { web: () => unknown }) => impls.web(),
}));

vi.mock('$lib/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/platform')>()),
  isNative: () => mocks.native,
  getPlatform: () => mocks.platform,
}));

import { PencilEraser, initPencilEraser, handleDoubleTap } from './pencilEraser';
import { toolState, selectBrush } from '$lib/state/tool.svelte';
import { settings, setPencilEraserEnabled, setApplePencilSeen } from '$lib/state/settings.svelte';

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

describe('initPencilEraser on iOS-native', () => {
  beforeEach(() => {
    mocks.native = true;
    mocks.platform = 'ios';
  });

  afterEach(() => {
    mocks.native = false;
    mocks.platform = 'web';
    vi.restoreAllMocks();
  });

  it('logs and swallows a rejected subscription', async () => {
    const failure = new Error('bridge not ready');
    vi.spyOn(PencilEraser, 'addListener').mockRejectedValue(failure);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const cleanup = initPencilEraser();
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith(expect.any(String), failure));

    expect(() => cleanup()).not.toThrow();
  });
});

describe('handleDoubleTap', () => {
  beforeEach(() => {
    selectBrush('pen');
    setPencilEraserEnabled(true);
    setApplePencilSeen(false);
  });

  it('records the pencil and toggles the eraser when enabled', () => {
    handleDoubleTap();
    expect(settings.applePencilSeen).toBe(true);
    expect(toolState.brush).toBe('eraser');
    handleDoubleTap();
    expect(toolState.brush).toBe('pen');
  });

  it('still records the pencil but does not toggle when disabled', () => {
    setPencilEraserEnabled(false);
    handleDoubleTap();
    expect(settings.applePencilSeen).toBe(true);
    expect(toolState.brush).toBe('pen');
  });
});
