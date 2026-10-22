// The <html> attribute naming the page a page document was written for: the build writes it
// (tools/migration/prerender-native-web-pages.mjs) and the page entry reads it (appDocument.ts).
// The drawing screen's document carries none.
export const APP_DOCUMENT_ATTRIBUTE = 'data-app-document';
// The name the not-found document (the host's 404.html) carries in that attribute.
export const NOT_FOUND_DOCUMENT = 'notFound';
