import { DEFAULT_APPEARANCE, type AppearancePreference } from '../settings/appearance';

// The appearance the drawing screen paints while its settings load. The native apps have no
// document to stamp before the bundle runs, so they follow the system until the settings arrive.
export function bootAppearance(): AppearancePreference {
  return DEFAULT_APPEARANCE;
}
