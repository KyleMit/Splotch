import { afterEach, describe, expect, it, vi } from 'vitest';

let stopDrawSound: (() => void) | undefined;

afterEach(() => {
  stopDrawSound?.();
  stopDrawSound = undefined;
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
});

function stubSuspendedAudioContext(resume: () => Promise<void>) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)) })
  );
  vi.stubGlobal(
    'AudioContext',
    class {
      state = 'suspended';
      currentTime = 0;
      destination = {};

      resume = resume;
      decodeAudioData = vi.fn().mockResolvedValue({ duration: 1 });
      createGain = vi.fn(() => ({
        gain: {
          value: 0,
          cancelScheduledValues: vi.fn(),
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      }));
      createBufferSource = vi.fn(() => ({
        buffer: null,
        loop: false,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      }));
    }
  );
}

describe('drawing sound context resume', () => {
  it('requests a suspended context resume once per active gesture', async () => {
    const { setSound } = await import('$lib/state/settings.svelte');
    const drawingSound = await import('./drawingSound');
    stopDrawSound = drawingSound.stopDrawSound;
    const resume = vi.fn().mockResolvedValue(undefined);
    stubSuspendedAudioContext(resume);

    setSound(true);
    drawingSound.playDrawSound({ speed: 0, isStrokeStart: true });
    for (let i = 0; i < 60; i++) {
      drawingSound.playDrawSound({ speed: 0.45, isStrokeStart: false });
    }
    expect(resume).toHaveBeenCalledOnce();

    drawingSound.stopDrawSound();
    drawingSound.playDrawSound({ speed: 0, isStrokeStart: true });
    expect(resume).toHaveBeenCalledTimes(2);
  });

  it('retries a rejected context resume during the same gesture', async () => {
    const { setSound } = await import('$lib/state/settings.svelte');
    const drawingSound = await import('./drawingSound');
    stopDrawSound = drawingSound.stopDrawSound;
    const resume = vi
      .fn()
      .mockRejectedValueOnce(new Error('activation expired'))
      .mockResolvedValue(undefined);
    stubSuspendedAudioContext(resume);

    setSound(true);
    drawingSound.playDrawSound({ speed: 0, isStrokeStart: true });
    await expect(resume.mock.results[0]?.value).rejects.toThrow('activation expired');

    drawingSound.playDrawSound({ speed: 0.45, isStrokeStart: false });
    expect(resume).toHaveBeenCalledTimes(2);

    drawingSound.playDrawSound({ speed: 0.45, isStrokeStart: false });
    expect(resume).toHaveBeenCalledTimes(2);
  });
});
