// Single source of truth for which route wears the immersive app-surface
// flag (data-app-surface, ADR-0076). app.html's pre-hydration boot script
// can't import this (it's vanilla JS in a template file) — its literal is
// checked against this constant by app.html.test.ts instead.
export const DRAWING_ROUTE = '/';
