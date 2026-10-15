import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClearSound } from '../../experiments/native-architecture/src/audio/pageTurnSound.ts';

// React Native's own AbortController, whose signal lacks throwIfAborted(), as on a device.
const runtimeRequire = createRequire(import.meta.url);
const reactNativeRequire = createRequire(runtimeRequire.resolve('react-native/package.json'));
const { AbortController: NativeAbortController } = reactNativeRequire(
  'abort-controller/dist/abort-controller'
);

const native = vi.hoisted(() => ({ impact: vi.fn(async () => {}) }));
vi.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  impactAsync: native.impact,
}));
const audio = vi.hoisted(() => ({ create: vi.fn(), mode: vi.fn(async () => {}) }));
vi.mock('expo-audio', () => ({ createAudioPlayer: audio.create, setAudioModeAsync: audio.mode }));
import { loadClearPageTurn } from '../../experiments/native-architecture/src/platform/clearSound.ts';
import { PLAYBACK_AUDIO_MODE } from '../../experiments/native-architecture/src/audio/playbackMode.ts';
import { impactThreshold } from '../../experiments/native-architecture/src/platform/clearHaptics.ts';
import { clearActivationProps as nativeActivation } from '../../experiments/native-architecture/src/platform/clearActivation.ts';
import { clearActivationProps as webActivation } from '../../experiments/native-architecture/src/platform/clearActivation.web.ts';
import {
  impactThreshold as webImpactThreshold,
  WEB_IMPACT_MS,
} from '../../experiments/native-architecture/src/platform/clearHaptics.web.ts';

function loader() {
  const turn = { play: vi.fn(), dispose: vi.fn() };
  let resolve;
  const load = vi.fn(
    () =>
      new Promise((done) => {
        resolve = () => done(turn);
      })
  );
  return { turn, load, arrive: async () => resolve() };
}

async function ready(sound, fixture) {
  sound.start();
  await fixture.arrive();
  await Promise.resolve();
}

afterEach(() => {
  vi.unstubAllGlobals();
  native.impact.mockReset().mockResolvedValue();
  audio.create.mockReset();
  audio.mode.mockClear();
});

describe('native clear page-turn owner', () => {
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

describe('native threshold haptic', () => {
  it('asks for the shipping Medium impact and swallows a missing motor', async () => {
    impactThreshold();
    await vi.waitFor(() => expect(native.impact).toHaveBeenCalledExactlyOnceWith('medium'));
    const rejected = vi.fn();
    process.on('unhandledRejection', rejected);
    native.impact.mockRejectedValueOnce(new Error('no motor'));
    expect(() => impactThreshold()).not.toThrow();
    await vi.waitFor(() => expect(native.impact).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    process.off('unhandledRejection', rejected);
    expect(rejected).not.toHaveBeenCalled();
  });

  it('vibrates for the shipping web duration where the Vibration API exists', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });
    webImpactThreshold();
    expect(vibrate).toHaveBeenCalledExactlyOnceWith(WEB_IMPACT_MS);
    vi.stubGlobal('navigator', {});
    expect(() => webImpactThreshold()).not.toThrow();
  });
});

function nativePlayer() {
  const player = {
    isLoaded: false,
    volume: 0,
    play: vi.fn(),
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
  it('loads in the shared playback mode and plays from the start, capped at unity', async () => {
    const player = nativePlayer();
    const signal = new NativeAbortController().signal;
    expect(signal.throwIfAborted).toBeUndefined();
    const pending = loadClearPageTurn(signal);
    await vi.waitFor(() => expect(player.listener).not.toBeNull());
    expect(audio.mode).toHaveBeenCalledExactlyOnceWith(PLAYBACK_AUDIO_MODE);
    expect(audio.mode).toHaveBeenCalledWith(expect.objectContaining({ playsInSilentMode: false }));
    player.listener({ isLoaded: true, error: null });
    const turn = await pending;
    turn.play(2);
    expect(player.volume).toBe(1);
    expect(player.seekTo).toHaveBeenCalledWith(0);
    expect(player.play).toHaveBeenCalledOnce();
    turn.play(0.5);
    expect(player.volume).toBe(0.5);
    turn.dispose();
    expect(player.remove).toHaveBeenCalledOnce();
  });

  it('refuses a load abandoned before the player exists, on the native signal', async () => {
    const request = new NativeAbortController();
    request.abort();
    await expect(loadClearPageTurn(request.signal)).rejects.toThrow('cancelled');
    expect(audio.create).not.toHaveBeenCalled();
  });

  it('releases the player when the gesture abandons the load', async () => {
    const player = nativePlayer();
    const request = new NativeAbortController();
    const pending = loadClearPageTurn(request.signal);
    await vi.waitFor(() => expect(player.addListener).toHaveBeenCalled());
    request.abort();
    await expect(pending).rejects.toThrow('cancelled');
    expect(player.remove).toHaveBeenCalledOnce();
    expect(player.play).not.toHaveBeenCalled();
  });
});

describe('Clear activation without a drag', () => {
  it('clears on a VoiceOver tap or a TalkBack activate action and nothing else on native', () => {
    const activate = vi.fn();
    const props = nativeActivation(activate);
    expect(props.accessibilityActions).toEqual([{ name: 'activate' }]);
    props.onAccessibilityAction({ nativeEvent: { actionName: 'magicTap' } });
    expect(activate).not.toHaveBeenCalled();
    props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } });
    expect(activate).toHaveBeenCalledOnce();
    props.onAccessibilityTap();
    expect(activate).toHaveBeenCalledTimes(2);
  });

  it('clears on Enter, Space or a detail-zero click on the web, never a pointer click', () => {
    const activate = vi.fn();
    const props = webActivation(activate);
    expect(props.focusable).toBe(true);
    props.onClick({ detail: 1 });
    props.onKeyDown({ key: 'a', preventDefault: vi.fn() });
    expect(activate).not.toHaveBeenCalled();
    props.onClick({ detail: 0 });
    for (const key of ['Enter', ' ']) {
      const preventDefault = vi.fn();
      props.onKeyDown({ key, preventDefault });
      expect(preventDefault).toHaveBeenCalledOnce();
    }
    expect(activate).toHaveBeenCalledTimes(3);
  });
});
