import { afterEach, describe, expect, it, vi } from 'vitest';
import { setSound, setSoundVolume } from '$lib/state/settings.svelte';
import { playDrawSound, stopDrawSound } from './drawingSound';

describe('playDrawSound', () => {
  afterEach(() => {
    stopDrawSound();
    vi.unstubAllGlobals();
  });

  it('ramps to the base scratch gain at normal volume and full speed', async () => {
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

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
      })
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
    setSoundVolume(50);
    playDrawSound({ speed: 0.45 });

    await vi.waitFor(() => {
      playDrawSound({ speed: 0.45 });
      expect(linearRampToValueAtTime).toHaveBeenCalled();
    });

    expect(linearRampToValueAtTime).toHaveBeenLastCalledWith(0.2, 4.06);
  });
});
