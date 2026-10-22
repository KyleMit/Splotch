import type { PaperTheme } from '../drawing/theme';

export const APPEARANCE_PREFERENCES = ['light', 'dark', 'system'] as const;
export type AppearancePreference = (typeof APPEARANCE_PREFERENCES)[number];
export const DEFAULT_APPEARANCE: AppearancePreference = 'system';
export const APPEARANCE_LABELS: Record<AppearancePreference, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

export function isAppearancePreference(value: unknown): value is AppearancePreference {
  return APPEARANCE_PREFERENCES.some((preference) => preference === value);
}

export function resolveAppearance(
  preference: AppearancePreference,
  system: PaperTheme | null | undefined
): PaperTheme {
  return preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
}

// A quick toggle can only ask for a look, not a preference, so it writes the loosest preference
// that gives that look: System when the device already shows it, else a pin (shipping
// appearance.svelte.ts setResolvedTheme). A parent still on System is never pinned by one tap.
export function quickToggleAppearance(
  wanted: PaperTheme,
  system: PaperTheme | null | undefined
): AppearancePreference {
  return resolveAppearance('system', system) === wanted ? 'system' : wanted;
}
