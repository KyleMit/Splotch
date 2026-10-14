// The paths the export serves the drawing screen at: the ones the service worker answers with the
// app shell (appShellRoute.ts's isAppShellNavigation). A host sends every other path the shell as
// its 404.html (tools/migration/build-native-web.mjs), and the shell shows shipping's not-found
// page there. native-web-not-found.test.mjs holds the list to the worker's route.
export const DRAWING_PATHS: readonly string[] = ['/', '/index.html'];

export function isDrawingPath() {
  return DRAWING_PATHS.includes(location.pathname);
}

export function setDocumentTitle(title: string) {
  document.title = title;
}
