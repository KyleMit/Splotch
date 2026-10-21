// Documents the web build writes that no page links to and the app never shows: the admin console
// (ADR-0101). Each is `<name>.html`, served by pretty URL, with its own entry under
// src/pageDocument/; the worker leaves every path under it to the network. Kept apart from the route
// table (appPages.ts), which the drawing screen and the page entry bundle: only the build reads it.
export const UNLINKED_DOCUMENT_PATHS = {
  admin: '/admin',
} as const;
