import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Module = typeof import('./drawingSound');

// A context whose suspend and resume move its state the way a browser's do.
class ControllableContext {
  static instances: ControllableContext[] = [];
  state: AudioContextState = 'suspended';
  currentTime = 1;
  destination = {};
  suspend = vi.fn(async () => {
    this.state = 'suspended';
  });
  resume = vi.fn(async () => {
    this.state = 'running';
  });
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
  constructor() {
    ControllableContext.instances.push(this);
  }
}

let sound: Module;

async function stroke() {
  sound.playDrawSound({ speed: 0.45, isStrokeStart: true });
  await vi.advanceTimersByTimeAsync(0);
}

async function startScratch() {
  await stroke();
  await vi.waitFor(() => {
    sound.playDrawSound({ speed: 0.45, isStrokeStart: false });
    expect(ControllableContext.instances[0].createBufferSource).toHaveBeenCalled();
  });
}

beforeEach(async () => {
  vi.useFakeTimers();
  ControllableContext.instances.length = 0;
  vi.stubGlobal('AudioContext', ControllableContext);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)) })
  );
  const { setSound } = await import('$lib/state/settings.svelte');
  setSound(true);
  sound = await import('./drawingSound');
});

afterEach(() => {
  sound.stopDrawSound();
  localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('parking the audio context', () => {
  it('suspends the context once the scratch has been quiet, and the next stroke resumes it', async () => {
    await startScratch();
    const context = ControllableContext.instances[0];
    expect(context.state).toBe('running');

    sound.stopDrawSound();
    await vi.advanceTimersByTimeAsync(sound.AUDIO_IDLE_SUSPEND_MS - 1);
    expect(context.suspend).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(context.suspend).toHaveBeenCalledOnce();

    context.resume.mockClear();
    await stroke();
    expect(context.resume).toHaveBeenCalledOnce();
    expect(context.state).toBe('running');
  });

  it('keeps the context awake for as long as the scratch plays', async () => {
    await startScratch();

    await vi.advanceTimersByTimeAsync(sound.AUDIO_IDLE_SUSPEND_MS * 4);

    expect(ControllableContext.instances[0].suspend).not.toHaveBeenCalled();
  });

  it('suspends at once when a parent switches a sound off', async () => {
    await startScratch();

    sound.parkAudio();
    await vi.advanceTimersByTimeAsync(sound.AUDIO_IDLE_SUSPEND_MS / 10);

    expect(ControllableContext.instances[0].suspend).toHaveBeenCalledOnce();
  });

  it('holds the context through a one-shot sound before the idle delay starts', async () => {
    await startScratch();
    sound.stopDrawSound();
    const context = ControllableContext.instances[0];
    const soundMs = 500;

    sound.noteSoundPlayed(context as unknown as AudioContext, soundMs);
    await vi.advanceTimersByTimeAsync(sound.AUDIO_IDLE_SUSPEND_MS + soundMs - 1);
    expect(context.suspend).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(context.suspend).toHaveBeenCalledOnce();
  });
});
