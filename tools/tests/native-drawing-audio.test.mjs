import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIO_LOAD_TIMEOUT_MS,
  BASE_SCRATCH_GAIN,
  createDrawingAudio,
  FULL_VOLUME_SPEED,
} from '../../experiments/native-architecture/src/audio/drawingAudio.ts';

function pending() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture() {
  const ready = pending();
  const loop = { start: vi.fn(), setVolume: vi.fn(), stop: vi.fn(), dispose: vi.fn() };
  const load = vi.fn(() => ready.promise);
  const failure = vi.fn();
  const audio = createDrawingAudio(load, failure);
  return { ready, loop, load, failure, audio };
}
const first = { x: 10, y: 20 };
async function ready(f) {
  f.ready.resolve(f.loop);
  await Promise.resolve();
}
afterEach(() => vi.useRealTimers());

describe('drawing audio gesture and resource ownership', () => {
  it('loads nothing while the persisted choice is unknown or muted', () => {
    const f = fixture();
    f.audio.begin(first, 100);
    f.audio.setEnabled(false);
    f.audio.begin(first, 200);
    expect(f.load).not.toHaveBeenCalled();
  });
  it('maps real paper movement to the shipping scratch gain and stops on lift', async () => {
    const f = fixture();
    f.audio.setEnabled(true);
    f.audio.begin(first, 100);
    await ready(f);
    f.audio.sample({ x: 10 + FULL_VOLUME_SPEED * 100, y: 20 }, 200);
    expect(f.loop.start).toHaveBeenCalledOnce();
    expect(f.loop.setVolume).toHaveBeenLastCalledWith(BASE_SCRATCH_GAIN);
    f.audio.end();
    expect(f.loop.stop).toHaveBeenCalledOnce();
    f.audio.dispose();
  });
  it('does not start playback when a decode completes after lift', async () => {
    const f = fixture();
    f.audio.setEnabled(true);
    f.audio.begin(first, 100);
    f.audio.end();
    await ready(f);
    expect(f.loop.start).not.toHaveBeenCalled();
    f.audio.dispose();
    expect(f.loop.dispose).toHaveBeenCalledOnce();
  });
  it.each(['mute', 'background', 'unmount'])(
    'cancels pending decoding at %s and disposes a late result',
    async (reason) => {
      const f = fixture();
      f.audio.setEnabled(true);
      f.audio.begin(first, 100);
      const operations = {
        mute: () => f.audio.setEnabled(false),
        background: () => f.audio.setForeground(false),
        unmount: () => f.audio.dispose(),
      };
      operations[reason]();
      await ready(f);
      expect(f.load.mock.calls[0][0].aborted).toBe(true);
      expect(f.loop.start).not.toHaveBeenCalled();
      expect(f.loop.dispose).toHaveBeenCalledOnce();
    }
  );
  it('cannot resume an old stroke on returning to the foreground', async () => {
    const f = fixture();
    f.audio.setEnabled(true);
    f.audio.begin(first, 100);
    await ready(f);
    f.audio.setForeground(false);
    f.audio.setForeground(true);
    f.audio.sample({ x: 400, y: 20 }, 300);
    expect(f.loop.dispose).toHaveBeenCalledOnce();
    expect(f.loop.start).toHaveBeenCalledOnce();
    f.audio.dispose();
  });
  it('makes a stationary held finger quiet without relying on more touch events', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.audio.setEnabled(true);
    f.audio.begin(first, 100);
    await ready(f);
    f.audio.sample({ x: 400, y: 20 }, 200);
    await vi.runOnlyPendingTimersAsync();
    expect(f.loop.setVolume).toHaveBeenLastCalledWith(0);
    f.audio.dispose();
  });
  it('reports a failed decode once and retries on the next real gesture', async () => {
    const f = fixture();
    f.audio.setEnabled(true);
    f.audio.begin(first, 100);
    f.ready.reject(new Error('bad asset'));
    await Promise.resolve();
    await Promise.resolve();
    expect(f.failure).toHaveBeenCalledOnce();
    const second = pending();
    f.load.mockReturnValueOnce(second.promise);
    f.audio.begin(first, 200);
    second.resolve(f.loop);
    await Promise.resolve();
    expect(f.loop.start).toHaveBeenCalledOnce();
    expect(f.load).toHaveBeenCalledTimes(2);
    f.audio.dispose();
  });
  it('bounds an unresolved native initialization and ignores its expired result', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.audio.setEnabled(true);
    f.audio.begin(first, 100);
    await vi.advanceTimersByTimeAsync(AUDIO_LOAD_TIMEOUT_MS);
    expect(f.failure).toHaveBeenCalledOnce();
    expect(f.load.mock.calls[0][0].aborted).toBe(true);
    await ready(f);
    expect(f.loop.start).not.toHaveBeenCalled();
    expect(f.loop.dispose).toHaveBeenCalledOnce();
  });
  it('releases a failed player even if stop itself throws', async () => {
    const f = fixture();
    f.audio.setEnabled(true);
    f.audio.begin(first, 100);
    await ready(f);
    f.loop.stop.mockImplementation(() => {
      throw new Error('native failure');
    });
    expect(() => f.audio.end()).not.toThrow();
    expect(f.loop.dispose).toHaveBeenCalledOnce();
    expect(f.failure).toHaveBeenCalledOnce();
  });
});
