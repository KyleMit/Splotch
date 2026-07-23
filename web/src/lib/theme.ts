// Theme plumbing for the light / dark / system appearance setting.
//
// The convention (mirrored by the pre-paint stamp in app.html): <html> carries
// data-theme="light" or data-theme="dark" only when the parent explicitly chose
// one; "system" leaves the attribute off entirely, so the raw prerendered HTML
// plus the prefers-color-scheme blocks in app.css already render correctly with
// no JS. The dark token overrides in app.css key off both forms:
//   :root[data-theme='dark']                      — explicit choice
//   @media (prefers-color-scheme: dark)
//     :root:not([data-theme='light'])             — system says dark, no opt-out
//
// This module is the pure-helper side: restamping the attribute when the
// setting changes (applyTheme), resolving a preference to a concrete
// 'light'|'dark' given the current OS preference (resolveTheme), and writing an
// already-resolved theme onto <meta name="theme-color"> (updateThemeColorMeta).
// It deliberately owns NO media-query subscription: the single reactive source
// for the OS preference lives in lib/state/appearance.svelte.ts, which drives
// both resolvedTheme() and the theme-color meta from one subscription. Keeping
// matchMedia out of here also keeps module layering acyclic — appearance
// imports these helpers, so they must not reach back for appearance's state.

import { themes } from './design/tokens';

export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_DEFAULT: ThemePreference = 'system';

// Light keeps app.html's original white; dark is --app-bg, read from the
// design-token source of truth (ADR-0071) so it can never drift from the CSS.
const THEME_COLOR_LIGHT = '#ffffff';
const THEME_COLOR_DARK = themes.dark.appBg;

// The drawing paper per resolved theme, for the JS consumers that can't read
// the CSS token (canvas export fill, Notch Band eraser color). Derived from
// the same source as the --paper custom property.
export const PAPER_COLORS = { light: themes.light.paper, dark: themes.dark.paper } as const;

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): 'light' | 'dark' {
  if (preference === 'system') return systemDark ? 'dark' : 'light';
  return preference;
}

// Pure setter: write an already-resolved theme onto the theme-color meta (the
// browser/PWA chrome color). Callers resolve the theme; this only paints it, so
// the single reactive source in appearance.svelte.ts can drive it.
export function updateThemeColorMeta(resolved: 'light' | 'dark') {
  if (typeof document === 'undefined') return;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', resolved === 'dark' ? THEME_COLOR_DARK : THEME_COLOR_LIGHT);
}

export function applyTheme(preference: ThemePreference) {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  if (preference === 'system') el.removeAttribute('data-theme');
  else el.setAttribute('data-theme', preference);
}
