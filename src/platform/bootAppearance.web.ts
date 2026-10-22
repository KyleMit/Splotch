import {
  DEFAULT_APPEARANCE,
  isAppearancePreference,
  type AppearancePreference,
} from '../settings/appearance';
import { BOOT_THEME_ATTRIBUTE } from './bootTheme';
import { prerenderInputs } from './prerenderInputs';

// The appearance the web shell's boot script stamped from the saved settings before the bundle
// loaded (tools/migration/build-native-web.mjs), so the drawing screen's first frame paints the
// document's theme rather than flashing the system one while its settings load.
export function bootAppearance(): AppearancePreference {
  if (typeof window === 'undefined') return prerenderInputs.appearance;
  const stamped = document.documentElement.getAttribute(BOOT_THEME_ATTRIBUTE);
  return isAppearancePreference(stamped) ? stamped : DEFAULT_APPEARANCE;
}
