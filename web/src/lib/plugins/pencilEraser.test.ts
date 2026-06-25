import { describe, it, expect, vi, beforeEach } from 'vitest';

// registerPlugin lazily resolves the web fallback on non-native platforms; in the unit env
// we invoke that factory directly so we're asserting our own fallback, not Capacitor's
// runtime selection.
vi.mock('@capacitor/core', () => ({
  registerPlugin: (_name: string, impls: { web: () => unknown }) => impls.web(),
}));

import { PencilEraser, initPencilEraser, handleDoubleTap } from './pencilEraser';
import { toolState, selectPen } from '$lib/state/tool.svelte';
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

describe('handleDoubleTap', () => {
  beforeEach(() => {
    selectPen();
    setPencilEraserEnabled(true);
    setApplePencilSeen(false);
  });

  it('records the pencil and toggles the eraser when enabled', () => {
    handleDoubleTap();
    expect(settings.applePencilSeen).toBe(true);
    expect(toolState.eraser).toBe(true);
    handleDoubleTap();
    expect(toolState.eraser).toBe(false);
  });

  it('still records the pencil but does not toggle when disabled', () => {
    setPencilEraserEnabled(false);
    handleDoubleTap();
    expect(settings.applePencilSeen).toBe(true);
    expect(toolState.eraser).toBe(false);
  });
});
