import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIO_LOAD_TIMEOUT_MS,
  GAIN_RAMP_S,
  STOP_DECLICK_S,
  TEARDOWN_SLACK_MS,
} from '../../experiments/native-architecture/src/audio/drawingAudio.ts';
const asset = vi.hoisted(() => ({ fromModule: vi.fn() }));
vi.mock('expo-asset', () => ({ Asset: asset }));
import { loadDrawingLoop } from '../../experiments/native-architecture/src/platform/drawingAudio.web.ts';

function pending() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
let contexts;
let fetchSound;
let rejectInitialResume;
function node() {
  return { connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() };
}
class FakeAudioContext {
  constructor() {
    this.state = 'suspended';
    this.currentTime = 1;
    this.destination = {};
    this.sources = [];
    this.gains = [];
    this.resume = vi.fn(async () => {
      if (rejectInitialResume) throw new Error('activation required');
      this.state = 'running';
    });
    this.close = vi.fn(async () => {
      this.state = 'closed';
    });
    this.decodeAudioData = vi.fn(async () => ({ decoded: true }));
    this.createGain = vi.fn(() => {
      const gain = {
        ...node(),
        gain: {
          value: 0,
          cancelScheduledValues: vi.fn(),
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
      };
      this.gains.push(gain);
      return gain;
    });
    this.createBufferSource = vi.fn(() => {
      const source = node();
      this.sources.push(source);
      return source;
    });
    contexts.push(this);
  }
}
function fixture() {
  const abort = new AbortController();
  const failure = vi.fn();
  const promise = loadDrawingLoop(abort.signal, failure);
  return { abort, failure, promise, context: contexts.at(-1) };
}
beforeEach(() => {
  vi.useFakeTimers();
  contexts = [];
  rejectInitialResume = false;
  asset.fromModule
    .mockReset()
    .mockReturnValue({ localUri: 'file:owned-pencil', uri: 'https://fixture.invalid/pencil' });
  fetchSound = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(2) }));
  vi.stubGlobal('fetch', fetchSound);
  vi.stubGlobal('AudioContext', FakeAudioContext);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('explicit drawing web audio adapter', () => {
  it('loads the owned asset and connects a muted looping source with bounded gain and de-click teardown', async () => {
    const f = fixture();
    const loop = await f.promise;
    expect(asset.fromModule).toHaveBeenCalledOnce();
    expect(fetchSound).toHaveBeenCalledWith('file:owned-pencil', { signal: f.abort.signal });
    loop.start();
    const source = f.context.sources[0];
    const gain = f.context.gains[0];
    expect(source.buffer).toEqual({ decoded: true });
    expect(source.loop).toBe(true);
    expect(source.start).toHaveBeenCalledOnce();
    expect(gain.gain.value).toBe(0);
    expect(source.connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalledWith(f.context.destination);
    loop.setVolume(0.2);
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.2, 1 + GAIN_RAMP_S);
    loop.stop();
    expect(source.stop).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(STOP_DECLICK_S * 1000 + TEARDOWN_SLACK_MS);
    expect(source.stop).toHaveBeenCalledOnce();
    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(gain.disconnect).toHaveBeenCalledOnce();
    loop.dispose();
    expect(f.context.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('flushes all retiring sources and closes once when disposed during the fade', async () => {
    const f = fixture();
    const loop = await f.promise;
    loop.start();
    loop.stop();
    loop.start();
    loop.dispose();
    loop.dispose();
    await vi.runAllTimersAsync();
    expect(f.context.sources).toHaveLength(2);
    for (const source of f.context.sources) {
      expect(source.stop).toHaveBeenCalledOnce();
      expect(source.disconnect).toHaveBeenCalledOnce();
    }
    expect(f.context.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('aborts a pending fetch and closes without creating a source', async () => {
    fetchSound.mockImplementation(
      (_uri, { signal }) =>
        new Promise((_yes, no) => {
          signal.addEventListener('abort', () => no(new Error('fetch aborted')), { once: true });
        })
    );
    const f = fixture();
    const refused = f.promise.catch((error) => error.message);
    f.abort.abort();
    expect(await refused).toBe('fetch aborted');
    expect(f.context.close).toHaveBeenCalledOnce();
    expect(f.context.createBufferSource).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('closes immediately on decode cancellation and refuses its late result', async () => {
    const decode = pending();
    const f = fixture();
    f.context.decodeAudioData.mockReturnValueOnce(decode.promise);
    const refused = f.promise.catch((error) => error.name);
    await Promise.resolve();
    await Promise.resolve();
    expect(f.context.decodeAudioData).toHaveBeenCalledOnce();
    f.abort.abort();
    expect(f.context.close).toHaveBeenCalledOnce();
    decode.resolve({ late: true });
    expect(await refused).toBe('AbortError');
    expect(f.context.createBufferSource).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds decode loading and refuses a result arriving after the deadline', async () => {
    const decode = pending();
    const f = fixture();
    f.context.decodeAudioData.mockReturnValueOnce(decode.promise);
    const refused = f.promise.catch((error) => error.message);
    await vi.advanceTimersByTimeAsync(AUDIO_LOAD_TIMEOUT_MS);
    expect(await refused).toContain('did not load');
    expect(f.context.close).toHaveBeenCalledOnce();
    decode.resolve({ late: true });
    await Promise.resolve();
    expect(f.context.createBufferSource).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('keeps a rejected first activation available for a later real stroke', async () => {
    rejectInitialResume = true;
    const f = fixture();
    const loop = await f.promise;
    expect(f.context.state).toBe('suspended');
    expect(f.failure).not.toHaveBeenCalled();
    expect(f.context.close).not.toHaveBeenCalled();
    rejectInitialResume = false;
    loop.start();
    await Promise.resolve();
    expect(f.context.state).toBe('running');
    expect(f.context.resume).toHaveBeenCalledTimes(2);
    loop.dispose();
  });
  it('allows a later activation after resume rejects without reporting a fatal load failure', async () => {
    const f = fixture();
    // Initial resume runs before the fixture returns; a suspended start supplies the rejection.
    const loop = await f.promise;
    f.context.state = 'suspended';
    f.context.resume.mockRejectedValueOnce(new Error('activation required'));
    loop.start();
    await Promise.resolve();
    expect(f.failure).not.toHaveBeenCalled();
    expect(f.context.close).not.toHaveBeenCalled();
    loop.stop();
    loop.start();
    await Promise.resolve();
    expect(f.context.state).toBe('running');
    expect(f.context.resume).toHaveBeenCalledTimes(3);
    loop.dispose();
  });
  it('retains a real fetch failure and releases the context', async () => {
    fetchSound.mockResolvedValueOnce({ ok: false });
    const f = fixture();
    await expect(f.promise).rejects.toThrow('could not be loaded');
    expect(f.context.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
