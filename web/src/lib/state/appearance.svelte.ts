// The RESOLVED theme ('light' | 'dark'), reactively: the parent's setting for
// explicit choices, the live OS preference in system mode. CSS never needs
// this (the tokens in app.css resolve themselves); it exists for the few JS
// consumers of the resolved value — the Notch Band's eraser/paper color and
// the canvas export's paper fill.
//
// This module is the SINGLE owner of the prefers-color-scheme subscription and
// the resolution rule: one media query feeds `systemDark`, and resolveTheme()
// (from theme.ts) turns preference + systemDark into the concrete theme. The
// theme-color meta follows the same source — an effect below reads
// resolvedTheme() and repaints the meta, so both an OS switch (systemDark) and
// an explicit setting change (settings.theme) update it from one reactive path,
// with no separate matchMedia listener for the meta.
import { settings, setTheme } from './settings.svelte';
import { resolveTheme, type ResolvedTheme, updateThemeColorMeta } from '../theme';

const systemQuery =
  typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null;

const appearance = $state({ systemDark: systemQuery?.matches ?? false });

systemQuery?.addEventListener('change', (e) => {
  appearance.systemDark = e.matches;
});

export function resolvedTheme(): ResolvedTheme {
  return resolveTheme(settings.theme, appearance.systemDark);
}

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
export function setResolvedTheme(wanted: ResolvedTheme): void {
  setTheme(resolveTheme('system', appearance.systemDark) === wanted ? 'system' : wanted);
}

// Keep <meta name="theme-color"> on the resolved theme. A detached effect root
// (no component host) runs this at module load and re-runs it whenever the
// setting or the OS preference changes — replacing the old per-module watcher +
// the applyTheme() meta write. Client-only: matchMedia and the meta are absent
// server-side, and effects never run during SSR anyway.
if (typeof document !== 'undefined') {
  $effect.root(() => {
    $effect(() => {
      updateThemeColorMeta(resolvedTheme());
    });
  });
}
