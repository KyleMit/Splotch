import { afterEach, describe, expect, it, vi } from 'vitest';

let stopDrawSound: (() => void) | undefined;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('playDrawSound', () => {
  afterEach(() => {
    stopDrawSound?.();
    stopDrawSound = undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('starts requested playback as soon as the first sound decodes', async () => {
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
      buffer: null as AudioBuffer | null,
      loop: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
    };
    const decoded = [deferred<AudioBuffer>(), deferred<AudioBuffer>(), deferred<AudioBuffer>()];
    const fetch = vi
      .fn()
      .mockResolvedValue({ arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)) });
    vi.stubGlobal('fetch', fetch);
    const resume = vi.fn().mockResolvedValue(undefined);
    let decodeIndex = 0;
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'suspended';
        currentTime = 4;
        destination = {};

        resume = resume;
        decodeAudioData = vi.fn(() => decoded[decodeIndex++].promise);
        createGain = vi.fn(() => gainNode);
        createBufferSource = vi.fn(() => sourceNode);
      }
    );

    setSound(true);
    setSoundVolume(50);
    drawingSound.preloadDrawSounds();

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(resume).not.toHaveBeenCalled();
    expect(sourceNode.start).not.toHaveBeenCalled();

    drawingSound.playDrawSound({ speed: 0.45, isStrokeStart: false });

    expect(resume).toHaveBeenCalledOnce();
    expect(sourceNode.start).not.toHaveBeenCalled();

    const firstBuffer = { duration: 1 } as AudioBuffer;
    decoded[0].resolve(firstBuffer);
    await vi.waitFor(() => {
      expect(sourceNode.start).toHaveBeenCalledOnce();
    });

    expect(sourceNode.buffer).toBe(firstBuffer);
    expect(linearRampToValueAtTime).toHaveBeenLastCalledWith(0.2, 4.06);
  });

  it('does not start catch-up playback after the gesture ends', async () => {
    const { setSound } = await import('$lib/state/settings.svelte');
    const drawingSound = await import('./drawingSound');
    stopDrawSound = drawingSound.stopDrawSound;
    const decoded = deferred<AudioBuffer>();
    const sourceNode = {
      buffer: null as AudioBuffer | null,
      loop: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)) })
    );
    const decodeAudioData = vi.fn(() => decoded.promise);
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'suspended';
        currentTime = 0;
        destination = {};

        resume = vi.fn().mockResolvedValue(undefined);
        decodeAudioData = decodeAudioData;
        createGain = vi.fn();
        createBufferSource = vi.fn(() => sourceNode);
      }
    );

    setSound(true);
    drawingSound.playDrawSound({ speed: 0.45, isStrokeStart: true });
    await vi.waitFor(() => expect(decodeAudioData).toHaveBeenCalledOnce());
    drawingSound.stopDrawSound();

    decoded.resolve({ duration: 1 } as AudioBuffer);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sourceNode.start).not.toHaveBeenCalled();
  });

  it('does not prepare or play audio while drawing sound is off', async () => {
    const { setSound } = await import('$lib/state/settings.svelte');
    const drawingSound = await import('./drawingSound');
    const AudioContext = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal('AudioContext', AudioContext);
    vi.stubGlobal('fetch', fetchMock);

    setSound(false);
    drawingSound.playDrawSound({ speed: 0.45, isStrokeStart: true });

    expect(AudioContext).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries a sound whose preload failed', async () => {
    const drawingSound = await import('./drawingSound');
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('load failed'))
      .mockResolvedValue({ arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)) });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal(
      'AudioContext',
      class {
        decodeAudioData = vi.fn().mockResolvedValue({ duration: 1 });
      }
    );

    drawingSound.preloadFirstDrawSound();
    await new Promise((resolve) => setTimeout(resolve, 0));
    drawingSound.preloadFirstDrawSound();

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('declicks running playback before disconnecting it', async () => {
    vi.useFakeTimers();
    const { setSound } = await import('$lib/state/settings.svelte');
    const drawingSound = await import('./drawingSound');
    stopDrawSound = drawingSound.stopDrawSound;
    const gain = {
      value: 0.2,
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

    gain.cancelScheduledValues.mockClear();
    gain.setValueAtTime.mockClear();
    gain.linearRampToValueAtTime.mockClear();
    gain.value = 0.2;
    drawingSound.stopDrawSound();

    expect(gain.cancelScheduledValues).toHaveBeenCalledWith(4);
    expect(gain.setValueAtTime).toHaveBeenCalledWith(0.2, 4);
    expect(gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 4.005);
    expect(sourceNode.stop).not.toHaveBeenCalled();
    expect(sourceNode.disconnect).not.toHaveBeenCalled();
    expect(gainNode.disconnect).not.toHaveBeenCalled();
    expect(sourceNode.onended).toBeNull();

    await vi.advanceTimersByTimeAsync(25);

    expect(sourceNode.stop).toHaveBeenCalledWith();
    expect(sourceNode.disconnect).toHaveBeenCalledOnce();
    expect(gainNode.disconnect).toHaveBeenCalledOnce();
  });

  it('mutes and disconnects synchronously when the audio clock is suspended', async () => {
    const { setSound } = await import('$lib/state/settings.svelte');
    const drawingSound = await import('./drawingSound');
    stopDrawSound = drawingSound.stopDrawSound;
    const gain = {
      value: 0.2,
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
        state = 'suspended';
        currentTime = 0;
        destination = {};

        resume = vi.fn().mockResolvedValue(undefined);
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

    gain.cancelScheduledValues.mockClear();
    gain.setValueAtTime.mockClear();
    gain.linearRampToValueAtTime.mockClear();
    gain.value = 0.2;
    drawingSound.stopDrawSound();

    expect(gain.cancelScheduledValues).toHaveBeenCalledWith(0);
    expect(gain.setValueAtTime).toHaveBeenNthCalledWith(1, 0.2, 0);
    expect(gain.setValueAtTime).toHaveBeenNthCalledWith(2, 0, 0);
    expect(gain.linearRampToValueAtTime).not.toHaveBeenCalled();
    expect(sourceNode.stop).toHaveBeenCalledWith();
    expect(sourceNode.disconnect).toHaveBeenCalledOnce();
    expect(gainNode.disconnect).toHaveBeenCalledOnce();
    expect(sourceNode.onended).toBeNull();
  });
});
