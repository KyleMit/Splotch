import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SOUND_VOLUME_DEFAULT,
  SOUND_VOLUME_MAX,
  SOUND_VOLUME_MIN,
  isSoundVolume,
  legacySoundLevelVolume,
  soundVolumeGain,
} from '../../experiments/native-architecture/src/settings/soundVolume.ts';
import {
  DEFAULT_TOOLBAR_STYLE,
  TOOLBAR_STYLES,
  TOOLBAR_STYLE_OPTIONS,
} from '../../experiments/native-architecture/src/settings/toolbarStyle.ts';
import { DEFAULT_SOUND_SOURCE_SETTINGS } from '../../experiments/native-architecture/src/settings/soundSettingsCodec.ts';
import {
  deleteSoundPlays,
  drawingSoundPlays,
} from '../../experiments/native-architecture/src/audio/soundGates.ts';

// The shipping sources are Svelte components and rune modules React Native cannot import, so the
// Volume range, the sound sources and the Button style choice are read from source here.
const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const SETTINGS_STATE = source('web/src/lib/state/settings.svelte.ts');
const DRAWING_SOUND = source('web/src/lib/audio/drawingSound.ts');
const CLEAR_SOUND = source('web/src/lib/audio/clearSound.ts');
const APPEARANCE_SECTION = source('web/src/lib/components/settings/AppearanceSection.svelte');

function shippingConstant(name) {
  const match = new RegExp(`export const ${name} = (\\d+);`).exec(SETTINGS_STATE);
  expect(match, name).not.toBeNull();
  return Number(match[1]);
}

describe('Sound and Button style settings', () => {
  it('keeps the shipping Volume range and scales every sound by volume over the default', () => {
    expect([SOUND_VOLUME_MIN, SOUND_VOLUME_DEFAULT, SOUND_VOLUME_MAX]).toEqual([
      shippingConstant('SOUND_VOLUME_MIN'),
      shippingConstant('SOUND_VOLUME_DEFAULT'),
      shippingConstant('SOUND_VOLUME_MAX'),
    ]);
    expect(DRAWING_SOUND).toContain('return settingsState.soundVolume / SOUND_VOLUME_DEFAULT;');
    expect(soundVolumeGain(SOUND_VOLUME_DEFAULT)).toBe(1);
    expect(soundVolumeGain(SOUND_VOLUME_MAX)).toBe(2);
    for (const valid of [SOUND_VOLUME_MIN, 37, SOUND_VOLUME_MAX])
      expect(isSoundVolume(valid)).toBe(true);
    for (const invalid of [-1, 101, 50.5, '50', null])
      expect(isSoundVolume(invalid), String(invalid)).toBe(false);
  });

  it('migrates each old level to the volume that played at its gain', () => {
    // The gains the three-step level played at before the Volume slider.
    for (const [level, gain] of [
      ['quiet', 0.5],
      ['medium', 1],
      ['loud', 2],
    ])
      expect(soundVolumeGain(legacySoundLevelVolume(level)), level).toBe(gain);
    expect(() => legacySoundLevelVolume('LOUD')).toThrow('Sound level');
  });

  it('gates each sound source as shipping does', () => {
    expect(DRAWING_SOUND).toContain(
      'return settingsState.soundEnabled && settingsState.drawingSoundEnabled;'
    );
    expect(CLEAR_SOUND).toContain(
      'return settingsState.soundEnabled && settingsState.deleteSoundEnabled;'
    );
    for (const soundEnabled of [true, false])
      for (const drawingSoundEnabled of [true, false])
        for (const deleteSoundEnabled of [true, false]) {
          const choices = { soundEnabled, drawingSoundEnabled, deleteSoundEnabled };
          expect(drawingSoundPlays(choices)).toBe(soundEnabled && drawingSoundEnabled);
          expect(deleteSoundPlays(choices)).toBe(soundEnabled && deleteSoundEnabled);
        }
    for (const key of ['drawingSoundEnabled', 'deleteSoundEnabled'])
      expect(SETTINGS_STATE).toContain(`${key}: [STORAGE_KEYS.${key}, true]`);
    expect(DEFAULT_SOUND_SOURCE_SETTINGS).toEqual({
      soundVolume: shippingConstant('SOUND_VOLUME_DEFAULT'),
      drawingSoundEnabled: true,
      deleteSoundEnabled: true,
    });
  });

  it('copies the Button style choice from shipping', () => {
    const quoted = TOOLBAR_STYLES.map((style) => `'${style}'`).join(', ');
    expect(SETTINGS_STATE).toContain(`const TOOLBAR_STYLES = [${quoted}] as const;`);
    expect(SETTINGS_STATE).toContain(
      `const TOOLBAR_STYLE_DEFAULT: ToolbarStyle = '${DEFAULT_TOOLBAR_STYLE}';`
    );
    for (const style of TOOLBAR_STYLES) {
      const { label, icon } = TOOLBAR_STYLE_OPTIONS[style];
      expect(APPEARANCE_SECTION).toContain(
        `{ value: '${style}', label: '${label}', icon: '${icon}' }`
      );
    }
  });
});
