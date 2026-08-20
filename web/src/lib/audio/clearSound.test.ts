import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubAudioContext } from './drawingSoundTestHarness';

let cancelClearSound: (() => void) | undefined;

function audioParam(value = 0) {
  return {
    value,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}

function resolvedAudioFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)) })
  );
}

function bufferSource() {
  return {
    buffer: null as AudioBuffer | null,
    loop: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null as (() => void) | null,
  };
}

function oscillatorNode() {
  return {
    type: 'square' as OscillatorType,
    frequency: audioParam(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null as (() => void) | null,
  };
}

describe('clear sound', () => {
  afterEach(() => {
    cancelClearSound?.();
    cancelClearSound = undefined;
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('maps forward and backward traveled distance onto short bubble resonances', async ({
    signal,
  }) => {
    vi.useFakeTimers();
    const { setSound, setSoundVolume } = await import('$lib/state/settings.svelte');
    signal.throwIfAborted();
    const drawingSound = await import('./drawingSound');
    signal.throwIfAborted();
    cancelClearSound = drawingSound.cancelClearSound;

    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const oscillators: ReturnType<typeof oscillatorNode>[] = [];
    const gainParams: ReturnType<typeof audioParam>[] = [];
    resolvedAudioFetch();
    stubAudioContext({
      state: 'running',
      currentTime: 4,
      createBufferSource: vi.fn(),
      createOscillator: vi.fn(() => {
        const oscillator = oscillatorNode();
        oscillators.push(oscillator);
        return oscillator;
      }),
      createGain: vi.fn(() => {
        const gain = audioParam();
        gainParams.push(gain);
        return { gain, connect: vi.fn(), disconnect: vi.fn() };
      }),
    });

    setSound(true);
    setSoundVolume(50);
    drawingSound.startClearSound();
    drawingSound.updateClearSound(0.2);
    drawingSound.updateClearSound(0.5);
    drawingSound.updateClearSound(0.25);

    expect(oscillators).toHaveLength(3);
    expect(oscillators.map((oscillator) => oscillator.type)).toEqual(['sine', 'sine', 'sine']);
    expect(oscillators[0].frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(
      420 * Math.pow(2.5, 0.2 / 1.4),
      4.028
    );
    expect(oscillators[1].frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(
      420 * Math.pow(2.5, 0.5 / 1.4),
      4.028
    );
    expect(oscillators[2].frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(
      420 * Math.pow(2.5, 0.25 / 1.4),
      4.028
    );
    expect(oscillators[0].start).toHaveBeenCalledWith(4);
    expect(oscillators[0].stop).toHaveBeenCalledWith(4.085);
    expect(gainParams[0].exponentialRampToValueAtTime).toHaveBeenNthCalledWith(
      1,
      0.012 + (0.035 - 0.012) * Math.pow(0.2 / 1.4, 1.2),
      4.004
    );
    expect(gainParams[1].exponentialRampToValueAtTime).toHaveBeenNthCalledWith(
      1,
      0.012 + (0.035 - 0.012) * Math.pow(0.5 / 1.4, 1.2),
      4.004
    );
    expect(gainParams[2].exponentialRampToValueAtTime).toHaveBeenNthCalledWith(
      1,
      0.012 + (0.035 - 0.012) * Math.pow(0.25 / 1.4, 1.2),
      4.004
    );
  });

  it('does not schedule a bubble graph at zero volume', async ({ signal }) => {
    vi.useFakeTimers();
    const { setSound, setSoundVolume } = await import('$lib/state/settings.svelte');
    signal.throwIfAborted();
    const drawingSound = await import('./drawingSound');
    signal.throwIfAborted();
    cancelClearSound = drawingSound.cancelClearSound;

    const gain = audioParam();
    gain.exponentialRampToValueAtTime.mockImplementation((target: number) => {
      if (target === 0) throw new RangeError('exponential ramps require a non-zero target');
    });
    const createGain = vi.fn(() => ({ gain, connect: vi.fn(), disconnect: vi.fn() }));
    const createOscillator = vi.fn(oscillatorNode);
    resolvedAudioFetch();
    stubAudioContext({ state: 'running', createGain, createOscillator });

    setSound(true);
    setSoundVolume(0);
    drawingSound.startClearSound();

    expect(() => drawingSound.updateClearSound(0.5)).not.toThrow();
    expect(createGain).not.toHaveBeenCalled();
    expect(createOscillator).not.toHaveBeenCalled();
  });

  it('keeps rising past ready, holds at the pitch cap, and stops when backing out or committing', async ({
    signal,
  }) => {
    vi.useFakeTimers();
    const { setSound } = await import('$lib/state/settings.svelte');
    signal.throwIfAborted();
    const drawingSound = await import('./drawingSound');
    signal.throwIfAborted();
    cancelClearSound = drawingSound.cancelClearSound;

    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const oscillators: ReturnType<typeof oscillatorNode>[] = [];
    resolvedAudioFetch();
    stubAudioContext({
      state: 'running',
      currentTime: 4,
      createOscillator: vi.fn(() => {
        const oscillator = oscillatorNode();
        oscillators.push(oscillator);
        return oscillator;
      }),
      createGain: vi.fn(() => ({ gain: audioParam(), connect: vi.fn(), disconnect: vi.fn() })),
    });

    setSound(true);
    drawingSound.startClearSound();
    drawingSound.updateClearSound(1);

    expect(oscillators).toHaveLength(1);
    expect(oscillators[0].frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(
      420 * Math.pow(2.5, 1 / 1.4),
      4.028
    );

    drawingSound.updateClearSound(1.2);
    drawingSound.updateClearSound(1.4);
    drawingSound.updateClearSound(2);

    expect(oscillators).toHaveLength(3);
    expect(oscillators[1].frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(
      420 * Math.pow(2.5, 1.2 / 1.4),
      4.028
    );
    expect(oscillators[2].frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(
      1_050,
      4.028
    );

    vi.advanceTimersByTime(240);

    expect(oscillators).toHaveLength(4);
    expect(oscillators[3].frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(
      1_050,
      4.028
    );

    drawingSound.updateClearSound(0.8);
    vi.advanceTimersByTime(480);

    expect(oscillators).toHaveLength(5);

    drawingSound.updateClearSound(1.4);
    vi.advanceTimersByTime(240);

    expect(oscillators).toHaveLength(7);

    drawingSound.commitClearSound();
    vi.advanceTimersByTime(480);

    expect(oscillators).toHaveLength(7);
  });

  it('plays the Cartoon Bubble Bloop only when the drag commits', async ({ signal }) => {
    vi.useFakeTimers();
    const { setSound } = await import('$lib/state/settings.svelte');
    signal.throwIfAborted();
    const drawingSound = await import('./drawingSound');
    signal.throwIfAborted();
    cancelClearSound = drawingSound.cancelClearSound;

    const popBuffer = { duration: 0.5 } as AudioBuffer;
    const sourceNodes: ReturnType<typeof bufferSource>[] = [];
    resolvedAudioFetch();
    stubAudioContext({
      state: 'running',
      currentTime: 4,
      decodeAudioData: vi.fn().mockResolvedValue(popBuffer),
      createBufferSource: vi.fn(() => {
        const source = bufferSource();
        sourceNodes.push(source);
        return source;
      }),
    });

    setSound(true);
    drawingSound.startClearSound();
    await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledOnce());
    signal.throwIfAborted();
    drawingSound.cancelClearSound();

    expect(sourceNodes).toHaveLength(0);

    drawingSound.startClearSound();
    drawingSound.commitClearSound();

    await vi.waitFor(() => expect(sourceNodes).toHaveLength(1));
    signal.throwIfAborted();
    expect(sourceNodes[0].buffer).toBe(popBuffer);
    expect(sourceNodes[0].loop).toBe(false);
    expect(sourceNodes[0].start).toHaveBeenCalledOnce();
  });

  it('still plays the commit pop when its decode finishes after a fast drag', async ({
    signal,
  }) => {
    vi.useFakeTimers();
    const { setSound } = await import('$lib/state/settings.svelte');
    signal.throwIfAborted();
    const drawingSound = await import('./drawingSound');
    signal.throwIfAborted();
    cancelClearSound = drawingSound.cancelClearSound;

    const popDecode = Promise.withResolvers<AudioBuffer>();
    const sourceLoopsAtStart: boolean[] = [];
    resolvedAudioFetch();
    stubAudioContext({
      decodeAudioData: vi.fn(() => popDecode.promise),
      createBufferSource: vi.fn(() => {
        const source = bufferSource();
        source.start.mockImplementation(() => sourceLoopsAtStart.push(source.loop));
        return source;
      }),
    });

    setSound(true);
    drawingSound.startClearSound();
    drawingSound.commitClearSound();
    await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledOnce());
    signal.throwIfAborted();

    expect(sourceLoopsAtStart).toEqual([]);

    popDecode.resolve({ duration: 0.5 } as AudioBuffer);
    await vi.waitFor(() => expect(sourceLoopsAtStart).toEqual([false]));
    signal.throwIfAborted();
  });

  it('drops a pending commit pop before a later gesture retries the failed load', async ({
    signal,
  }) => {
    vi.useFakeTimers();
    const { setSound } = await import('$lib/state/settings.svelte');
    signal.throwIfAborted();
    const drawingSound = await import('./drawingSound');
    signal.throwIfAborted();
    cancelClearSound = drawingSound.cancelClearSound;

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)) });
    const sourceNodes: ReturnType<typeof bufferSource>[] = [];
    vi.stubGlobal('fetch', fetchMock);
    stubAudioContext({
      state: 'running',
      decodeAudioData: vi.fn().mockResolvedValue({ duration: 0.5 } as AudioBuffer),
      createBufferSource: vi.fn(() => {
        const source = bufferSource();
        sourceNodes.push(source);
        return source;
      }),
    });

    setSound(true);
    drawingSound.startClearSound();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    signal.throwIfAborted();
    await vi.runAllTimersAsync();
    signal.throwIfAborted();
    drawingSound.commitClearSound();

    drawingSound.startClearSound();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    signal.throwIfAborted();
    await vi.runAllTimersAsync();
    signal.throwIfAborted();

    expect(sourceNodes).toHaveLength(0);
  });

  it('does not create or load clear audio while sounds are disabled', async () => {
    vi.useFakeTimers();
    const { setSound } = await import('$lib/state/settings.svelte');
    const drawingSound = await import('./drawingSound');
    cancelClearSound = drawingSound.cancelClearSound;
    const AudioContext = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal('AudioContext', AudioContext);
    vi.stubGlobal('fetch', fetchMock);

    setSound(false);
    drawingSound.startClearSound();
    drawingSound.updateClearSound(1);
    drawingSound.commitClearSound();

    expect(AudioContext).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
