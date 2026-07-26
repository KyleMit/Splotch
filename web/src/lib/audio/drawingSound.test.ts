import { afterEach, describe, expect, it, vi } from 'vitest';

let stopDrawSound: (() => void) | undefined;

describe('playDrawSound', () => {
  afterEach(() => {
    stopDrawSound?.();
    stopDrawSound = undefined;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('ramps to the base scratch gain at normal volume and full speed', async () => {
    const { setSound, setSoundVolume } = await import('$lib/state/settings.svelte');
    const drawingSound = await import('./drawingSound');
    stopDrawSound = drawingSound.stopDrawSound;
    const linearRampToValueAtTime = vi.fn();
    const gain = {
      value: 0,
      cancelScheduledValues: vi.fn(),
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime,
    };
    const gainNode = {
      gain,
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    const sourceNode = {
      buffer: null,
      loop: false,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
    };

    let failLoad = true;
    const fetch = vi.fn(() => {
      if (failLoad) return Promise.reject(new Error('load failed'));
      return Promise.resolve({ arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)) });
    });
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'running';
        currentTime = 4;
        destination = {};

        decodeAudioData = vi.fn().mockResolvedValue({ duration: 1 });
        createGain = vi.fn(() => gainNode);
        createBufferSource = vi.fn(() => sourceNode);
      }
    );

    setSound(true);
    setSoundVolume(50);

    drawingSound.playDrawSound({ speed: 0, isStrokeStart: true });
    drawingSound.playDrawSound({ speed: 0.45, isStrokeStart: false });

    expect(fetch).toHaveBeenCalledTimes(3);

    await new Promise((resolve) => setTimeout(resolve, 0));

    drawingSound.playDrawSound({ speed: 0.45, isStrokeStart: false });

    expect(fetch).toHaveBeenCalledTimes(3);

    failLoad = false;
    drawingSound.playDrawSound({ speed: 0, isStrokeStart: true });

    expect(fetch).toHaveBeenCalledTimes(6);

    await vi.waitFor(() => {
      drawingSound.playDrawSound({ speed: 0.45, isStrokeStart: false });
      expect(linearRampToValueAtTime).toHaveBeenCalled();
    });

    expect(linearRampToValueAtTime).toHaveBeenLastCalledWith(0.2, 4.06);
  });

  it('disconnects the stopped source and gain when playback ends', async () => {
    const { setSound } = await import('$lib/state/settings.svelte');
    const drawingSound = await import('./drawingSound');
    stopDrawSound = drawingSound.stopDrawSound;
    const gain = {
      value: 0,
      cancelScheduledValues: vi.fn(),
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    };
    const gainNode = {
      gain,
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    const sourceNode = {
      buffer: null,
      loop: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as (() => void) | null,
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)) })
    );
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'running';
        currentTime = 4;
        destination = {};

        decodeAudioData = vi.fn().mockResolvedValue({ duration: 1 });
        createGain = vi.fn(() => gainNode);
        createBufferSource = vi.fn(() => sourceNode);
      }
    );

    setSound(true);
    drawingSound.playDrawSound({ speed: 0.45, isStrokeStart: true });

    await vi.waitFor(() => {
      drawingSound.playDrawSound({ speed: 0.45, isStrokeStart: false });
      expect(sourceNode.start).toHaveBeenCalled();
    });

    drawingSound.stopDrawSound();
    sourceNode.onended?.();

    expect(sourceNode.disconnect).toHaveBeenCalledOnce();
    expect(gainNode.disconnect).toHaveBeenCalledOnce();
  });
});
