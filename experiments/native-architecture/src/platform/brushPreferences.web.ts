import type { BrushPreferencesStorage } from '../settings/brushPreferences';
export const BRUSH_SETTINGS_KEY = 'splotch-candidate:brush-v1';
export const brushPreferencesStorage: BrushPreferencesStorage = {
  async read() {
    return localStorage.getItem(BRUSH_SETTINGS_KEY);
  },
  async write(snapshot) {
    localStorage.setItem(BRUSH_SETTINGS_KEY, snapshot);
    if (localStorage.getItem(BRUSH_SETTINGS_KEY) !== snapshot)
      throw new Error('Brush choices could not be verified.');
  },
};
