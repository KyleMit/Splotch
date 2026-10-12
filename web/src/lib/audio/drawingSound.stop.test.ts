import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubAudioContext } from './drawingSoundTestHarness';

let stopDrawSound: (() => void) | undefined;

// Vitest aborts only the test wrapper on timeout. Every timeout-sensitive test
// checks the context signal after each await so its continuation cannot
// run against globals installed by the next test.
describe('stopDrawSound', () => {
  afterEach(() => {
    stopDrawSound?.();
    stopDrawSound = undefined;
    localStorage.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('declicks running playback before disconnecting it', async ({ signal }) => {
    vi.useFakeTimers();
    const { setSound } = await import('$lib/state/settings.svelte');
    signal.throwIfAborted();
    const drawingSound = await import('./drawingSound');
    signal.throwIfAborted();
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
    signal.throwIfAborted();

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
    signal.throwIfAborted();

    expect(sourceNode.stop).toHaveBeenCalledWith();
    expect(sourceNode.disconnect).toHaveBeenCalledOnce();
    expect(gainNode.disconnect).toHaveBeenCalledOnce();
  });

  it('mutes and disconnects synchronously when the audio clock is suspended', async ({
    signal,
  }) => {
    const { setSound } = await import('$lib/state/settings.svelte');
    signal.throwIfAborted();
    const drawingSound = await import('./drawingSound');
    signal.throwIfAborted();
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
    stubAudioContext({
      createGain: vi.fn(() => gainNode),
      createBufferSource: vi.fn(() => sourceNode),
    });

    setSound(true);
    drawingSound.playDrawSound({ speed: 0.45, isStrokeStart: true });

    await vi.waitFor(() => {
      drawingSound.playDrawSound({ speed: 0.45, isStrokeStart: false });
      expect(sourceNode.start).toHaveBeenCalled();
    });
    signal.throwIfAborted();

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
