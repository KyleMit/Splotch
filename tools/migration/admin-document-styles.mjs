// The admin console's style sources. The export's strict.css leaves them out (postcss.config.mjs),
// so the drawing screen's inline first-paint CSS carries none of the console's rules; the build
// compiles them, with the tokens they read, into the admin document alone
// (tools/migration/prerender-native-web-admin.mjs).
export const ADMIN_DOCUMENT_SOURCES = 'src/pageDocument/admin/**/*.{ts,tsx}';
export const ADMIN_STYLE_INCLUDE = [ADMIN_DOCUMENT_SOURCES, 'src/rsdDrawing/tokens.css.ts'];
