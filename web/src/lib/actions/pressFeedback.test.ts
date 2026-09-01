import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForPressFeedbackToSettle } from './pressFeedback';

function frameQueue() {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  return frames;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('press feedback', () => {
  it('observes release animations after a frame and retires them before returning', async () => {
    const frames = frameQueue();
    const node = document.createElement('button');
    const release = Promise.withResolvers<void>();
    const getAnimations = vi.fn(() => [{ finished: release.promise }]);
    Object.defineProperty(node, 'getAnimations', { value: getAnimations });

    const settled = waitForPressFeedbackToSettle(node);
    expect(getAnimations).not.toHaveBeenCalled();

    frames.shift()!(0);
    await Promise.resolve();
    expect(getAnimations).toHaveBeenCalledOnce();

    release.resolve();
    await vi.waitFor(() => expect(frames).toHaveLength(1));

    frames.shift()!(16);
    await vi.waitFor(() => expect(frames).toHaveLength(1));

    frames.shift()!(32);
    await settled;
  });

  it('returns after the observation frame when the control has no release animation', async () => {
    const frames = frameQueue();
    const node = document.createElement('button');
    Object.defineProperty(node, 'getAnimations', { value: vi.fn(() => []) });

    const settled = waitForPressFeedbackToSettle(node);
    frames.shift()!(0);
    await settled;

    expect(frames).toHaveLength(0);
  });
});
