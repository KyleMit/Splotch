import { afterEach, describe, expect, it, vi } from 'vitest';
import { runSingleFlightActivation } from './pressFeedback';

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
  it('commits activation immediately and runs the action after that state paints', async () => {
    const frames = frameQueue();
    const button = document.createElement('button');
    const activate = vi.fn();

    const activation = runSingleFlightActivation(button, activate);
    expect(button.disabled).toBe(true);
    expect(button.classList).toContain('activation-pending');
    expect(activate).not.toHaveBeenCalled();

    frames.shift()!(0);
    await Promise.resolve();
    expect(activate).not.toHaveBeenCalled();

    frames.shift()!(16);
    await Promise.resolve();
    await Promise.resolve();
    expect(activate).toHaveBeenCalledOnce();
    expect(button.disabled).toBe(true);
    expect(button.classList).toContain('activation-pending');

    frames.shift()!(32);
    await activation;
    expect(button.disabled).toBe(false);
    expect(button.classList).not.toContain('activation-pending');
  });

  it('blocks duplicate and pre-disabled activations', async () => {
    const frames = frameQueue();
    const button = document.createElement('button');
    const activate = vi.fn();

    const first = runSingleFlightActivation(button, activate);
    await expect(runSingleFlightActivation(button, activate)).resolves.toBe(false);
    frames.shift()!(0);
    await Promise.resolve();
    frames.shift()!(16);
    await Promise.resolve();
    await Promise.resolve();
    frames.shift()!(32);
    await expect(first).resolves.toBe(true);

    button.disabled = true;
    await expect(runSingleFlightActivation(button, activate)).resolves.toBe(false);
    expect(activate).toHaveBeenCalledOnce();
  });
});
