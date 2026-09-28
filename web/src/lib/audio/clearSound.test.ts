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

// Every note's droplet tick is a buffer source too, so a page turn is picked out
// by the buffer it carries: the decoded clip the harness resolves, rather than
// the generated noise the droplet reads from.
function pageTurnsIn(sources: ReturnType<typeof bufferSource>[]) {
  return sources.filter(
    (source) => (source.buffer as { duration?: number } | null)?.duration === 1
  );
}

// The note a bubble is playing is the pitch it rises *to*, which is the target of
// the frequency ramp rather than the value it starts from.
function notesFrom(oscillators: ReturnType<typeof oscillatorNode>[]): number[] {
  return oscillators.map(
    (oscillator) => oscillator.frequency.exponentialRampToValueAtTime.mock.calls[0][0] as number
  );
}

interface RigOptions {
  currentTime?: number;
  deleteSoundEnabled?: boolean;
  soundEnabled?: boolean;
  volume?: number;
}

async function mountClearSound(signal: AbortSignal, options: RigOptions = {}) {
  const { setDeleteSound, setSound, setSoundVolume } = await import('$lib/state/settings.svelte');
  signal.throwIfAborted();
  if (options.soundEnabled === false) setSound(false);
  if (options.deleteSoundEnabled === false) setDeleteSound(false);
  if (options.volume !== undefined) setSoundVolume(options.volume);

  const oscillators: ReturnType<typeof oscillatorNode>[] = [];
  const sources: ReturnType<typeof bufferSource>[] = [];
  const gains: ReturnType<typeof audioParam>[] = [];
  const createOscillator = vi.fn(() => {
    const oscillator = oscillatorNode();
    oscillators.push(oscillator);
    return oscillator;
  });
  resolvedAudioFetch();
  stubAudioContext({
    state: 'running',
    currentTime: options.currentTime ?? 4,
    createGain: vi.fn(() => {
      const gain = audioParam();
      return { gain, connect: vi.fn(), disconnect: vi.fn() };
    }),
    createOscillator,
    createBufferSource: vi.fn(() => {
      const source = bufferSource();
      sources.push(source);
      return source;
    }),
  });
  const contexts = recordAudioContexts();

  const clearSound = await import('./clearSound');
  signal.throwIfAborted();
  cancelClearSound = clearSound.cancelClearSound;
  return { clearSound, contexts, createOscillator, oscillators, sources, gains };
}

// Installed before either sound module is imported, so a context built while a
// module evaluates is counted too.
function recordAudioContexts(): AudioContext[] {
  const contexts: AudioContext[] = [];
  const StubbedContext = globalThis.AudioContext;
  vi.stubGlobal(
    'AudioContext',
    class extends StubbedContext {
      constructor() {
        super();
        contexts.push(this);
      }
    }
  );
  return contexts;
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

  it('walks up the scale as the drag travels and back down as it returns', async ({ signal }) => {
    vi.useFakeTimers();
    const { clearSound, oscillators } = await mountClearSound(signal);

    clearSound.startClearSound();
    for (const progress of [0.2, 0.45, 0.7, 0.95]) clearSound.updateClearSound(progress);
    const ascending = notesFrom(oscillators);
    expect(ascending.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < ascending.length; i += 1) {
      expect(ascending[i]).toBeGreaterThan(ascending[i - 1]);
    }

    oscillators.length = 0;
    for (const progress of [0.7, 0.45, 0.2]) clearSound.updateClearSound(progress);
    const descending = notesFrom(oscillators);
    expect(descending.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < descending.length; i += 1) {
      expect(descending[i]).toBeLessThan(descending[i - 1]);
    }
  });

  // The armed state has no sound of its own; continuing to pull is the only
  // feedback out there, so the ladder has to have somewhere left to go. An
  // earlier cut spent itself before the threshold and went silent past 1.4×.
  it('keeps producing notes while the drag continues past the commit threshold', async ({
    signal,
  }) => {
    vi.useFakeTimers();
    const { clearSound, oscillators } = await mountClearSound(signal);

    clearSound.startClearSound();
    clearSound.updateClearSound(1);
    oscillators.length = 0;

    for (const progress of [1.3, 1.6, 1.9, 2.2, 2.5]) clearSound.updateClearSound(progress);
    const climb = notesFrom(oscillators);
    expect(climb.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < climb.length; i += 1) expect(climb[i]).toBeGreaterThan(climb[i - 1]);
  });

  it('says nothing while the drag is held still past the threshold', async ({ signal }) => {
    vi.useFakeTimers();
    const { clearSound, oscillators } = await mountClearSound(signal);

    clearSound.startClearSound();
    clearSound.updateClearSound(1.2);
    oscillators.length = 0;

    clearSound.updateClearSound(1.2);
    clearSound.updateClearSound(1.2);
    vi.advanceTimersByTime(3_000);
    expect(oscillators).toHaveLength(0);
  });

  it('rolls the top of the run off so the highest notes are not the loudest', async ({
    signal,
  }) => {
    vi.useFakeTimers();
    const gainParams: ReturnType<typeof audioParam>[] = [];
    const { setSound } = await import('$lib/state/settings.svelte');
    signal.throwIfAborted();
    void setSound;
    resolvedAudioFetch();
    stubAudioContext({
      state: 'running',
      currentTime: 4,
      createGain: vi.fn(() => {
        const gain = audioParam();
        gainParams.push(gain);
        return { gain, connect: vi.fn(), disconnect: vi.fn() };
      }),
      createOscillator: vi.fn(() => oscillatorNode()),
      createBufferSource: vi.fn(() => bufferSource()),
    });
    const clearSound = await import('./clearSound');
    signal.throwIfAborted();
    cancelClearSound = clearSound.cancelClearSound;

    const peakAt = (progress: number) => {
      gainParams.length = 0;
      clearSound.updateClearSound(progress);
      return gainParams[0].exponentialRampToValueAtTime.mock.calls[0][0] as number;
    };

    clearSound.startClearSound();
    const low = peakAt(0.3);
    const high = peakAt(2.5);
    expect(high).toBeLessThan(low);
  });

  it('walks back down the scale when the drag is abandoned short of the threshold', async ({
    signal,
  }) => {
    vi.useFakeTimers();
    const { clearSound, oscillators } = await mountClearSound(signal);

    clearSound.startClearSound();
    clearSound.updateClearSound(0.7);
    const arrived = notesFrom(oscillators).at(-1) as number;
    oscillators.length = 0;

    clearSound.cancelClearSound();
    vi.advanceTimersByTime(500);
    const unwind = notesFrom(oscillators);
    expect(unwind).toHaveLength(3);
    expect(unwind[0]).toBeLessThan(arrived);
    for (let i = 1; i < unwind.length; i += 1) expect(unwind[i]).toBeLessThan(unwind[i - 1]);
  });

  it('does not unwind when a gesture was never started', async ({ signal }) => {
    vi.useFakeTimers();
    const { clearSound, oscillators } = await mountClearSound(signal);

    clearSound.cancelClearSound();
    vi.advanceTimersByTime(500);
    expect(oscillators).toHaveLength(0);
  });

  // Starting a drag resets the previous one, and that reset must be silent —
  // otherwise every gesture would open with the sound of abandoning one.
  it('does not unwind or leak a pending unwind into the next gesture', async ({ signal }) => {
    vi.useFakeTimers();
    const { clearSound, oscillators } = await mountClearSound(signal);

    clearSound.startClearSound();
    clearSound.updateClearSound(0.7);
    clearSound.cancelClearSound();
    oscillators.length = 0;

    clearSound.startClearSound();
    vi.advanceTimersByTime(500);
    expect(oscillators).toHaveLength(0);
  });

  it('plays the page turn once on commit, and never on cancel', async ({ signal }) => {
    vi.useFakeTimers();
    const { clearSound, sources } = await mountClearSound(signal);

    clearSound.startClearSound();
    clearSound.updateClearSound(1.2);
    await vi.runOnlyPendingTimersAsync();
    expect(pageTurnsIn(sources)).toHaveLength(0);

    clearSound.commitClearSound();
    expect(pageTurnsIn(sources)).toHaveLength(1);
    expect(pageTurnsIn(sources)[0].start).toHaveBeenCalled();

    clearSound.startClearSound();
    clearSound.updateClearSound(0.5);
    clearSound.cancelClearSound();
    vi.advanceTimersByTime(500);
    expect(pageTurnsIn(sources)).toHaveLength(1);
  });

  it('plays the page turn when an armed activation commits without drag progress', async ({
    signal,
  }) => {
    vi.useFakeTimers();
    const { clearSound, sources } = await mountClearSound(signal);

    clearSound.startClearSound();
    clearSound.commitClearSound();
    await vi.runOnlyPendingTimersAsync();

    expect(pageTurnsIn(sources)).toHaveLength(1);
    expect(pageTurnsIn(sources)[0].start).toHaveBeenCalledOnce();
  });

  // A quick flick can commit before the page turn has finished decoding. The
  // request has to survive that and play when the buffer arrives — one of the
  // lifecycle guarantees ADR-0131 pins.
  it('plays the page turn on a commit that beats the decode', async ({ signal }) => {
    vi.useFakeTimers();
    const { setSound } = await import('$lib/state/settings.svelte');
    signal.throwIfAborted();
    void setSound;

    let finishDecode: ((buffer: unknown) => void) | undefined;
    const sources: ReturnType<typeof bufferSource>[] = [];
    resolvedAudioFetch();
    stubAudioContext({
      state: 'running',
      currentTime: 4,
      decodeAudioData: vi.fn(
        () =>
          new Promise((resolve) => {
            finishDecode = resolve;
          })
      ),
      createOscillator: vi.fn(() => oscillatorNode()),
      createBufferSource: vi.fn(() => {
        const source = bufferSource();
        sources.push(source);
        return source;
      }),
    });
    const clearSound = await import('./clearSound');
    signal.throwIfAborted();
    cancelClearSound = clearSound.cancelClearSound;

    clearSound.startClearSound();
    clearSound.updateClearSound(1.2);
    clearSound.commitClearSound();
    await vi.runOnlyPendingTimersAsync();
    expect(pageTurnsIn(sources)).toHaveLength(0);

    finishDecode?.({ duration: 1 });
    await vi.runOnlyPendingTimersAsync();
    expect(pageTurnsIn(sources)).toHaveLength(1);
    expect(pageTurnsIn(sources)[0].start).toHaveBeenCalled();
  });

  // The mirror of the case above: a request that was never made must not be
  // fulfilled when the buffer eventually lands.
  it('does not play a page turn that decodes after the gesture was abandoned', async ({
    signal,
  }) => {
    vi.useFakeTimers();
    const { setSound } = await import('$lib/state/settings.svelte');
    signal.throwIfAborted();
    void setSound;

    let finishDecode: ((buffer: unknown) => void) | undefined;
    const sources: ReturnType<typeof bufferSource>[] = [];
    resolvedAudioFetch();
    stubAudioContext({
      state: 'running',
      currentTime: 4,
      decodeAudioData: vi.fn(
        () =>
          new Promise((resolve) => {
            finishDecode = resolve;
          })
      ),
      createOscillator: vi.fn(() => oscillatorNode()),
      createBufferSource: vi.fn(() => {
        const source = bufferSource();
        sources.push(source);
        return source;
      }),
    });
    const clearSound = await import('./clearSound');
    signal.throwIfAborted();
    cancelClearSound = clearSound.cancelClearSound;

    clearSound.startClearSound();
    clearSound.updateClearSound(0.6);
    clearSound.cancelClearSound();
    finishDecode?.({ duration: 1 });
    await vi.runOnlyPendingTimersAsync();
    expect(pageTurnsIn(sources)).toHaveLength(0);
  });

  it('keeps a failed page-turn load from leaking confirmation into a later gesture', async ({
    signal,
  }) => {
    vi.useFakeTimers();
    const { setSound } = await import('$lib/state/settings.svelte');
    signal.throwIfAborted();
    void setSound;
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const sources: ReturnType<typeof bufferSource>[] = [];
    stubAudioContext({
      state: 'running',
      currentTime: 4,
      createOscillator: vi.fn(() => oscillatorNode()),
      createBufferSource: vi.fn(() => {
        const source = bufferSource();
        sources.push(source);
        return source;
      }),
    });
    const clearSound = await import('./clearSound');
    signal.throwIfAborted();
    cancelClearSound = clearSound.cancelClearSound;

    clearSound.startClearSound();
    clearSound.updateClearSound(1.2);
    clearSound.commitClearSound();
    await vi.runOnlyPendingTimersAsync();

    clearSound.startClearSound();
    clearSound.cancelClearSound();
    await vi.runOnlyPendingTimersAsync();
    expect(pageTurnsIn(sources)).toHaveLength(0);
  });

  // Every AudioContext spins up its own audio device thread, so the clear synth
  // borrows the pencil sound's context instead of building a second one.
  it('plays on the AudioContext the pencil sound already built', async ({ signal }) => {
    vi.useFakeTimers();
    const { clearSound, contexts, createOscillator } = await mountClearSound(signal);
    const drawingSound = await import('./drawingSound');
    signal.throwIfAborted();

    drawingSound.preloadDrawSounds();
    const pencilContext = drawingSound.currentAudioContext();
    clearSound.startClearSound();
    clearSound.updateClearSound(0.5);
    clearSound.commitClearSound();
    await vi.runOnlyPendingTimersAsync();

    expect(contexts).toHaveLength(1);
    expect(pencilContext).toBe(contexts[0]);
    expect(createOscillator.mock.contexts.length).toBeGreaterThan(0);
    for (const context of createOscillator.mock.contexts) expect(context).toBe(pencilContext);
  });

  it('creates no audio graph at all when sound is off', async ({ signal }) => {
    vi.useFakeTimers();
    const { clearSound, oscillators, sources } = await mountClearSound(signal, {
      soundEnabled: false,
    });

    clearSound.startClearSound();
    clearSound.updateClearSound(1.2);
    clearSound.commitClearSound();
    vi.advanceTimersByTime(500);
    expect(oscillators).toHaveLength(0);
    expect(sources).toHaveLength(0);
  });

  it('creates no audio graph when only the delete source is off', async ({ signal }) => {
    vi.useFakeTimers();
    const { clearSound, oscillators, sources } = await mountClearSound(signal, {
      deleteSoundEnabled: false,
    });

    clearSound.startClearSound();
    clearSound.updateClearSound(1.2);
    clearSound.commitClearSound();
    vi.advanceTimersByTime(500);
    expect(oscillators).toHaveLength(0);
    expect(sources).toHaveLength(0);
  });

  it('creates no oscillators at zero volume', async ({ signal }) => {
    vi.useFakeTimers();
    const { clearSound, oscillators } = await mountClearSound(signal, { volume: 0 });

    clearSound.startClearSound();
    for (const progress of [0.3, 0.8, 1.4]) clearSound.updateClearSound(progress);
    expect(oscillators).toHaveLength(0);
  });

  it('stops mid-gesture when sound is switched off', async ({ signal }) => {
    vi.useFakeTimers();
    const { clearSound, oscillators } = await mountClearSound(signal);
    const { setSound } = await import('$lib/state/settings.svelte');
    signal.throwIfAborted();

    clearSound.startClearSound();
    clearSound.updateClearSound(0.6);
    oscillators.length = 0;

    setSound(false);
    clearSound.updateClearSound(1.2);
    clearSound.updateClearSound(1.8);
    expect(oscillators).toHaveLength(0);
  });

  it('stops mid-gesture when the delete source is switched off', async ({ signal }) => {
    vi.useFakeTimers();
    const { clearSound, oscillators } = await mountClearSound(signal);
    const { setDeleteSound } = await import('$lib/state/settings.svelte');
    signal.throwIfAborted();

    clearSound.startClearSound();
    clearSound.updateClearSound(0.6);
    oscillators.length = 0;

    setDeleteSound(false);
    clearSound.updateClearSound(1.2);
    clearSound.updateClearSound(1.8);
    expect(oscillators).toHaveLength(0);
  });
});
