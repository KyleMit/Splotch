// The styleguide's style sources. The export's strict.css, which every document inlines, leaves
// them out (postcss.config.mjs); the build compiles them for the styleguide's document alone
// (tools/migration/prerender-native-web-pages.mjs), which inlines strict.css beside them.
export const DESIGN_DOCUMENT_STYLE_SOURCES = 'src/pageDocument/design/**/*.{ts,tsx}';
