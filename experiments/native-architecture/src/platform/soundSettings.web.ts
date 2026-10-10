import type { SoundSettingsStorage } from '../settings/soundSettings';
const SOUND_SETTINGS_KEY = 'splotch-candidate:sound-v1';

export const soundSettingsStorage: SoundSettingsStorage = {
  async read() {
    return localStorage.getItem(SOUND_SETTINGS_KEY);
  },
  async write(snapshot) {
    localStorage.setItem(SOUND_SETTINGS_KEY, snapshot);
    if (localStorage.getItem(SOUND_SETTINGS_KEY) !== snapshot)
      throw new Error('Sound settings could not be verified.');
  },
};
