import { STORAGE_KEYS } from '../lib/storageKeys';
import { createSettingsSessions } from '../settings/settingsSessions';

export const settingsSessions = createSettingsSessions({
  read: async () => localStorage.getItem(STORAGE_KEYS.settingsActivitySessionCount),
  write: async (count) => localStorage.setItem(STORAGE_KEYS.settingsActivitySessionCount, count),
});
