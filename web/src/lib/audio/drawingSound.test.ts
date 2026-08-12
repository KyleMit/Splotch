import { afterEach, describe, expect, it, vi } from 'vitest';

let stopDrawSound: (() => void) | undefined;

// These tests drive real setTimeout/vi.waitFor polling against decode/fetch
// mocks rather than fake timers, so a contended host can blow past Vitest's
// default 5s test timeout mid-poll and leave a stray async chain to bleed
// into the next test.
const SLOW_HOST_TEST_TIMEOUT_MS = 20_000;
vi.setConfig({ testTimeout: SLOW_HOST_TEST_TIMEOUT_MS });

describe('playDrawSound', () => {
  afterEach(() => {
    stopDrawSound?.();
    stopDrawSound = undefined;
    localStorage.clear();
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
    const decoded = [
      Promise.withResolvers<AudioBuffer>(),
      Promise.withResolvers<AudioBuffer>(),
      Promise.withResolvers<AudioBuffer>(),
    ];
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
    const decoded = Promise.withResolvers<AudioBuffer>();
    const sourceNode = {
      buffer: null as AudioBuffer | null,
      loop: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const gainNode = {
      gain: {
        value: 0,
        cancelScheduledValues: vi.fn(),
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
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
        createGain = vi.fn(() => gainNode);
        createBufferSource = vi.fn(() => sourceNode);
      }
    );

    setSound(true);
    drawingSound.playDrawSound({ speed: 0.45, isStrokeStart: true });
    await vi.waitFor(() => expect(decodeAudioData).toHaveBeenCalledTimes(3));
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
    drawingSound.preloadFirstDrawSound();
    drawingSound.preloadDrawSounds();
    drawingSound.playDrawSound({ speed: 0.45, isStrokeStart: true });

    expect(AudioContext).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries a failed preload once per gesture instead of once per pointer event', async () => {
    const { setSound } = await import('$lib/state/settings.svelte');
    const drawingSound = await import('./drawingSound');
    stopDrawSound = drawingSound.stopDrawSound;
    const fetchMock = vi.fn().mockResolvedValue({
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
    });
    const decodeAudioData = vi.fn().mockRejectedValue(new Error('decode failed'));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'running';
        currentTime = 0;
        resume = vi.fn().mockResolvedValue(undefined);
        decodeAudioData = decodeAudioData;
      }
    );

    setSound(true);
    drawingSound.preloadFirstDrawSound();
    await vi.waitFor(() => expect(decodeAudioData).toHaveBeenCalledOnce());

    drawingSound.playDrawSound({ speed: 0.45, isStrokeStart: true });
    await vi.waitFor(() => expect(decodeAudioData).toHaveBeenCalledTimes(4));

    for (let i = 0; i < 60; i++) {
      drawingSound.playDrawSound({ speed: 0.45, isStrokeStart: false });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(decodeAudioData).toHaveBeenCalledTimes(4);

    drawingSound.stopDrawSound();
    drawingSound.playDrawSound({ speed: 0.45, isStrokeStart: true });

    await vi.waitFor(() => expect(decodeAudioData).toHaveBeenCalledTimes(7));
  });

  it('does not reload a decoded sound when playback startup throws', async () => {
    const { setSound } = await import('$lib/state/settings.svelte');
    const drawingSound = await import('./drawingSound');
    stopDrawSound = drawingSound.stopDrawSound;
    const fetchMock = vi.fn().mockResolvedValue({
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
    });
    const decodeAudioData = vi.fn().mockResolvedValue({ duration: 1 } as AudioBuffer);
    const gainNode = {
      gain: {
        value: 0,
        cancelScheduledValues: vi.fn(),
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    const createGain = vi.fn(() => gainNode);
    createGain.mockImplementationOnce(() => {
      throw new Error('playback startup failed');
    });
    const sourceNode = {
      buffer: null as AudioBuffer | null,
      loop: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'running';
        currentTime = 0;
        destination = {};
        decodeAudioData = decodeAudioData;
        createGain = createGain;
        createBufferSource = vi.fn(() => sourceNode);
      }
    );

    setSound(true);
    drawingSound.playDrawSound({ speed: 0.45, isStrokeStart: false });
    await vi.waitFor(() => expect(createGain).toHaveBeenCalledOnce());
    await new Promise((resolve) => setTimeout(resolve, 0));

    drawingSound.stopDrawSound();
    drawingSound.playDrawSound({ speed: 0.45, isStrokeStart: false });
    await vi.waitFor(() => expect(sourceNode.start).toHaveBeenCalledOnce());

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(decodeAudioData).toHaveBeenCalledOnce();
  });

  it('retries every failed variant at the next stroke start', async () => {
    const { setSound } = await import('$lib/state/settings.svelte');
    const drawingSound = await import('./drawingSound');
    stopDrawSound = drawingSound.stopDrawSound;
    const attempts = new Map<string, number>();
    const fetchMock = vi.fn(async (url: string) => {
      const attempt = (attempts.get(url) ?? 0) + 1;
      attempts.set(url, attempt);
      if (url !== '/sounds/pencil-1.mp3' && attempt === 1) throw new Error('load failed');
      return { arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)) };
    });
    const decodeAudioData = vi.fn().mockResolvedValue({ duration: 1 } as AudioBuffer);
    const gainNode = {
      gain: {
        value: 0,
        cancelScheduledValues: vi.fn(),
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
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
    };
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'suspended';
        currentTime = 0;
        destination = {};
        resume = vi.fn().mockResolvedValue(undefined);
        decodeAudioData = decodeAudioData;
        createGain = vi.fn(() => gainNode);
        createBufferSource = vi.fn(() => sourceNode);
      }
    );

    setSound(true);
    drawingSound.preloadDrawSounds();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await vi.waitFor(() => expect(decodeAudioData).toHaveBeenCalledOnce());
    await new Promise((resolve) => setTimeout(resolve, 0));

    drawingSound.playDrawSound({ speed: 0.45, isStrokeStart: true });

    await vi.waitFor(() => expect(decodeAudioData).toHaveBeenCalledTimes(3));
    expect(attempts).toEqual(
      new Map([
        ['/sounds/pencil-1.mp3', 1],
        ['/sounds/pencil-2.mp3', 2],
        ['/sounds/pencil-3.mp3', 2],
      ])
    );
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
