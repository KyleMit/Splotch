import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIO_LOAD_TIMEOUT_MS,
  GAIN_RAMP_S,
} from '../../experiments/native-architecture/src/audio/drawingAudio.ts';
const runtimeRequire = createRequire(import.meta.url);
const reactNativeRequire = createRequire(runtimeRequire.resolve('react-native/package.json'));
const { AbortController: NativeAbortController } = reactNativeRequire(
  'abort-controller/dist/abort-controller'
);
const native = vi.hoisted(() => ({ players: [], mode: vi.fn(async () => {}), create: vi.fn() }));
vi.mock('expo-audio', () => ({ setAudioModeAsync: native.mode, createAudioPlayer: native.create }));
import { loadDrawingLoop } from '../../experiments/native-architecture/src/platform/drawingAudio.ts';

function fixture(loader = loadDrawingLoop) {
  const player = {
    volume: 0,
    loop: false,
    play: vi.fn(),
    pause: vi.fn(),
    remove: vi.fn(),
    release: vi.fn(),
    replace: vi.fn(),
    listener: null,
    unsubscribe: vi.fn(),
  };
  player.addListener = vi.fn((_name, listener) => {
    player.listener = listener;
    return { remove: player.unsubscribe };
  });
  native.players.push(player);
  native.create.mockReturnValueOnce(player);
  const controller = new NativeAbortController();
  const failure = vi.fn();
  const promise = loader(controller.signal, failure);
  return { player, controller, failure, promise };
}
async function loaded(f) {
  await Promise.resolve();
  f.player.listener({ isLoaded: true, playing: false, error: null });
  return f.promise;
}
function assertResetReleased(f) {
  expect(f.player.volume).toBe(0);
  expect(f.player.unsubscribe).toHaveBeenCalledOnce();
  expect(f.player.remove).toHaveBeenCalledOnce();
  expect(f.player.release).toHaveBeenCalledOnce();
  expect(f.failure).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
}
async function resetRefusalMutation() {
  const source = readFileSync(
    join(import.meta.dirname, '../../experiments/native-architecture/src/platform/drawingAudio.ts'),
    'utf8'
  );
  const guard = 'if (status.mediaServicesDidReset)';
  expect(source).toContain(guard);
  const { outputText } = ts.transpileModule(source.replace(guard, 'if (false)'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const body = outputText.replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  const fixtureSource = `export function createLoader({createAudioPlayer, setAudioModeAsync,
    AUDIO_LOAD_TIMEOUT_MS, GAIN_RAMP_S, pencilSound}) { ${body}; return loadDrawingLoop; }`;
  const module = await import(
    `data:text/javascript;base64,${Buffer.from(fixtureSource).toString('base64')}`
  );
  return module.createLoader({
    createAudioPlayer: native.create,
    setAudioModeAsync: native.mode,
    AUDIO_LOAD_TIMEOUT_MS,
    GAIN_RAMP_S,
    pencilSound: 1,
  });
}
async function stationaryActive(f) {
  const loop = await loaded(f);
  loop.start();
  loop.setVolume(0.2);
  await vi.runAllTimersAsync();
  loop.setVolume(0);
  await vi.runAllTimersAsync();
  expect(f.player.volume).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  return loop;
}
beforeEach(() => {
  native.players.length = 0;
  native.create.mockReset();
  native.mode.mockReset().mockResolvedValue();
});
afterEach(() => vi.useRealTimers());

describe('supported Expo native audio binding', () => {
  it('loads with the actual React Native signal without DOM throwIfAborted', async () => {
    const f = fixture();
    expect('throwIfAborted' in f.controller.signal).toBe(false);
    const outcome = f.promise.catch((error) => error);
    await Promise.resolve();
    expect(native.create).toHaveBeenCalledOnce();
    f.player.listener({ isLoaded: true, playing: false, error: null });
    const loop = await outcome;
    expect(loop).not.toBeInstanceOf(Error);
    loop.dispose();
    expect(f.failure).not.toHaveBeenCalled();
  });
  it('refuses an already-aborted React Native signal before creating a player', async () => {
    const controller = new NativeAbortController();
    controller.abort();
    const failure = vi.fn();
    await expect(loadDrawingLoop(controller.signal, failure)).rejects.toThrow(
      'Drawing sound was cancelled.'
    );
    expect(native.create).not.toHaveBeenCalled();
    expect(failure).not.toHaveBeenCalled();
  });
  it('refuses React Native cancellation while the native audio mode is pending', async () => {
    let releaseMode;
    native.mode.mockReturnValueOnce(
      new Promise((resolve) => {
        releaseMode = resolve;
      })
    );
    const f = fixture();
    const refused = f.promise.catch((error) => error.message);
    f.controller.abort();
    releaseMode();
    expect(await refused).toBe('Drawing sound was cancelled.');
    expect(native.create).not.toHaveBeenCalled();
    expect(f.failure).not.toHaveBeenCalled();
  });

  it('subscribes before replacing the bundled asset and never enables recording or background playback', async () => {
    const f = fixture();
    const loop = await loaded(f);
    expect(native.create).toHaveBeenCalledWith(null, { keepAudioSessionActive: false });
    expect(f.player.addListener.mock.invocationCallOrder[0]).toBeLessThan(
      f.player.replace.mock.invocationCallOrder[0]
    );
    expect(native.mode).toHaveBeenCalledWith(
      expect.objectContaining({
        allowsRecording: false,
        shouldPlayInBackground: false,
        allowsBackgroundRecording: false,
      })
    );
    expect(f.player.play).not.toHaveBeenCalled();
    loop.start();
    expect(f.player.play).toHaveBeenCalledOnce();
    loop.dispose();
  });
  it('mutes, unsubscribes, removes registry membership and releases native resources exactly once', async () => {
    const f = fixture();
    const loop = await loaded(f);
    loop.start();
    loop.stop();
    loop.dispose();
    loop.dispose();
    expect(f.player.volume).toBe(0);
    expect(f.player.unsubscribe).toHaveBeenCalledOnce();
    expect(f.player.remove).toHaveBeenCalledOnce();
    expect(f.player.release).toHaveBeenCalledOnce();
  });
  it('cancels a pending asset load and ignores its late native event', async () => {
    const f = fixture();
    const refused = f.promise.catch((error) => error.message);
    await Promise.resolve();
    f.controller.abort();
    f.player.listener({ isLoaded: true, playing: false, error: null });
    expect(await refused).toContain('cancelled');
    expect(f.player.play).not.toHaveBeenCalled();
    expect(f.player.release).toHaveBeenCalledOnce();
  });
  it('retains load errors from events and reports failures during playback', async () => {
    const f = fixture();
    const loop = await loaded(f);
    loop.start();
    f.player.listener({ isLoaded: false, playing: false, error: 'decoder error' });
    expect(f.failure).toHaveBeenCalledOnce();
    expect(f.player.release).toHaveBeenCalledOnce();
    loop.dispose();
  });
  it('rejects a failed bundled asset without leaving a registered player', async () => {
    const f = fixture();
    const refused = f.promise.catch((error) => error.message);
    await Promise.resolve();
    f.player.listener({ isLoaded: false, playing: false, error: 'load error' });
    expect(await refused).toContain('unavailable');
    expect(f.player.remove).toHaveBeenCalledOnce();
    expect(f.player.release).toHaveBeenCalledOnce();
  });
  it('bounds missing native load events and frees the player', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const refused = f.promise.catch((error) => error.message);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(AUDIO_LOAD_TIMEOUT_MS);
    expect(await refused).toContain('unavailable');
    expect(f.player.release).toHaveBeenCalledOnce();
  });
  it('keeps a stopped stroke muted if the native backend attempts to resume it', async () => {
    const f = fixture();
    const loop = await loaded(f);
    loop.start();
    loop.stop();
    f.player.volume = 0.8;
    f.player.listener({ isLoaded: true, playing: true, error: null });
    expect(f.player.volume).toBe(0);
    expect(f.player.pause).toHaveBeenCalledTimes(2);
    loop.dispose();
  });
  it('stops its gain ramp immediately on lift', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const loop = await loaded(f);
    loop.start();
    loop.setVolume(0.2);
    await vi.advanceTimersByTimeAsync((GAIN_RAMP_S * 1000) / 2);
    expect(f.player.volume).toBeGreaterThan(0);
    loop.stop();
    await vi.runOnlyPendingTimersAsync();
    expect(f.player.volume).toBe(0);
    loop.dispose();
  });
  it('still releases native resources if registry removal throws', async () => {
    const f = fixture();
    const loop = await loaded(f);
    f.player.remove.mockImplementation(() => {
      throw new Error('registry failed');
    });
    expect(() => loop.dispose()).not.toThrow();
    expect(f.player.release).toHaveBeenCalledOnce();
    expect(f.failure).toHaveBeenCalledOnce();
  });

  it('refuses a replacement player reset while an active stationary stroke is quiet', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const loop = await stationaryActive(f);
    f.player.volume = 1;
    f.player.listener({ isLoaded: true, playing: true, error: null, mediaServicesDidReset: true });
    assertResetReleased(f);
    loop.start();
    loop.setVolume(0.2);
    await vi.runAllTimersAsync();
    expect(f.player.play).toHaveBeenCalledOnce();
    expect(f.player.volume).toBe(0);
  });
  it('refuses reset while stopped before a later start can play at replacement gain', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const loop = await loaded(f);
    loop.start();
    loop.stop();
    f.player.volume = 1;
    f.player.listener({ isLoaded: true, playing: false, error: null, mediaServicesDidReset: true });
    assertResetReleased(f);
    loop.start();
    loop.setVolume(0.2);
    await vi.runAllTimersAsync();
    expect(f.player.play).toHaveBeenCalledOnce();
    expect(f.player.volume).toBe(0);
  });
  it('rejects reset during loading before a ready event can resolve the loop', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const refused = f.promise.catch((error) => error.message);
    await Promise.resolve();
    f.player.volume = 1;
    f.player.listener({ isLoaded: true, playing: false, error: null, mediaServicesDidReset: true });
    expect(await refused).toContain('unavailable');
    f.player.listener({ isLoaded: true, playing: true, error: null });
    expect(f.player.volume).toBe(0);
    expect(f.player.play).not.toHaveBeenCalled();
    expect(f.player.remove).toHaveBeenCalledOnce();
    expect(f.player.release).toHaveBeenCalledOnce();
    expect(f.failure).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels a reset gain ramp and ignores queued reset or loaded events after release', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const loop = await loaded(f);
    loop.start();
    loop.setVolume(0.2);
    await vi.advanceTimersByTimeAsync((GAIN_RAMP_S * 1000) / 2);
    expect(f.player.volume).toBeGreaterThan(0);
    f.player.volume = 1;
    f.player.listener({ isLoaded: true, playing: true, error: null, mediaServicesDidReset: true });
    assertResetReleased(f);
    const pauses = f.player.pause.mock.calls.length;
    for (const mediaServicesDidReset of [false, true])
      f.player.listener({ isLoaded: true, playing: true, error: null, mediaServicesDidReset });
    loop.start();
    loop.setVolume(0.2);
    loop.stop();
    loop.dispose();
    await vi.runAllTimersAsync();
    assertResetReleased(f);
    expect(f.player.pause).toHaveBeenCalledTimes(pauses);
    expect(f.player.play).toHaveBeenCalledOnce();
  });
  it('detects the active-still reset defect when the real source reset refusal is removed', async () => {
    vi.useFakeTimers();
    const f = fixture(await resetRefusalMutation());
    const loop = await stationaryActive(f);
    f.player.volume = 1;
    f.player.listener({ isLoaded: true, playing: true, error: null, mediaServicesDidReset: true });
    expect(() => assertResetReleased(f)).toThrow();
    expect(f.player.volume).toBe(1);
    expect(f.player.release).not.toHaveBeenCalled();
    expect(f.failure).not.toHaveBeenCalled();
    loop.dispose();
    const restored = fixture();
    const restoredLoop = await stationaryActive(restored);
    restored.player.volume = 1;
    restored.player.listener({
      isLoaded: true,
      playing: true,
      error: null,
      mediaServicesDidReset: true,
    });
    assertResetReleased(restored);
    restoredLoop.dispose();
  });
});
