import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NativeAbortController } from './native-rn-abort-controller.mjs';
const native = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('expo-audio', () => ({
  setAudioModeAsync: async () => {},
  createAudioPlayer: native.create,
}));
import { loadDrawingLoop } from '../../src/platform/drawingAudio.ts';
import { PENCIL_SOUNDS, pickPencilStart, pickPencilTake } from '../../src/audio/pencilSounds.ts';

// The native drawing loop's three takes: which one a stroke plays, and where in it, without the
// seek a stroke start must never issue (issue 3003), and each take's first play made before any
// stroke (issue 3028).
function nativePlayer() {
  const player = {
    volume: 0,
    loop: false,
    duration: 4,
    reportsPlaying: true,
    play: vi.fn(() => {
      if (player.reportsPlaying) player.listener?.({ isLoaded: true, playing: true, error: null });
    }),
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
// Priming plays each loaded take once, muted, after the loop resolves; later counts start after it.
async function afterPriming(players) {
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (const player of players) {
    player.play.mockClear();
    player.pause.mockClear();
  }
}

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
    const loop = await f.promise;
    await afterPriming(f.players);
    return loop;
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
    await afterPriming(f.players);
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
  const teardowns = {
    dispose: ({ loop }) => loop.dispose(),
    abort: ({ controller }) => controller.abort(),
    'media services reset': ({ only }) =>
      only.listener({ isLoaded: true, playing: false, error: null, mediaServicesDidReset: true }),
    'decoder error': ({ only }) =>
      only.listener({ isLoaded: false, playing: false, error: 'decoder error' }),
  };
  for (const [name, teardown] of Object.entries(teardowns)) {
    it(`never plays a released take when its seek lands after ${name}`, async () => {
      const players = PENCIL_SOUNDS.map(() => nativePlayer());
      const controller = new NativeAbortController();
      const promise = loadDrawingLoop(controller.signal, vi.fn());
      await vi.waitFor(() => expect(native.create).toHaveBeenCalledTimes(PENCIL_SOUNDS.length));
      players[0].listener({ isLoaded: true, playing: false, error: null });
      for (const failed of players.slice(1))
        failed.listener({ isLoaded: false, playing: false, error: 'decoder error' });
      const loop = await promise;
      await afterPriming(players);
      const [only] = players;
      const land = holdSeeks(only);
      loop.start();
      loop.stop();
      loop.start();
      teardown({ loop, controller, only });
      expect(only.release).toHaveBeenCalledOnce();
      await land();
      expect(only.play).toHaveBeenCalledOnce();
      expect(only.seekTo).toHaveBeenCalledOnce();
    });
  }
  it('keeps playing the takes that loaded when one take fails', async () => {
    const f = takes();
    await vi.waitFor(() => expect(native.create).toHaveBeenCalledTimes(PENCIL_SOUNDS.length));
    f.players[0].listener({ isLoaded: true, playing: false, error: null });
    f.players[1].listener({ isLoaded: false, playing: false, error: 'decoder error' });
    f.players[2].listener({ isLoaded: true, playing: false, error: null });
    const loop = await f.promise;
    await afterPriming(f.players);
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

describe('pencil take priming', () => {
  async function loadedQuietly(failing = 0) {
    const players = PENCIL_SOUNDS.map(() => nativePlayer());
    for (const player of players) player.reportsPlaying = false;
    const promise = loadDrawingLoop(new NativeAbortController().signal, vi.fn());
    await vi.waitFor(() => expect(native.create).toHaveBeenCalledTimes(PENCIL_SOUNDS.length));
    players.forEach((player, index) =>
      player.listener(
        index >= players.length - failing
          ? { isLoaded: false, playing: false, error: 'decoder error' }
          : { isLoaded: true, playing: false, error: null }
      )
    );
    const loop = await promise;
    await Promise.resolve();
    return { players, loop };
  }
  const reportPlaying = (player) => player.listener({ isLoaded: true, playing: true, error: null });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('plays each take once at volume 0 after its load seek lands, one take at a time', async () => {
    const { players, loop } = await loadedQuietly();
    const [first, second, third] = players;
    expect(first.play).toHaveBeenCalledOnce();
    expect(first.play.mock.invocationCallOrder[0]).toBeGreaterThan(
      first.seekTo.mock.invocationCallOrder[0]
    );
    expect(first.volume).toBe(0);
    expect(second.play).not.toHaveBeenCalled();
    reportPlaying(first);
    expect(first.pause).toHaveBeenCalled();
    await vi.waitFor(() => expect(second.play).toHaveBeenCalledOnce());
    expect(third.play).not.toHaveBeenCalled();
    reportPlaying(second);
    await vi.waitFor(() => expect(third.play).toHaveBeenCalledOnce());
    reportPlaying(third);
    expect(third.pause).toHaveBeenCalled();
    for (const player of players) {
      expect(player.play).toHaveBeenCalledOnce();
      expect(player.volume).toBe(0);
    }
    loop.dispose();
  });
  it('sits a priming take out of a stroke', async () => {
    const { players, loop } = await loadedQuietly();
    const [first, second] = players;
    vi.spyOn(Math, 'random').mockReturnValueOnce(0);
    loop.start();
    expect(second.play).toHaveBeenCalledOnce();
    expect(first.play).toHaveBeenCalledOnce();
    loop.dispose();
  });
  it('lets a stroke that had to wait on a priming take keep it sounding', async () => {
    const { players, loop } = await loadedQuietly(2);
    const [only] = players;
    expect(only.play).toHaveBeenCalledOnce();
    loop.start();
    expect(only.play).toHaveBeenCalledOnce();
    const pauses = only.pause.mock.calls.length;
    reportPlaying(only);
    expect(only.pause.mock.calls.length).toBe(pauses);
    expect(only.play).toHaveBeenCalledTimes(2);
    loop.dispose();
  });
  it('releases a prime the native player never reports, so the take can still sound', async () => {
    vi.useFakeTimers();
    const { players, loop } = await loadedQuietly();
    await vi.runAllTimersAsync();
    for (const player of players) {
      expect(player.play).toHaveBeenCalledOnce();
      expect(player.pause).toHaveBeenCalledOnce();
    }
    vi.spyOn(Math, 'random').mockReturnValueOnce(0);
    loop.start();
    expect(players[0].play).toHaveBeenCalledTimes(2);
    loop.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not prime a take a stroke already played, whose seek may be in flight', async () => {
    const { players, loop } = await loadedQuietly();
    const [first, second, third] = players;
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.9);
    loop.start();
    expect(third.play).toHaveBeenCalledOnce();
    third.seekTo.mockReturnValueOnce(new Promise(() => {}));
    loop.stop();
    reportPlaying(first);
    await vi.waitFor(() => expect(second.play).toHaveBeenCalledOnce());
    reportPlaying(second);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(third.play).toHaveBeenCalledOnce();
    loop.dispose();
  });
  it('never touches a take whose prime is pending once the loop is released', async () => {
    vi.useFakeTimers();
    const { players, loop } = await loadedQuietly();
    const [first] = players;
    loop.dispose();
    const pauses = first.pause.mock.calls.length;
    await vi.runAllTimersAsync();
    expect(first.pause.mock.calls.length).toBe(pauses);
    for (const player of players.slice(1)) expect(player.play).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
