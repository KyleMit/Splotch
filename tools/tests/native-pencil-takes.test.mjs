import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NativeAbortController } from './native-rn-abort-controller.mjs';
const native = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('expo-audio', () => ({
  setAudioModeAsync: async () => {},
  createAudioPlayer: native.create,
}));
import { loadDrawingLoop } from '../../experiments/native-architecture/src/platform/drawingAudio.ts';
import {
  PENCIL_SOUNDS,
  pickPencilStart,
  pickPencilTake,
} from '../../experiments/native-architecture/src/audio/pencilSounds.ts';

// The native drawing loop's three takes: which one a stroke plays, and where in it, without the
// seek a stroke start must never issue (issue 3003).
function nativePlayer() {
  const player = {
    volume: 0,
    loop: false,
    duration: 4,
    play: vi.fn(),
    pause: vi.fn(),
    remove: vi.fn(),
    release: vi.fn(),
    replace: vi.fn(),
    seekTo: vi.fn(async () => {}),
    listener: null,
  };
  player.addListener = vi.fn((_name, listener) => {
    player.listener = listener;
    return { remove: vi.fn() };
  });
  native.create.mockReturnValueOnce(player);
  return player;
}
beforeEach(() => native.create.mockReset());

describe('pencil take variety', () => {
  function takes() {
    const players = PENCIL_SOUNDS.map(() => nativePlayer());
    const failure = vi.fn();
    const promise = loadDrawingLoop(new NativeAbortController().signal, failure);
    return { players, failure, promise };
  }
  async function ready(f) {
    await vi.waitFor(() => expect(native.create).toHaveBeenCalledTimes(PENCIL_SOUNDS.length));
    for (const player of f.players)
      player.listener({ isLoaded: true, playing: false, error: null });
    return f.promise;
  }
  afterEach(() => vi.restoreAllMocks());

  it('holds one loaded player per shipping take', async () => {
    const f = takes();
    const loop = await ready(f);
    expect(f.players.map((player) => player.replace.mock.calls[0][0])).toEqual([...PENCIL_SOUNDS]);
    loop.dispose();
    for (const player of f.players) expect(player.release).toHaveBeenCalledOnce();
  });
  it('moves each take to a random start point while it loads, so a stroke only plays', async () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.25)
      .mockReturnValueOnce(0.75);
    const f = takes();
    const loop = await ready(f);
    const [first, second, third] = f.players;
    expect(first.seekTo).toHaveBeenCalledWith(2);
    expect(second.seekTo).toHaveBeenCalledWith(1);
    expect(third.seekTo).toHaveBeenCalledWith(3);
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.5);
    loop.start();
    expect(second.play).toHaveBeenCalledOnce();
    expect(second.seekTo).toHaveBeenCalledOnce();
    expect(first.play).not.toHaveBeenCalled();
    expect(second.pause).not.toHaveBeenCalled();
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.1);
    loop.stop();
    expect(second.seekTo).toHaveBeenLastCalledWith(0.4);
    expect(second.pause.mock.invocationCallOrder[0]).toBeLessThan(
      second.seekTo.mock.invocationCallOrder[1]
    );
    loop.dispose();
  });
  it('resolves a take only after its load-time seek lands', async () => {
    const players = PENCIL_SOUNDS.map(() => nativePlayer());
    const landings = players.map((player) => {
      let land;
      player.seekTo = vi.fn(
        () =>
          new Promise((resolve) => {
            land = resolve;
          })
      );
      return () => land();
    });
    let resolved = false;
    const promise = loadDrawingLoop(new NativeAbortController().signal, vi.fn()).then((loop) => {
      resolved = true;
      return loop;
    });
    await vi.waitFor(() => expect(native.create).toHaveBeenCalledTimes(PENCIL_SOUNDS.length));
    for (const player of players) player.listener({ isLoaded: true, playing: false, error: null });
    await vi.waitFor(() => expect(players[2].seekTo).toHaveBeenCalledOnce());
    expect(resolved).toBe(false);
    for (const land of landings) land();
    const loop = await promise;
    expect(resolved).toBe(true);
    loop.dispose();
  });
  it('sits a take out of the next stroke while its seek after a stroke is in flight', async () => {
    const f = takes();
    const loop = await ready(f);
    const [first, second, third] = f.players;
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.5);
    loop.start();
    expect(second.play).toHaveBeenCalledOnce();
    second.seekTo.mockReturnValueOnce(new Promise(() => {}));
    loop.stop();
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.5);
    loop.start();
    expect(third.play).toHaveBeenCalledOnce();
    expect(second.play).toHaveBeenCalledOnce();
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.2).mockReturnValueOnce(0);
    loop.start();
    expect(first.play).toHaveBeenCalledOnce();
    expect(second.play).toHaveBeenCalledOnce();
    loop.dispose();
  });
  function holdSeeks(player) {
    const lands = [];
    player.seekTo = vi.fn(() => new Promise((resolve) => lands.push(resolve)));
    return async () => {
      lands.shift()();
      await Promise.resolve();
      await Promise.resolve();
    };
  }
  it('defers a stroke that finds every take mid-seek until its take lands', async () => {
    const f = takes();
    const loop = await ready(f);
    const lands = f.players.map(holdSeeks);
    for (const pick of [0, 0.5, 0.9]) {
      vi.spyOn(Math, 'random').mockReturnValueOnce(pick);
      loop.start();
      loop.stop();
    }
    expect(f.players.every((player) => player.seekTo.mock.calls.length === 1)).toBe(true);
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.5);
    loop.start();
    const [, second] = f.players;
    expect(second.play).toHaveBeenCalledOnce();
    await lands[1]();
    expect(second.play).toHaveBeenCalledTimes(2);
    loop.dispose();
  });
  it('restarts a lone take only after its seek lands, and not at all once the stroke ended', async () => {
    const f = takes();
    await vi.waitFor(() => expect(native.create).toHaveBeenCalledTimes(PENCIL_SOUNDS.length));
    f.players[0].listener({ isLoaded: true, playing: false, error: null });
    f.players[1].listener({ isLoaded: false, playing: false, error: 'decoder error' });
    f.players[2].listener({ isLoaded: false, playing: false, error: 'decoder error' });
    const loop = await f.promise;
    const [only] = f.players;
    const land = holdSeeks(only);
    loop.start();
    loop.stop();
    loop.start();
    expect(only.play).toHaveBeenCalledOnce();
    await land();
    expect(only.play).toHaveBeenCalledTimes(2);
    loop.stop();
    loop.start();
    loop.stop();
    await land();
    expect(only.play).toHaveBeenCalledTimes(2);
    loop.dispose();
  });
  it('keeps playing the takes that loaded when one take fails', async () => {
    const f = takes();
    await vi.waitFor(() => expect(native.create).toHaveBeenCalledTimes(PENCIL_SOUNDS.length));
    f.players[0].listener({ isLoaded: true, playing: false, error: null });
    f.players[1].listener({ isLoaded: false, playing: false, error: 'decoder error' });
    f.players[2].listener({ isLoaded: true, playing: false, error: null });
    const loop = await f.promise;
    expect(f.players[1].release).toHaveBeenCalledOnce();
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.9).mockReturnValueOnce(0);
    loop.start();
    expect(f.players[2].play).toHaveBeenCalledOnce();
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0);
    loop.start();
    expect(f.players[0].play).toHaveBeenCalledOnce();
    expect(f.players[1].play).not.toHaveBeenCalled();
    expect(f.failure).not.toHaveBeenCalled();
    loop.dispose();
    for (const player of f.players) expect(player.release).toHaveBeenCalledOnce();
  });
  it('refuses the loop only when no take loads', async () => {
    const f = takes();
    const refused = f.promise.catch((error) => error.message);
    await vi.waitFor(() => expect(native.create).toHaveBeenCalledTimes(PENCIL_SOUNDS.length));
    for (const player of f.players)
      player.listener({ isLoaded: false, playing: false, error: 'decoder error' });
    expect(await refused).toContain('unavailable');
    for (const player of f.players) expect(player.release).toHaveBeenCalledOnce();
    expect(f.failure).not.toHaveBeenCalled();
  });
  it('draws a take uniformly and a start point as a fraction of its length', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.7).mockReturnValueOnce(0.1);
    expect(pickPencilTake(['a', 'b', 'c'])).toBe('c');
    expect(pickPencilStart()).toBe(0.1);
  });
});
