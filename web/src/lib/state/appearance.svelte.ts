// The RESOLVED theme ('light' | 'dark'), reactively: the parent's setting for
// explicit choices, the live OS preference in system mode. CSS never needs
// this (the tokens in app.css resolve themselves); it exists for the few JS
// consumers of the resolved value — the Notch Band's eraser/paper color and
// the canvas export's paper fill.
import { settings } from './settings.svelte';

const systemQuery =
  typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null;

const appearance = $state({ systemDark: systemQuery?.matches ?? false });

systemQuery?.addEventListener('change', (e) => {
  appearance.systemDark = e.matches;
});

export function resolvedTheme(): 'light' | 'dark' {
  if (settings.theme === 'system') return appearance.systemDark ? 'dark' : 'light';
  return settings.theme;
}
