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
  createBiquadFilter?: unknown;
  createBuffer?: unknown;
  sampleRate?: number;
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
      exponentialRampToValueAtTime: vi.fn(),
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
  createBiquadFilter = vi.fn(() => ({
    type: 'bandpass',
    frequency: { value: 0 },
    Q: { value: 0 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
  createBuffer = vi.fn((_channels: number, length: number) => ({
    getChannelData: () => new Float32Array(length),
  })),
  sampleRate = 44_100,
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
      createBiquadFilter = createBiquadFilter;
      createBuffer = createBuffer;
      sampleRate = sampleRate;
    }
  );
}
