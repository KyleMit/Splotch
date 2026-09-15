// The RESOLVED theme ('light' | 'dark'), reactively: the parent's setting for
// explicit choices, the live OS preference in system mode. CSS never needs
// this (the tokens in app.css resolve themselves); it exists for the few JS
// consumers of the resolved value — the active Black swatch's ink, the Notch
// Band's eraser/paper color, and the canvas export's paper fill.
//
// This module is the SINGLE owner of the prefers-color-scheme subscription and
// the resolution rule: one media query feeds `systemDark`, and resolveTheme()
// (from theme.ts) turns preference + systemDark into the concrete theme. The
// theme-dependent JS state follows the same source — the effect install() roots
// reads resolvedTheme(), repaints the theme-color meta, and syncs the selected
// Black swatch's ink, so both an OS switch (systemDark) and an explicit setting
// change (settingsState.theme) update them from one reactive path.
import { untrack } from 'svelte';
import { settingsState, type SettingsState } from './settings.svelte';
import { colorsState, type ColorsState } from './colors.svelte';
import { resolveTheme, type ResolvedTheme, updateThemeColorMeta } from '../theme';

export interface AppearanceState {
  resolvedTheme(): ResolvedTheme;
  setResolvedTheme(wanted: ResolvedTheme): void;
  // Subscribes to the OS preference and roots the effect that keeps the
  // theme-color meta and the Black swatch's ink on the resolved theme.
  install(): void;
  dispose(): void;
}

export function createAppearance(settings: SettingsState, colors: ColorsState): AppearanceState {
  const appearance = $state({ systemDark: false });

  let systemQuery: MediaQueryList | null = null;
  let stopEffects: (() => void) | null = null;

  const onSystemChange = (e: MediaQueryListEvent) => {
    appearance.systemDark = e.matches;
  };

  function resolvedTheme(): ResolvedTheme {
    return resolveTheme(settings.theme, appearance.systemDark);
  }

  return {
    resolvedTheme,
    // A quick toggle (no three-way UI to name 'system' explicitly) can only
    // request an appearance, not a preference — so it writes back the LOOSEST
    // preference that still resolves to the requested appearance: 'system' when
    // the OS already renders that appearance, otherwise an explicit pin. This is
    // what keeps a parent who never touched theming (still on the 'system'
    // default) from getting pinned by one tap. The same rule can also overwrite
    // an explicit pin that happens to match the OS: e.g. a light-OS parent who
    // pinned 'light' explicitly, then taps Night Mode on and back off, lands on
    // 'system' rather than their original explicit pin — an accepted trade since
    // a quick toggle has no way to tell "explicit light" from "system resolving
    // to light" apart, and 'system' still renders the appearance they asked for.
    setResolvedTheme(wanted) {
      settings.setTheme(
        resolveTheme('system', appearance.systemDark) === wanted ? 'system' : wanted
      );
    },
    install() {
      if (systemQuery) return;
      // eslint-disable-next-line no-restricted-syntax -- predates the constant-per-query convention; see the follow-up to migrate it
      systemQuery = matchMedia('(prefers-color-scheme: dark)');
      appearance.systemDark = systemQuery.matches;
      systemQuery.addEventListener('change', onSystemChange);
      stopEffects = $effect.root(() => {
        $effect(() => {
          const theme = resolvedTheme();
          updateThemeColorMeta(theme);
          // The theme dependency is captured above; the active swatch read inside
          // this command must not make palette selection rerun the effect.
          untrack(() => colors.syncInkToTheme(theme === 'dark'));
        });
      });
    },
    dispose() {
      systemQuery?.removeEventListener('change', onSystemChange);
      systemQuery = null;
      stopEffects?.();
      stopEffects = null;
    },
  };
}

export const appearanceState = createAppearance(settingsState, colorsState);

export const { resolvedTheme, setResolvedTheme } = appearanceState;

// Installed at module load (not from a component) so the resolved theme is live
// before the first component renders. Client-only: matchMedia and the meta are
// absent server-side, and effects never run during SSR anyway.
if (typeof matchMedia !== 'undefined' && typeof document !== 'undefined') {
  appearanceState.install();
}
