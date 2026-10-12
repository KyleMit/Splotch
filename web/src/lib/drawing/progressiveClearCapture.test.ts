import { describe, expect, it, vi } from 'vitest';

import { createProgressiveClearCapture } from './progressiveClearCapture';

describe('progressive clear capture', () => {
  it('stops scheduling frames after a failed capture leaves the item pending', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const command = {};
    const capture = createProgressiveClearCapture({
      tileCount: () => 1,
      capture: () => false,
      onComplete: vi.fn(),
    });

    capture.schedule(command, [0]);
    frames.shift()?.(0);

    expect(frames).toHaveLength(0);
    expect(capture.takePendingIndices(command)).toEqual([0]);
    vi.unstubAllGlobals();
  });
});
