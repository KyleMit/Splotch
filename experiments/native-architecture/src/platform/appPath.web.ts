// The paths the export serves the drawing screen at: the ones the service worker answers with the
// app shell (appShellRoute.ts's isAppShellNavigation). A host sends every other path the shell as
// its 404.html (tools/migration/build-native-web.mjs), and the shell shows shipping's not-found
// page there. native-web-not-found.test.mjs holds the list to the worker's route.
import { DRAWING_PATHS } from './appSurfacePolicy';
export { DRAWING_PATHS } from './appSurfacePolicy';

export function isDrawingPath() {
  return DRAWING_PATHS.includes(location.pathname);
}

// Answers the title it replaced, so a screen can hand it back.
export function setDocumentTitle(title: string) {
  const previous = document.title;
  document.title = title;
  return previous;
}
