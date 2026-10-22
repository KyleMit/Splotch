import { describe, expect, it } from 'vitest';
import { DEFAULT_SOUND_SOURCE_SETTINGS } from '../../experiments/native-architecture/src/settings/soundSettingsCodec.ts';
import {
  SOUND_VOLUME_DEFAULT,
  SOUND_VOLUME_MAX,
  SOUND_VOLUME_MIN,
  isSoundVolume,
  legacySoundLevelVolume,
  soundVolumeGain,
} from '../../experiments/native-architecture/src/settings/soundVolume.ts';

import {
  deleteSoundPlays,
  drawingSoundPlays,
} from '../../experiments/native-architecture/src/audio/soundGates.ts';

describe('Sound and Button style settings', () => {
  it('keeps the shipping Volume range and scales every sound by volume over the default', () => {
    expect([SOUND_VOLUME_MIN, SOUND_VOLUME_DEFAULT, SOUND_VOLUME_MAX]).toEqual([0, 50, 100]);
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
    expect(DEFAULT_SOUND_SOURCE_SETTINGS).toEqual({
      soundVolume: 50,
      drawingSoundEnabled: true,
      deleteSoundEnabled: true,
    });
    for (const soundEnabled of [true, false])
      for (const drawingSoundEnabled of [true, false])
        for (const deleteSoundEnabled of [true, false]) {
          const choices = { soundEnabled, drawingSoundEnabled, deleteSoundEnabled };
          expect(drawingSoundPlays(choices)).toBe(soundEnabled && drawingSoundEnabled);
          expect(deleteSoundPlays(choices)).toBe(soundEnabled && deleteSoundEnabled);
        }
  });
});
