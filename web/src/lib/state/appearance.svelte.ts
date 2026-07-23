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
import { settings } from './settings.svelte';
import { resolveTheme, updateThemeColorMeta } from '../theme';

const systemQuery =
  typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null;

const appearance = $state({ systemDark: systemQuery?.matches ?? false });

systemQuery?.addEventListener('change', (e) => {
  appearance.systemDark = e.matches;
});

export function resolvedTheme(): 'light' | 'dark' {
  return resolveTheme(settings.theme, appearance.systemDark);
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
