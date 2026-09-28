// Test anchor for the route that wears the immersive app-surface flag
// (data-app-surface, ADR-0076), not a production single source: nothing in the
// app imports it. app.html.test.ts holds app.html's pre-hydration boot literal
// to this value and checks that the route's +page.svelte owns the flag. The
// production '/' sites write the literal; app.html can't import, and
// pwa/appShellRoute.ts's matcher is serialized into the service worker.
export const DRAWING_ROUTE = '/';
