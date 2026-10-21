// Documents the web build writes that no page links to and the app never shows: the admin console
// (ADR-0101). Each is `<name>.html`, served by pretty URL, with its own entry under
// src/pageDocument/; the worker leaves every path under it to the network. Kept apart from the route
// table (appPages.ts), which the drawing screen and the page entry bundle: only the build reads it.
export const UNLINKED_DOCUMENT_PATHS = {
  admin: '/admin',
} as const;

// Web-only pages outside the app's own navigation: nothing in the app links to one, so neither the
// native app nor the drawing screen's document routes it (the drawing screen treats its path as
// unknown). Unlike an unlinked document, each is written through the page pipeline
// (tools/migration/prerender-native-web-pages.mjs), with its own entry, and read without JavaScript.
export const WEB_DOCUMENT_PATHS = {
  design: '/design',
} as const;
export type WebDocument = keyof typeof WEB_DOCUMENT_PATHS;
