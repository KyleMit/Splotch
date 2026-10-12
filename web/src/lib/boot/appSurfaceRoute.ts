// The drawing route: the one that wears the immersive app-surface flag
// (data-app-surface, ADR-0076), and where the standalone pages' back link and
// wordmark lead. app.html.test.ts checks that the route's +page.svelte owns the
// flag. Two sites can't import this and restate the literal: app.html's boot
// script is vanilla JS in a template (app.html.test.ts holds it to this value),
// and pwa/appShellRoute.ts's matcher is serialized into the service worker.
export const DRAWING_ROUTE = '/';
