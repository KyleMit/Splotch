import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NativeAbortController } from './native-rn-abort-controller.mjs';
import { createRequire } from 'node:module';
import {
  clearLadderFrequency,
  clearLadderStep,
  CLEAR_CANCEL_NOTES,
  CLEAR_CANCEL_STEP_SEMITONES,
} from '../../web/src/lib/audio/clearSoundNotes.ts';

import { CLEAR_PAGE_TURN_ASSET_GAIN } from '../../experiments/native-architecture/src/audio/pageTurnSound.ts';
import { AUDIO_PLAYS_IN_SILENT_MODE as IOS_PLAYS_IN_SILENT_MODE } from '../../experiments/native-architecture/src/platform/audioSilentMode.ts';
import { AUDIO_PLAYS_IN_SILENT_MODE as ANDROID_PLAYS_IN_SILENT_MODE } from '../../experiments/native-architecture/src/platform/audioSilentMode.android.ts';
import { describeMp3 } from '../sounds/lib/mp3-stream.mjs';
import { PENCIL_SOUNDS } from '../../experiments/native-architecture/src/audio/pencilSounds.ts';

import { impactThreshold } from '../../experiments/native-architecture/src/platform/clearHaptics.ts';
import { clearActivationProps as nativeActivation } from '../../experiments/native-architecture/src/platform/clearActivation.ts';
import { clearActivationProps as webActivation } from '../../experiments/native-architecture/src/platform/clearActivation.web.ts';
import {
  impactThreshold as webImpactThreshold,
  WEB_IMPACT_MS,
} from '../../experiments/native-architecture/src/platform/clearHaptics.web.ts';

import { SETTINGS_METRICS } from '../../experiments/native-architecture/src/drawing/theme.ts';
import { scale } from '../../web/src/lib/design/tokens.ts';
const root = join(import.meta.dirname, '../..');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const takeNames = ['pencil-1.mp3', 'pencil-2.mp3', 'pencil-3.mp3'];
const candidateTakes = readFileSync(
  join(root, 'experiments/native-architecture/src/audio/pencilSounds.ts'),
  'utf8'
);
const shippingAsset = readFileSync(join(root, 'web/static/sounds/pencil-1.mp3'));
const candidateAsset = readFileSync(
  join(root, 'experiments/native-architecture/src/audio/pencil-1.mp3')
);
describe('candidate-owned audio and Settings projections', () => {
  it('pins the bundled native clip to the reused portable MP3 bytes', () => {
    expect(digest(candidateAsset)).toBe(digest(shippingAsset));
  });
  it('bundles every pencil take byte for byte and imports the complete set', () => {
    for (const name of takeNames) {
      expect(candidateTakes).toContain(`'./${name}'`);
      expect(
        digest(readFileSync(join(root, 'experiments/native-architecture/src/audio', name)))
      ).toBe(digest(readFileSync(join(root, 'web/static/sounds', name))));
    }
    expect(PENCIL_SOUNDS).toHaveLength(takeNames.length);
  });
  it('rejects changed MP3 bytes', () => {
    const changed = Buffer.from(candidateAsset);
    changed[0] ^= 1;
    expect(digest(changed)).not.toBe(digest(shippingAsset));
  });
  it('pins the Settings scale projection to the design owner', () => {
    expect(SETTINGS_METRICS).toEqual({
      radius: parseFloat(scale.radiusLg),
      padding: parseFloat(scale.space6),
      titleSize: parseFloat(scale.fontSizeXl),
      textSize: parseFloat(scale.fontSizeMd),
      gap: parseFloat(scale.space2),
    });
  });
});

const runtimeRequire = createRequire(import.meta.url);
const { getAssetLocalPath } = runtimeRequire('@expo/cli/build/src/export/metroAssetLocalPath');
const { getAndroidResourceIdentifier } = runtimeRequire('@react-native/asset-utils');
const clearNoteSource = readFileSync(
  join(root, 'experiments/native-architecture/src/audio/clearNoteAssets.ts'),
  'utf8'
);
function clearNoteAndroidAssets(source) {
  return [...source.matchAll(/import \w+ from '\.\/clear-bubbles\/([^']+)\.wav';/g)].map(
    ([, name]) => ({ name, type: 'wav', httpServerLocation: '/assets/src/audio/clear-bubbles' })
  );
}
function assertClearNoteAndroidResources(source) {
  const assets = clearNoteAndroidAssets(source);
  assert.ok(assets.length > 0, 'Clear note imports must exist');
  const destinations = assets.map((asset) =>
    getAssetLocalPath(asset, { platform: 'android', scale: 1 })
  );
  assert.equal(
    new Set(destinations).size,
    assets.length,
    'Clear notes need unique Android resources'
  );
  assets.forEach((asset, index) =>
    assert.equal(destinations[index], join('raw', `${getAndroidResourceIdentifier(asset)}.wav`))
  );
}

const native = vi.hoisted(() => ({
  impact: vi.fn(async () => {}),
  clear: {
    create: vi.fn(),
    prepare: vi.fn(),
    play: vi.fn(),
    dispose: vi.fn(),
  },
}));
vi.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  impactAsync: native.impact,
}));
vi.mock('react-native', () => ({ NativeModules: { SplotchClearSound: native.clear } }));
const assets = vi.hoisted(() => ({ fromModule: vi.fn() }));
vi.mock('expo-asset', () => ({ Asset: { fromModule: assets.fromModule } }));
beforeEach(() => {
  native.impact.mockReset().mockResolvedValue();
  native.clear.create.mockReset().mockResolvedValue('clear-session');
  native.clear.prepare.mockReset().mockResolvedValue(true);
  native.clear.play.mockReset().mockResolvedValue(true);
  native.clear.dispose.mockReset();
  assets.fromModule.mockReset().mockImplementation((asset) => {
    const value = { localUri: `file:///clear/${encodeURIComponent(String(asset))}.wav` };
    return { downloadAsync: vi.fn(async () => value) };
  });
});

async function nativeNotesFixture() {
  const { loadClearNotes } = await vi.importActual(
    '../../experiments/native-architecture/src/platform/clearNotes.native.ts'
  );
  const request = new NativeAbortController();
  const sound = await loadClearNotes(request.signal);
  return { sound, request };
}

describe('native Clear sampler binding', () => {
  it('keeps every Clear note in a unique Android raw resource', async () => {
    const { CLEAR_NOTE_ASSETS } = await vi.importActual(
      '../../experiments/native-architecture/src/audio/clearNoteAssets.ts'
    );
    expect(clearNoteAndroidAssets(clearNoteSource)).toHaveLength(CLEAR_NOTE_ASSETS.length);
    expect(() => assertClearNoteAndroidResources(clearNoteSource)).not.toThrow();
  });

  it('rejects the prior negative filenames that collide with positive Android resources', () => {
    const prior = clearNoteSource.replace(
      /clear-bubbles\/minus(\d+)\.wav/g,
      'clear-bubbles/-$1.wav'
    );
    expect(prior).not.toBe(clearNoteSource);
    expect(() => assertClearNoteAndroidResources(prior)).toThrow(
      'Clear notes need unique Android resources'
    );
  });

  it('prepares the full shipping pitch vocabulary before playback', async () => {
    const { CLEAR_NOTE_ASSETS } = await vi.importActual(
      '../../experiments/native-architecture/src/audio/clearNoteAssets.ts'
    );
    const expected = new Set();
    for (let step = 0; step <= clearLadderStep(Infinity); step += 1) {
      const semitone = Math.round(
        12 * Math.log2(clearLadderFrequency(step) / clearLadderFrequency(0))
      );
      expected.add(semitone);
      for (let note = 1; note <= CLEAR_CANCEL_NOTES; note += 1)
        expected.add(semitone - CLEAR_CANCEL_STEP_SEMITONES * note);
    }
    const assertVocabulary = (notes) =>
      assert.deepEqual(
        notes.map(({ semitone }) => semitone),
        [...expected].sort((a, b) => a - b)
      );
    expect(() => assertVocabulary(CLEAR_NOTE_ASSETS)).not.toThrow();
    expect(() => assertVocabulary(CLEAR_NOTE_ASSETS.slice(1))).toThrow();
    const fixture = await nativeNotesFixture();
    try {
      expect(native.clear.create).toHaveBeenCalledOnce();
      expect(native.clear.prepare).toHaveBeenCalledExactlyOnceWith(
        'clear-session',
        expect.any(Array)
      );
      expect(native.clear.prepare.mock.calls[0][1]).toHaveLength(CLEAR_NOTE_ASSETS.length);
      expect(native.clear.play).not.toHaveBeenCalled();
    } finally {
      fixture.sound.dispose();
    }
  });

  it.each([
    [0.5, 0.25],
    [1, 0.5],
    [2, 1],
  ])('preserves shipping gain %s within native unit volume', async (gain, nativeGain) => {
    const fixture = await nativeNotesFixture();
    try {
      await fixture.sound.play(clearLadderFrequency(5), gain);
      expect(native.clear.play).toHaveBeenCalledExactlyOnceWith(
        'clear-session',
        expect.any(Number),
        nativeGain
      );
    } finally {
      fixture.sound.dispose();
    }
  });

  it('creates no native voice at zero volume and refuses callbacks after disposal', async () => {
    const fixture = await nativeNotesFixture();
    await fixture.sound.play(clearLadderFrequency(5), 0);
    expect(native.clear.play).not.toHaveBeenCalled();
    fixture.sound.dispose();
    fixture.sound.dispose();
    expect(() => fixture.sound.play(clearLadderFrequency(5), 1)).toThrow('cancelled');
    expect(native.clear.play).not.toHaveBeenCalled();
    expect(native.clear.dispose).toHaveBeenCalledExactlyOnceWith('clear-session');
  });

  it('disposes a bank while readiness is pending and refuses its late completion', async () => {
    let arrive;
    native.clear.prepare.mockReturnValueOnce(
      new Promise((resolve) => {
        arrive = resolve;
      })
    );
    const { loadClearNotes } = await vi.importActual(
      '../../experiments/native-architecture/src/platform/clearNotes.native.ts'
    );
    const request = new NativeAbortController();
    const outcome = loadClearNotes(request.signal).catch((error) => error.message);
    try {
      await vi.waitFor(() => expect(native.clear.prepare).toHaveBeenCalled());
      request.abort();
      expect(native.clear.dispose).toHaveBeenCalledExactlyOnceWith('clear-session');
      arrive(true);
      expect(await outcome).toBe('Clear sound was cancelled.');
      expect(native.clear.dispose).toHaveBeenCalledOnce();
      expect(native.clear.play).not.toHaveBeenCalled();
    } finally {
      request.abort();
      arrive?.(true);
      await outcome;
    }
  });

  it('retains a refused native playback acknowledgment for the owner', async () => {
    const fixture = await nativeNotesFixture();
    native.clear.play.mockResolvedValueOnce(false);
    try {
      await expect(fixture.sound.play(clearLadderFrequency(5), 1)).rejects.toThrow('did not play');
    } finally {
      fixture.sound.dispose();
    }
  });
});

const sourceText = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const clearActivitySources = {
  sampler: sourceText('experiments/native-architecture/ios/Splotch/SplotchClearSound.swift'),
  expoPatch: sourceText('patches/expo-audio@58.0.9.patch'),
};
function assertClearAudioActivity(sources) {
  const event = /private let clearAudioActivity = Notification.Name\("([^"]+)"\)/.exec(
    sources.sampler
  )?.[1];
  assert.ok(event, 'Missing native Clear audio activity event');
  const expoEvent = /name: Notification.Name\("([^"]+)"\), object: nil\)/.exec(
    sources.expoPatch
  )?.[1];
  assert.equal(event, expoEvent, 'Native notes and Expo must share the activity event');
  const keys = /userInfo: \["([^"]+)": id, "([^"]+)": active\]/.exec(sources.sampler);
  assert.ok(keys, 'Missing native Clear audio activity payload');
  assert.ok(sources.expoPatch.includes(`notification.userInfo?["${keys[1]}"] as? String`));
  assert.ok(sources.expoPatch.includes(`notification.userInfo?["${keys[2]}"] as? Bool`));
  // Expo deactivates only a session it believes active, and the sampler activates it directly.
  assert.match(
    sources.expoPatch,
    /\+\s+self\.externalClearNotes\.insert\(id\)\n\+\s+self\.sessionIsActive = true/,
    'A Clear note must mark the session active so the last note releases it'
  );
  assert.match(sources.expoPatch, /\+\s+self\.externalClearNotes\.isEmpty,/);
}

const nativeMediaPolicy = {
  ios: IOS_PLAYS_IN_SILENT_MODE,
  android: ANDROID_PLAYS_IN_SILENT_MODE,
  mode: sourceText('experiments/native-architecture/src/audio/playbackMode.ts'),
  sampler: sourceText(
    'experiments/native-architecture/android/app/src/main/java/art/splotch/app/SplotchClearSound.kt'
  ),
};
function assertNativeMediaPolicy(policy) {
  assert.equal(policy.ios, false, 'iOS follows its silent switch');
  assert.equal(policy.android, true, 'Android follows its media volume');
  assert.match(
    policy.mode,
    /import \{ AUDIO_PLAYS_IN_SILENT_MODE \} from '\.\.\/platform\/audioSilentMode';/
  );
  assert.match(policy.mode, /playsInSilentMode: AUDIO_PLAYS_IN_SILENT_MODE,/);
  assert.match(policy.sampler, /setUsage\(AudioAttributes\.USAGE_MEDIA\)/);
  assert.doesNotMatch(policy.sampler, /ringerMode|RINGER_MODE/);
}

describe('native media playback policy', () => {
  it('uses Android media volume and retains the iOS silent switch across both audio owners', () => {
    expect(() => assertNativeMediaPolicy(nativeMediaPolicy)).not.toThrow();
    for (const owner of ['clearSound', 'drawingAudio'])
      expect(sourceText(`experiments/native-architecture/src/platform/${owner}.ts`)).toContain(
        'setAudioModeAsync(PLAYBACK_AUDIO_MODE)'
      );
  });

  it('rejects the prior Android Expo ringer policy', () => {
    expect(() => assertNativeMediaPolicy({ ...nativeMediaPolicy, android: false })).toThrow(
      'Android follows its media volume'
    );
  });

  it('rejects a restored Normal-only Clear note guard', () => {
    const sampler = nativeMediaPolicy.sampler.replace(
      'bank == null || !bank.play',
      'audioManager.ringerMode != AudioManager.RINGER_MODE_NORMAL || bank == null || !bank.play'
    );
    expect(sampler).not.toBe(nativeMediaPolicy.sampler);
    expect(() => assertNativeMediaPolicy({ ...nativeMediaPolicy, sampler })).toThrow();
  });
});

describe('native Clear audio session boundary', () => {
  it('delivers native active-voice changes to the existing Expo session owner', () => {
    expect(() => assertClearAudioActivity(clearActivitySources)).not.toThrow();
  });

  it.each(['sampler', 'expoPatch'])('rejects a renamed activity event in %s', (owner) => {
    const changed = {
      ...clearActivitySources,
      [owner]: clearActivitySources[owner].replace(
        'SplotchClearAudioActivity',
        'DisconnectedClearAudioActivity'
      ),
    };
    expect(() => assertClearAudioActivity(changed)).toThrow();
  });

  it.each([
    ['sampler', '"id": id', '"identity": id'],
    ['sampler', '"active": active', '"playing": active'],
    ['expoPatch', 'userInfo?["id"]', 'userInfo?["identity"]'],
    ['expoPatch', 'userInfo?["active"]', 'userInfo?["playing"]'],
    ['expoPatch', 'self.sessionIsActive = true', '_ = true'],
    ['expoPatch', 'self.externalClearNotes.isEmpty,', 'true,'],
  ])('rejects a disconnected activity payload in %s (%s)', (owner, before, after) => {
    const changed = {
      ...clearActivitySources,
      [owner]: clearActivitySources[owner].replace(before, after),
    };
    expect(changed[owner]).not.toBe(clearActivitySources[owner]);
    expect(() => assertClearAudioActivity(changed)).toThrow();
  });

  it('registers the same Clear sampler and methods on Android and iOS', () => {
    const ts = sourceText('experiments/native-architecture/src/platform/clearNotes.native.ts');
    const swift = clearActivitySources.sampler;
    const bridge = sourceText('experiments/native-architecture/ios/Splotch/SplotchClearSound.m');
    const kotlin = sourceText(
      'experiments/native-architecture/android/app/src/main/java/art/splotch/app/SplotchClearSound.kt'
    );
    const application = sourceText(
      'experiments/native-architecture/android/app/src/main/java/art/splotch/app/MainApplication.kt'
    );
    const project = sourceText(
      'experiments/native-architecture/ios/Splotch.xcodeproj/project.pbxproj'
    );
    const name = /const CLEAR_NOTE_MODULE = '([^']+)'/.exec(ts)?.[1];
    expect(name).toBe('SplotchClearSound');
    expect(swift).toContain(`@objc(${name})`);
    expect(bridge).toContain(`RCT_EXTERN_MODULE(${name}, NSObject)`);
    expect(kotlin).toContain(`override fun getName() = "${name}"`);
    expect(application).toContain('add(SplotchClearSoundPackage())');
    for (const method of ['create', 'prepare', 'play', 'dispose']) {
      expect(bridge).toContain(`RCT_EXTERN_METHOD(${method}:`);
      expect(kotlin).toContain(`fun ${method}(`);
    }
    for (const extension of ['swift', 'm'])
      expect(project.split(`/* ${name}.${extension} in Sources */,`).length - 1).toBe(1);
  });
});

afterEach(() => vi.unstubAllGlobals());

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

describe('native Clear page-turn PCM projection', () => {
  it('holds exactly doubled shipping PCM without clipping or changing its gapless length', () => {
    const source = readFileSync(
      new URL('../../web/static/sounds/clear-page-turn.mp3', import.meta.url)
    );
    const amplified = readFileSync(
      new URL(
        '../../experiments/native-architecture/src/audio/clear-page-turn-amplified.wav',
        import.meta.url
      )
    );
    // The PCM hash pins LAME's decoded source; the source hash requires re-deriving it when the clip changes.
    expect(createHash('sha256').update(source).digest('hex')).toBe(
      '251f811ac6b78867d25d81ff8d6fa512ce0c2dfe8fc1db50432b1a618fddeeb6'
    );
    expect(amplified.subarray(0, 44).toString('hex')).toBe(
      '52494646e0d4010057415645666d7420100000000100020044ac000010b102000400100064617461bcd40100'
    );
    const pcm = amplified.subarray(44);
    const { samples, channels } = describeMp3(source);
    expect(pcm.length).toBe(samples * channels * 2);
    const restored = Buffer.alloc(pcm.length);
    let peak = 0;
    let reversible = true;
    for (let offset = 0; offset < pcm.length; offset += 2) {
      const sample = pcm.readInt16LE(offset);
      peak = Math.max(peak, Math.abs(sample));
      reversible &&= sample % CLEAR_PAGE_TURN_ASSET_GAIN === 0;
      restored.writeInt16LE(sample / CLEAR_PAGE_TURN_ASSET_GAIN, offset);
    }
    expect(peak).toBeLessThan(32767);
    expect(reversible).toBe(true);
    expect(createHash('sha256').update(restored).digest('hex')).toBe(
      '95dbac587d1557b3e0acb8f1bedf754b3856b9e49553872129dbb1621a40a397'
    );
  });
});
