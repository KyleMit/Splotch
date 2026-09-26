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
// It deliberately owns NO media-query subscription: the reactive source for the
// OS preference lives in lib/state/appearance.svelte.ts, which drives both
// resolvedTheme() and the theme-color meta from one subscription. Keeping
// matchMedia out of here also keeps module layering acyclic — appearance
// imports these helpers, so they must not reach back for appearance's state.
// The drawing route and /design import appearance. The pre-paint script in
// app.html also resolves the theme before hydration and follows the OS on
// routes without reactive appearance state.

// The extension is explicit because Node tooling loads this module directly
// under --experimental-strip-types (gen-style-covers.mjs), the same reason
// design/tokens.ts names '../fonts.ts'.
import { prefersReducedMotion } from './platform/reducedMotion.ts';

export const RESOLVED_THEMES = ['light', 'dark'] as const;

export type ResolvedTheme = (typeof RESOLVED_THEMES)[number];
export type ThemePreference = ResolvedTheme | 'system';

export const THEME_DEFAULT: ThemePreference = 'system';

// The one spelling of the OS query for JS call sites: appearance.svelte.ts
// subscribes to it, and app.html's boot script re-types it —
// app.html.themeColor.test.ts fails on divergence. A typo evaluates to false
// and pins the app to light.
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

// Light keeps app.html's original white; dark is --app-bg.
//
// Written literally rather than read from design/tokens.ts, which is the
// bundle-boundary carve-out in CLAUDE.md: `themes` is one object literal
// holding ~45 tokens per theme, so importing it for a single value hands
// Rollup an edge that drags all ~90 onto the startup path — including
// CSS-only ones no JavaScript ever reads. theme.ts is on that path via
// state/appearance.svelte.ts. theme.tokens.test.ts fails if these drift from
// the tokens, the same way app.html.themeColor.test.ts guards app.html's
// copies.
export const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: '#ffffff',
  dark: '#17171d',
};

// The drawing paper per resolved theme, for the JS consumers that can't read
// the CSS token (canvas export fill, Notch Band eraser color). The same
// --paper values, written literally for the reason above and guarded by the
// same spec.
export const PAPER_COLORS = { light: '#fcfbf8', dark: '#211f29' } as const;

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemDark ? 'dark' : 'light';
  return preference;
}

// The tag lives in app.html's static head, so its boot script re-types this
// selector and the two colors below; app.html.themeColor.test.ts fails on
// divergence.
export const THEME_COLOR_META_SELECTOR = 'meta[name="theme-color"]';

// Appearance sets the resolved-theme baseline; NotchBand intentionally
// overrides it with the active drawing or paper color for the status-bar surface.
export function setThemeColorMeta(color: string) {
  if (typeof document === 'undefined') return;
  const meta = document.querySelector(THEME_COLOR_META_SELECTOR);
  if (meta && meta.getAttribute('content') !== color) meta.setAttribute('content', color);
}

export function updateThemeColorMeta(resolved: ResolvedTheme) {
  setThemeColorMeta(THEME_COLORS[resolved]);
}

// A theme change repaints every surface at once, so an open modal card —
// where the parent is looking when Appearance or Night Mode flips it — fades a
// veil of its previous surface color off the new theme instead of cutting.
// Opacity on one small layer is compositor work only. A whole-screen view
// transition read the same but cost frames on both release-gate engines: its
// snapshot capture held Android Chrome's first frame to 50 ms and its teardown
// put a 31–37 ms frame at the end of the fade on the iPad (ADR-0171, #2225).
// The room behind the card stays under its scrim and swaps at once. A restamp
// that changes nothing (hydration, the boot fallback) veils nothing, so first
// paint stays instant, and reduced motion swaps at once.
export const THEME_VEIL_CLASS = 'theme-veil';
const THEME_VEIL_HOSTS = '.modal-shell[open]';
// ADR-0171's crossfade length: long enough to read as the room dimming rather
// than a cut.
const THEME_VEIL_FADE_MS = 320;

export function applyTheme(preference: ThemePreference) {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  const wanted = preference === 'system' ? null : preference;
  const current = el.getAttribute('data-theme');
  if (current === wanted) return;
  const hosts =
    prefersReducedMotion() || !appearanceChanges(current, wanted)
      ? []
      : Array.from(document.querySelectorAll<HTMLElement>(THEME_VEIL_HOSTS));
  const shownSurfaces = hosts.map(shownSurface);
  if (wanted === null) el.removeAttribute('data-theme');
  else el.setAttribute('data-theme', wanted);
  hosts.forEach((host, i) => fadeVeil(host, shownSurfaces[i]));
}

// Light to System on a light OS restamps the attribute without changing a
// pixel, so it veils nothing.
function appearanceChanges(current: string | null, wanted: ResolvedTheme | null): boolean {
  if (current !== null && wanted !== null) return true;
  const systemDark = matchMedia(DARK_SCHEME_QUERY).matches;
  const resolve = (stamp: string | null) =>
    stamp === 'light' || stamp === 'dark' ? stamp : resolveTheme('system', systemDark);
  return resolve(current) !== resolve(wanted);
}

// What the card shows now: its surface or, mid-fade, that surface seen through
// the veil still fading off it. A reversal then restarts from where the card
// stands rather than from the veil's own color.
function shownSurface(host: HTMLElement): string {
  const surface = getComputedStyle(host).backgroundColor;
  const veil = host.querySelector<HTMLElement>(`:scope > .${THEME_VEIL_CLASS}`);
  if (!veil) return surface;
  const veilStyle = getComputedStyle(veil);
  return blendOver(veilStyle.backgroundColor, surface, Number(veilStyle.opacity)) ?? surface;
}

const RGB_CHANNELS = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/;

function blendOver(top: string, bottom: string, alpha: number): string | null {
  const over = RGB_CHANNELS.exec(top);
  const under = RGB_CHANNELS.exec(bottom);
  if (!over || !under || !Number.isFinite(alpha)) return null;
  const channel = (i: number) =>
    Math.round(Number(over[i]) * alpha + Number(under[i]) * (1 - alpha));
  return `rgb(${channel(1)}, ${channel(2)}, ${channel(3)})`;
}

function fadeVeil(host: HTMLElement, color: string) {
  for (const stale of host.querySelectorAll(`:scope > .${THEME_VEIL_CLASS}`)) stale.remove();
  const veil = document.createElement('div');
  veil.className = THEME_VEIL_CLASS;
  veil.style.backgroundColor = color;
  host.append(veil);
  const retire = () => veil.remove();
  veil
    .animate({ opacity: [1, 0] }, { duration: THEME_VEIL_FADE_MS, easing: 'ease' })
    .finished.then(retire, retire);
}
