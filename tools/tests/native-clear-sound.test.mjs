import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NativeAbortController } from './native-rn-abort-controller.mjs';
import {
  CLEAR_PAGE_TURN_ASSET_GAIN,
  createClearSound,
} from '../../experiments/native-architecture/src/audio/pageTurnSound.ts';
import amplifiedClearPageTurn from '../../experiments/native-architecture/src/audio/clear-page-turn-amplified.wav';
import { AUDIO_LOAD_TIMEOUT_MS } from '../../experiments/native-architecture/src/audio/drawingAudio.ts';
import {
  clearLadderFrequency,
  CLEAR_CANCEL_SPACING_MS,
} from '../../web/src/lib/audio/clearSoundNotes.ts';

const notes = vi.hoisted(() => ({
  play: vi.fn(async () => {}),
  dispose: vi.fn(),
  load: vi.fn(),
}));
vi.mock('../../experiments/native-architecture/src/platform/clearNotes.native.ts', () => ({
  loadClearNotes: notes.load,
}));
const audio = vi.hoisted(() => ({ create: vi.fn(), mode: vi.fn(async () => {}) }));
vi.mock('expo-audio', () => ({ createAudioPlayer: audio.create, setAudioModeAsync: audio.mode }));
import { loadClearPageTurn } from '../../experiments/native-architecture/src/platform/clearSound.ts';
import { PLAYBACK_AUDIO_MODE } from '../../experiments/native-architecture/src/audio/playbackMode.ts';

function loader() {
  const turn = { note: vi.fn(), play: vi.fn(), dispose: vi.fn() };
  let resolve;
  const load = vi.fn((_signal, publishNotes) => {
    publishNotes(turn.note);
    return new Promise((done) => {
      resolve = () => done(turn);
    });
  });
  return { turn, load, arrive: async () => resolve() };
}

async function ready(sound, fixture) {
  sound.start();
  await fixture.arrive();
  await Promise.resolve();
}

beforeEach(() => {
  notes.play.mockReset().mockResolvedValue();
  notes.dispose.mockReset();
  notes.load.mockReset().mockResolvedValue({ play: notes.play, dispose: notes.dispose });
});

afterEach(() => {
  vi.unstubAllGlobals();
  audio.create.mockReset();
  audio.mode.mockClear();
});

describe('shared Clear sound owner', () => {
  it('plays an available bubble while the page-turn clip is loading and drops it on teardown', async () => {
    const fixture = loader();
    const sound = createClearSound(fixture.load);
    sound.setEnabled(true);
    sound.start();
    sound.update(0.5);
    expect(fixture.turn.note).toHaveBeenCalledExactlyOnceWith(clearLadderFrequency(5), 1);
    expect(fixture.turn.play).not.toHaveBeenCalled();
    const publishNotes = fixture.load.mock.calls[0][1];
    sound.dispose();
    const stale = vi.fn();
    publishNotes(stale);
    sound.update(1);
    expect(stale).not.toHaveBeenCalled();
    await fixture.arrive();
    await Promise.resolve();
    expect(fixture.turn.dispose).toHaveBeenCalledOnce();
  });

  it('plays shipping ladder steps beyond the threshold and unwinds a short release', async () => {
    vi.useFakeTimers();
    try {
      const fixture = loader();
      const sound = createClearSound(fixture.load);
      sound.setEnabled(true);
      await ready(sound, fixture);
      for (const progress of [0, 0.11, 0.11, 0.5, 1, 1.8, 2.6, 2.6, 0.5]) sound.update(progress);
      expect(fixture.turn.note.mock.calls).toEqual(
        [0, 1, 5, 9, 14, 18, 5].map((step) => [clearLadderFrequency(step), 1])
      );
      fixture.turn.note.mockClear();
      sound.cancel();
      await vi.advanceTimersByTimeAsync(CLEAR_CANCEL_SPACING_MS * 2);
      expect(fixture.turn.note.mock.calls).toEqual(
        [1, 2, 3].map((index) => [clearLadderFrequency(5) * 2 ** ((-3 * index) / 12), 0.4])
      );
      expect(fixture.turn.play).not.toHaveBeenCalled();
      sound.start();
      sound.update(0.5);
      sound.cancel();
      fixture.turn.note.mockClear();
      sound.start();
      await vi.advanceTimersByTimeAsync(CLEAR_CANCEL_SPACING_MS * 3);
      expect(fixture.turn.note).not.toHaveBeenCalled();
      sound.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('releases a rejected native note and retries its paired resources on the next gesture', async () => {
    const fixture = loader();
    fixture.turn.note.mockRejectedValueOnce(new Error('native playback failed'));
    const sound = createClearSound(fixture.load);
    try {
      sound.setEnabled(true);
      await ready(sound, fixture);
      sound.update(0.5);
      await vi.waitFor(() => expect(fixture.turn.dispose).toHaveBeenCalledOnce());
      await ready(sound, fixture);
      sound.update(0.5);
      expect(fixture.load).toHaveBeenCalledTimes(2);
      expect(fixture.turn.note).toHaveBeenCalledTimes(2);
      expect(fixture.turn.play).not.toHaveBeenCalled();
    } finally {
      sound.dispose();
    }
  });

  it('ignores a superseded note rejection even when the next resource publishes the same player', async () => {
    let reject;
    const first = loader();
    const second = loader();
    first.turn.note.mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        })
    );
    second.turn.note = first.turn.note;
    const load = vi.fn().mockImplementationOnce(first.load).mockImplementationOnce(second.load);
    const sound = createClearSound(load);
    try {
      sound.setEnabled(true);
      await ready(sound, first);
      sound.update(0.5);
      sound.setEnabled(false);
      sound.setEnabled(true);
      await ready(sound, second);
      reject(new Error('old native playback failed'));
      await Promise.resolve();
      await Promise.resolve();
      expect(first.turn.dispose).toHaveBeenCalledOnce();
      expect(second.turn.dispose).not.toHaveBeenCalled();
      sound.update(1);
      expect(second.turn.note).toHaveBeenLastCalledWith(clearLadderFrequency(9), 1);
    } finally {
      sound.dispose();
    }
    expect(second.turn.dispose).toHaveBeenCalledOnce();
  });

  it('preloads an allowed page turn without playing before a clear', async () => {
    const fixture = loader();
    const sound = createClearSound(fixture.load);
    sound.prepare();
    expect(fixture.load).not.toHaveBeenCalled();
    sound.setEnabled(true);
    sound.prepare();
    sound.prepare();
    expect(fixture.load).toHaveBeenCalledOnce();
    await fixture.arrive();
    await Promise.resolve();
    expect(fixture.turn.play).not.toHaveBeenCalled();
    sound.commit();
    expect(fixture.turn.play).toHaveBeenCalledExactlyOnceWith(1);
    sound.dispose();
  });
  it('plays once per commit at the gain of its volume', async () => {
    const fixture = loader();
    const sound = createClearSound(fixture.load);
    sound.setEnabled(true);
    await ready(sound, fixture);
    sound.commit();
    expect(fixture.turn.play).toHaveBeenCalledExactlyOnceWith(1);
    sound.setVolume(100);
    sound.commit();
    sound.setVolume(25);
    sound.commit();
    expect(fixture.turn.play.mock.calls).toEqual([[1], [2], [0.5]]);
    expect(fixture.load).toHaveBeenCalledOnce();
  });

  it('plays a commit that beat the clip as soon as the clip arrives, and not after a cancel', async () => {
    const fixture = loader();
    const sound = createClearSound(fixture.load);
    sound.setEnabled(true);
    sound.start();
    sound.commit();
    expect(fixture.turn.play).not.toHaveBeenCalled();
    await fixture.arrive();
    await Promise.resolve();
    expect(fixture.turn.play).toHaveBeenCalledOnce();
    const late = loader();
    const cancelled = createClearSound(late.load);
    cancelled.setEnabled(true);
    cancelled.start();
    cancelled.cancel();
    await late.arrive();
    await Promise.resolve();
    expect(late.turn.play).not.toHaveBeenCalled();
  });

  it('stays silent and releases the clip while sound is off or the app is backgrounded', async () => {
    const fixture = loader();
    const sound = createClearSound(fixture.load);
    sound.start();
    sound.commit();
    expect(fixture.load).not.toHaveBeenCalled();
    sound.setEnabled(true);
    await ready(sound, fixture);
    sound.setEnabled(false);
    expect(fixture.turn.dispose).toHaveBeenCalledOnce();
    sound.commit();
    expect(fixture.turn.play).not.toHaveBeenCalled();
    sound.setEnabled(true);
    sound.setForeground(false);
    sound.commit();
    expect(fixture.turn.play).not.toHaveBeenCalled();
  });

  it('retries a failed load on the next gesture without failing the clear', async () => {
    const turn = { play: vi.fn(), dispose: vi.fn() };
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(turn);
    const sound = createClearSound(load);
    sound.setEnabled(true);
    sound.start();
    await Promise.resolve();
    await Promise.resolve();
    sound.commit();
    await Promise.resolve();
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(2);
    expect(turn.play).toHaveBeenCalledOnce();
  });
});

function nativePlayer() {
  const player = {
    isLoaded: false,
    playing: false,
    released: false,
    volume: 0,
    play: vi.fn(() => {
      player.playing = true;
    }),
    pause: vi.fn(() => {
      player.playing = false;
    }),
    release: vi.fn(() => {
      player.released = true;
      player.playing = false;
    }),
    seekTo: vi.fn(async () => {}),
    remove: vi.fn(),
    listener: null,
  };
  player.addListener = vi.fn((_name, listener) => {
    player.listener = listener;
    return { remove: vi.fn() };
  });
  audio.create.mockReturnValueOnce(player);
  return player;
}

describe('native page-turn player', () => {
  it('publishes the native bubble player to the shared Clear gesture owner', async () => {
    const player = nativePlayer();
    const published = vi.fn();
    const sound = createClearSound((signal, publishNotes) =>
      loadClearPageTurn(signal, (play) => {
        published(play);
        publishNotes(play);
      })
    );
    try {
      sound.setEnabled(true);
      sound.start();
      await vi.waitFor(() => expect(player.listener).not.toBeNull());
      player.listener({ isLoaded: true, error: null });
      await vi.waitFor(() =>
        expect(published).toHaveBeenCalledExactlyOnceWith(expect.any(Function))
      );
      sound.update(0.5);
      expect(player.play).not.toHaveBeenCalled();
    } finally {
      sound.dispose();
    }
    await vi.waitFor(() => expect(player.release).toHaveBeenCalledOnce());
  });

  it('prepares native notes before a settled first gesture without playing during warmup', async () => {
    const player = nativePlayer();
    let ready;
    const prepared = new Promise((resolve) => {
      ready = resolve;
    });
    const sound = createClearSound(async (signal, publishNotes) => {
      const turn = await loadClearPageTurn(signal, publishNotes);
      ready();
      return turn;
    });
    try {
      sound.setEnabled(true);
      sound.prepare();
      await vi.waitFor(() => expect(player.listener).not.toBeNull());
      player.listener({ isLoaded: true, error: null });
      await prepared;
      await Promise.resolve();
      expect(notes.play).not.toHaveBeenCalled();
      expect(player.play).not.toHaveBeenCalled();
      sound.start();
      sound.update(0.5);
      expect(notes.load).toHaveBeenCalledOnce();
      expect(notes.play).toHaveBeenCalledExactlyOnceWith(clearLadderFrequency(5), 1);
      expect(player.play).not.toHaveBeenCalled();
    } finally {
      sound.dispose();
    }
  });

  it('forwards the ladder and cancellation gains through the actual native adapter', async () => {
    vi.useFakeTimers();
    const player = nativePlayer();
    const sound = createClearSound(loadClearPageTurn);
    try {
      sound.setEnabled(true);
      sound.start();
      await vi.waitFor(() => expect(player.listener).not.toBeNull());
      player.listener({ isLoaded: true, error: null });
      await Promise.resolve();
      await Promise.resolve();
      for (const [volume, gain] of [
        [25, 0.5],
        [50, 1],
        [100, 2],
      ]) {
        sound.setVolume(volume);
        sound.start();
        sound.update(0.5);
        expect(notes.play).toHaveBeenLastCalledWith(clearLadderFrequency(5), gain);
      }
      notes.play.mockClear();
      sound.cancel();
      await vi.advanceTimersByTimeAsync(CLEAR_CANCEL_SPACING_MS * 2);
      expect(notes.play.mock.calls).toEqual(
        [1, 2, 3].map((index) => [clearLadderFrequency(5) * 2 ** ((-3 * index) / 12), 0.8])
      );
      expect(player.play).not.toHaveBeenCalled();
    } finally {
      sound.dispose();
      vi.useRealTimers();
    }
    expect(notes.dispose).toHaveBeenCalled();
  });

  it('bounds bank readiness even after the page-turn clip is ready', async () => {
    vi.useFakeTimers();
    const player = nativePlayer();
    let arrive;
    notes.load.mockReturnValueOnce(
      new Promise((resolve) => {
        arrive = resolve;
      })
    );
    const request = new NativeAbortController();
    const outcome = loadClearPageTurn(request.signal, vi.fn()).catch((error) => error.message);
    try {
      await vi.waitFor(() => expect(player.listener).not.toBeNull());
      player.listener({ isLoaded: true, error: null });
      await vi.advanceTimersByTimeAsync(AUDIO_LOAD_TIMEOUT_MS);
      expect(await outcome).toBe('Clear sound did not load.');
      expect(player.release).toHaveBeenCalledOnce();
      expect(player.play).not.toHaveBeenCalled();
    } finally {
      request.abort();
      arrive({ play: notes.play, dispose: notes.dispose });
      await outcome;
      vi.useRealTimers();
    }
    expect(notes.dispose).toHaveBeenCalledOnce();
  });

  it('closes native notes and the page turn together after a rejected note', async () => {
    const player = nativePlayer();
    const sound = createClearSound(loadClearPageTurn);
    try {
      sound.setEnabled(true);
      sound.start();
      await vi.waitFor(() => expect(player.listener).not.toBeNull());
      player.listener({ isLoaded: true, error: null });
      await Promise.resolve();
      await Promise.resolve();
      notes.play.mockRejectedValueOnce(new Error('native playback failed'));
      sound.update(0.5);
      await vi.waitFor(() => expect(player.release).toHaveBeenCalledOnce());
      expect(notes.dispose).toHaveBeenCalledOnce();
      expect(player.play).not.toHaveBeenCalled();
    } finally {
      sound.dispose();
    }
  });

  it('uses compensated audio to preserve shipping gain through the Loud level', async () => {
    const player = nativePlayer();
    const signal = new NativeAbortController().signal;
    const pending = loadClearPageTurn(signal, vi.fn());
    await vi.waitFor(() => expect(player.listener).not.toBeNull());
    expect(audio.mode).toHaveBeenCalledExactlyOnceWith(PLAYBACK_AUDIO_MODE);
    expect(audio.mode).toHaveBeenCalledWith(expect.objectContaining({ playsInSilentMode: false }));
    player.listener({ isLoaded: true, error: null });
    const turn = await pending;
    expect(audio.create.mock.calls[0][0]).toBe(amplifiedClearPageTurn);
    turn.play(2);
    expect(player.volume).toBe(1);
    expect(player.seekTo).toHaveBeenCalledWith(0);
    expect(player.play).toHaveBeenCalledOnce();
    turn.play(0.5);
    expect(player.volume * CLEAR_PAGE_TURN_ASSET_GAIN).toBe(0.5);
    turn.play(1);
    expect(player.volume * CLEAR_PAGE_TURN_ASSET_GAIN).toBe(1);
    turn.dispose();
    turn.dispose();
    expect(player.playing).toBe(false);
    expect(player.volume).toBe(0);
    expect(player.released).toBe(true);
    expect(player.remove).toHaveBeenCalledOnce();
    expect(player.release).toHaveBeenCalledOnce();
  });

  it('retains native load failure while closing both pending resources', async () => {
    const player = nativePlayer();
    const request = new NativeAbortController();
    const outcome = loadClearPageTurn(request.signal, vi.fn()).catch((error) => error.message);
    try {
      await vi.waitFor(() => expect(player.listener).not.toBeNull());
      player.listener({ isLoaded: false, error: 'decoder failure' });
      expect(await outcome).toBe('Clear sound is unavailable.');
      expect(player.release).toHaveBeenCalledOnce();
      expect(player.play).not.toHaveBeenCalled();
    } finally {
      request.abort();
      await outcome;
    }
  });

  it.each([
    ['playback error', { isLoaded: true, error: 'decoder failure' }],
    ['media reset', { isLoaded: true, error: null, mediaServicesDidReset: true }],
  ])('closes both ready resources after a native %s', async (_reason, status) => {
    const player = nativePlayer();
    const request = new NativeAbortController();
    const pending = loadClearPageTurn(request.signal, vi.fn());
    let turn;
    try {
      await vi.waitFor(() => expect(player.listener).not.toBeNull());
      player.listener({ isLoaded: true, error: null });
      turn = await pending;
      player.listener(status);
      expect(player.volume).toBe(0);
      expect(player.pause).toHaveBeenCalledOnce();
      expect(player.release).toHaveBeenCalledOnce();
      expect(notes.dispose).toHaveBeenCalledOnce();
      expect(() => turn.play(1)).toThrow('cancelled');
      expect(player.play).not.toHaveBeenCalled();
    } finally {
      request.abort();
      turn?.dispose();
    }
  });

  it('refuses a load abandoned before the player exists, on the native signal', async () => {
    const request = new NativeAbortController();
    request.abort();
    await expect(loadClearPageTurn(request.signal, vi.fn())).rejects.toThrow('cancelled');
    expect(audio.create).not.toHaveBeenCalled();
  });

  it('releases the player when the gesture abandons the load', async () => {
    const player = nativePlayer();
    const request = new NativeAbortController();
    const pending = loadClearPageTurn(request.signal, vi.fn());
    await vi.waitFor(() => expect(player.addListener).toHaveBeenCalled());
    request.abort();
    await expect(pending).rejects.toThrow('cancelled');
    expect(player.remove).toHaveBeenCalledOnce();
    expect(player.released).toBe(true);
    expect(player.play).not.toHaveBeenCalled();
  });
});
