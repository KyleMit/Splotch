import { DEFAULT_APPEARANCE, type AppearancePreference } from '../settings/appearance';
import { parseSoundSettings } from '../settings/soundSettingsCodec';
import { soundSettingsStorage } from './soundSettings';

export function bootAppearance(): AppearancePreference {
  try {
    const saved = soundSettingsStorage.readSync();
    return saved === null ? DEFAULT_APPEARANCE : parseSoundSettings(saved).appearance;
  } catch {
    return DEFAULT_APPEARANCE;
  }
}
