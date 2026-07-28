// Web-only. This page exists to tell people how to install the native Android
// app, so shipping it inside the native bundle is pointless — and an iOS build
// carrying Google Play links is worse than pointless at review time. Anyone who
// already has the app installed is past every step on the page.
//
// __IS_CAPACITOR__ is the single build-time web-vs-native signal
// (svelte.config.js); adapter-static's `strict: false` lets the native build
// skip this route the same way it skips /api, /admin, and /dev. The root
// +layout.ts turns prerendering on for everything, so this override is what
// keeps the route out of the static export.
export const prerender = !__IS_CAPACITOR__;
