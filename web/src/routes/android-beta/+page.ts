// Skip prerendering this route into the native export. It explains how to
// install the native Android app, so an HTML page of it inside that app is
// pointless, and anyone who already has the app is past every step on it.
//
// __IS_CAPACITOR__ is the single build-time web-vs-native signal
// (svelte.config.js); adapter-static's `strict: false` lets the native build
// skip the route the same way it skips /api, /admin, and /dev. The root
// +layout.ts turns prerendering on for everything, so this override is what
// keeps android-beta.html out of the static export.
//
// This drops the HTML, NOT the route. The page's JS chunk — Play Store links,
// group URL, support address — still ships in the native bundle, `entry/app.*`
// still lists the route, and `fallback: '200.html'` means a webview navigated
// to /android-beta would render it. Nothing in the app links there, so it is
// unreachable in practice, and this matches how /admin is already handled.
// Excluding it for real needs a build-time route exclusion under CAPACITOR=true,
// which no route has today.
export const prerender = !__IS_CAPACITOR__;
