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
// This module only owns the runtime side: restamping the attribute when the
// setting changes, and keeping <meta name="theme-color"> (the browser/PWA
// chrome color) in step with the *resolved* theme, including live OS switches
// while in system mode.

export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_DEFAULT: ThemePreference = 'system';

// Light keeps app.html's original white; dark must match --app-bg in app.css.
const THEME_COLOR_LIGHT = '#ffffff';
const THEME_COLOR_DARK = '#17171d';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

let appliedPreference: ThemePreference | null = null;
let systemWatcherStarted = false;

function systemPrefersDark(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return preference;
}

function updateThemeColorMeta(preference: ThemePreference) {
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute(
    'content',
    resolveTheme(preference) === 'dark' ? THEME_COLOR_DARK : THEME_COLOR_LIGHT
  );
}

// In system mode the CSS media query recolors the app by itself, but the
// theme-color meta is plain markup — follow OS switches by hand.
function ensureSystemWatcher() {
  if (systemWatcherStarted || typeof matchMedia === 'undefined') return;
  systemWatcherStarted = true;
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (appliedPreference === 'system') updateThemeColorMeta('system');
  });
}

export function applyTheme(preference: ThemePreference) {
  if (typeof document === 'undefined') return;
  appliedPreference = preference;
  const el = document.documentElement;
  if (preference === 'system') el.removeAttribute('data-theme');
  else el.setAttribute('data-theme', preference);
  updateThemeColorMeta(preference);
  ensureSystemWatcher();
}
