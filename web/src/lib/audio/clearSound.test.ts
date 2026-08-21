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
  resolvedAudioFetch();
  stubAudioContext({
    state: 'running',
    currentTime: options.currentTime ?? 4,
    createGain: vi.fn(() => {
      const gain = audioParam();
      return { gain, connect: vi.fn(), disconnect: vi.fn() };
    }),
    createOscillator: vi.fn(() => {
      const oscillator = oscillatorNode();
      oscillators.push(oscillator);
      return oscillator;
    }),
    createBufferSource: vi.fn(() => {
      const source = bufferSource();
      sources.push(source);
      return source;
    }),
  });

  const drawingSound = await import('./drawingSound');
  signal.throwIfAborted();
  cancelClearSound = drawingSound.cancelClearSound;
  return { drawingSound, oscillators, sources, gains };
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
    const { drawingSound, oscillators } = await mountClearSound(signal);

    drawingSound.startClearSound();
    for (const progress of [0.2, 0.45, 0.7, 0.95]) drawingSound.updateClearSound(progress);
    const ascending = notesFrom(oscillators);
    expect(ascending.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < ascending.length; i += 1) {
      expect(ascending[i]).toBeGreaterThan(ascending[i - 1]);
    }

    oscillators.length = 0;
    for (const progress of [0.7, 0.45, 0.2]) drawingSound.updateClearSound(progress);
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
    const { drawingSound, oscillators } = await mountClearSound(signal);

    drawingSound.startClearSound();
    drawingSound.updateClearSound(1);
    oscillators.length = 0;

    for (const progress of [1.3, 1.6, 1.9, 2.2, 2.5]) drawingSound.updateClearSound(progress);
    const climb = notesFrom(oscillators);
    expect(climb.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < climb.length; i += 1) expect(climb[i]).toBeGreaterThan(climb[i - 1]);
  });

  it('says nothing while the drag is held still past the threshold', async ({ signal }) => {
    vi.useFakeTimers();
    const { drawingSound, oscillators } = await mountClearSound(signal);

    drawingSound.startClearSound();
    drawingSound.updateClearSound(1.2);
    oscillators.length = 0;

    drawingSound.updateClearSound(1.2);
    drawingSound.updateClearSound(1.2);
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
    const drawingSound = await import('./drawingSound');
    signal.throwIfAborted();
    cancelClearSound = drawingSound.cancelClearSound;

    const peakAt = (progress: number) => {
      gainParams.length = 0;
      drawingSound.updateClearSound(progress);
      return gainParams[0].exponentialRampToValueAtTime.mock.calls[0][0] as number;
    };

    drawingSound.startClearSound();
    const low = peakAt(0.3);
    const high = peakAt(2.5);
    expect(high).toBeLessThan(low);
  });

  it('walks back down the scale when the drag is abandoned short of the threshold', async ({
    signal,
  }) => {
    vi.useFakeTimers();
    const { drawingSound, oscillators } = await mountClearSound(signal);

    drawingSound.startClearSound();
    drawingSound.updateClearSound(0.7);
    const arrived = notesFrom(oscillators).at(-1) as number;
    oscillators.length = 0;

    drawingSound.cancelClearSound();
    vi.advanceTimersByTime(500);
    const unwind = notesFrom(oscillators);
    expect(unwind).toHaveLength(3);
    expect(unwind[0]).toBeLessThan(arrived);
    for (let i = 1; i < unwind.length; i += 1) expect(unwind[i]).toBeLessThan(unwind[i - 1]);
  });

  it('does not unwind when a gesture was never started', async ({ signal }) => {
    vi.useFakeTimers();
    const { drawingSound, oscillators } = await mountClearSound(signal);

    drawingSound.cancelClearSound();
    vi.advanceTimersByTime(500);
    expect(oscillators).toHaveLength(0);
  });

  // Starting a drag resets the previous one, and that reset must be silent —
  // otherwise every gesture would open with the sound of abandoning one.
  it('does not unwind or leak a pending unwind into the next gesture', async ({ signal }) => {
    vi.useFakeTimers();
    const { drawingSound, oscillators } = await mountClearSound(signal);

    drawingSound.startClearSound();
    drawingSound.updateClearSound(0.7);
    drawingSound.cancelClearSound();
    oscillators.length = 0;

    drawingSound.startClearSound();
    vi.advanceTimersByTime(500);
    expect(oscillators).toHaveLength(0);
  });

  it('plays the page turn once on commit, and never on cancel', async ({ signal }) => {
    vi.useFakeTimers();
    const { drawingSound, sources } = await mountClearSound(signal);

    drawingSound.startClearSound();
    drawingSound.updateClearSound(1.2);
    await vi.runOnlyPendingTimersAsync();
    expect(pageTurnsIn(sources)).toHaveLength(0);

    drawingSound.commitClearSound();
    expect(pageTurnsIn(sources)).toHaveLength(1);
    expect(pageTurnsIn(sources)[0].start).toHaveBeenCalled();

    drawingSound.startClearSound();
    drawingSound.updateClearSound(0.5);
    drawingSound.cancelClearSound();
    vi.advanceTimersByTime(500);
    expect(pageTurnsIn(sources)).toHaveLength(1);
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
    const drawingSound = await import('./drawingSound');
    signal.throwIfAborted();
    cancelClearSound = drawingSound.cancelClearSound;

    drawingSound.startClearSound();
    drawingSound.updateClearSound(1.2);
    drawingSound.commitClearSound();
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
    const drawingSound = await import('./drawingSound');
    signal.throwIfAborted();
    cancelClearSound = drawingSound.cancelClearSound;

    drawingSound.startClearSound();
    drawingSound.updateClearSound(0.6);
    drawingSound.cancelClearSound();
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
    const drawingSound = await import('./drawingSound');
    signal.throwIfAborted();
    cancelClearSound = drawingSound.cancelClearSound;

    drawingSound.startClearSound();
    drawingSound.updateClearSound(1.2);
    drawingSound.commitClearSound();
    await vi.runOnlyPendingTimersAsync();

    drawingSound.startClearSound();
    drawingSound.cancelClearSound();
    await vi.runOnlyPendingTimersAsync();
    expect(pageTurnsIn(sources)).toHaveLength(0);
  });

  it('creates no audio graph at all when sound is off', async ({ signal }) => {
    vi.useFakeTimers();
    const { drawingSound, oscillators, sources } = await mountClearSound(signal, {
      soundEnabled: false,
    });

    drawingSound.startClearSound();
    drawingSound.updateClearSound(1.2);
    drawingSound.commitClearSound();
    vi.advanceTimersByTime(500);
    expect(oscillators).toHaveLength(0);
    expect(sources).toHaveLength(0);
  });

  it('creates no audio graph when only the delete source is off', async ({ signal }) => {
    vi.useFakeTimers();
    const { drawingSound, oscillators, sources } = await mountClearSound(signal, {
      deleteSoundEnabled: false,
    });

    drawingSound.startClearSound();
    drawingSound.updateClearSound(1.2);
    drawingSound.commitClearSound();
    vi.advanceTimersByTime(500);
    expect(oscillators).toHaveLength(0);
    expect(sources).toHaveLength(0);
  });

  it('creates no oscillators at zero volume', async ({ signal }) => {
    vi.useFakeTimers();
    const { drawingSound, oscillators } = await mountClearSound(signal, { volume: 0 });

    drawingSound.startClearSound();
    for (const progress of [0.3, 0.8, 1.4]) drawingSound.updateClearSound(progress);
    expect(oscillators).toHaveLength(0);
  });

  it('stops mid-gesture when sound is switched off', async ({ signal }) => {
    vi.useFakeTimers();
    const { drawingSound, oscillators } = await mountClearSound(signal);
    const { setSound } = await import('$lib/state/settings.svelte');
    signal.throwIfAborted();

    drawingSound.startClearSound();
    drawingSound.updateClearSound(0.6);
    oscillators.length = 0;

    setSound(false);
    drawingSound.updateClearSound(1.2);
    drawingSound.updateClearSound(1.8);
    expect(oscillators).toHaveLength(0);
  });

  it('stops mid-gesture when the delete source is switched off', async ({ signal }) => {
    vi.useFakeTimers();
    const { drawingSound, oscillators } = await mountClearSound(signal);
    const { setDeleteSound } = await import('$lib/state/settings.svelte');
    signal.throwIfAborted();

    drawingSound.startClearSound();
    drawingSound.updateClearSound(0.6);
    oscillators.length = 0;

    setDeleteSound(false);
    drawingSound.updateClearSound(1.2);
    drawingSound.updateClearSound(1.8);
    expect(oscillators).toHaveLength(0);
  });
});
