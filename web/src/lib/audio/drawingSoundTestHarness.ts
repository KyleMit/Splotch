import { vi } from 'vitest';

interface AudioContextStubOptions {
  state?: AudioContextState;
  currentTime?: number;
  destination?: unknown;
  resume?: unknown;
  decodeAudioData?: unknown;
  createGain?: unknown;
  createBufferSource?: unknown;
  createOscillator?: unknown;
}

export function stubAudioContext({
  state = 'suspended',
  currentTime = 0,
  destination = {},
  resume = vi.fn().mockResolvedValue(undefined),
  decodeAudioData = vi.fn().mockResolvedValue({ duration: 1 }),
  createGain = vi.fn(() => ({
    gain: {
      value: 0,
      cancelScheduledValues: vi.fn(),
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
  createBufferSource = vi.fn(() => ({
    buffer: null,
    loop: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  })),
  createOscillator = vi.fn(),
}: AudioContextStubOptions = {}) {
  vi.stubGlobal(
    'AudioContext',
    class {
      state = state;
      currentTime = currentTime;
      destination = destination;
      resume = resume;
      decodeAudioData = decodeAudioData;
      createGain = createGain;
      createBufferSource = createBufferSource;
      createOscillator = createOscillator;
    }
  );
}
