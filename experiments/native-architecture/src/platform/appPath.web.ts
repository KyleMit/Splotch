import { APP_PAGE_PATHS, appPageAt, type AppPage } from '../information/appPages';
// The paths the export serves the drawing screen at: the ones the service worker answers with the
// app shell (appShellRoute.ts's isAppShellNavigation). A host sends every other path the shell as
// its 404.html (tools/migration/build-native-web.mjs), and the shell shows shipping's not-found
// page there. native-web-not-found.test.mjs holds the list to the worker's route.
export const DRAWING_PATHS: readonly string[] = ['/', '/index.html'];

export function isDrawingPath() {
  return DRAWING_PATHS.includes(location.pathname);
}

// Answers the title it replaced, so a screen can hand it back.
export function setDocumentTitle(title: string) {
  const previous = document.title;
  document.title = title;
  return previous;
}

export function createBrowserAppPages() {
  const listeners = new Set<() => void>();
  const publish = () => {
    for (const listener of listeners) listener();
  };
  return {
    current: () => appPageAt(location.pathname),
    subscribe(listener: () => void) {
      if (listeners.size === 0) window.addEventListener('popstate', publish);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) window.removeEventListener('popstate', publish);
      };
    },
    open(page: AppPage) {
      if (appPageAt(location.pathname) === page) return;
      history.pushState(null, '', APP_PAGE_PATHS[page]);
      publish();
    },
  };
}
const pages = createBrowserAppPages();
export const currentAppPage = pages.current;
export const subscribeAppPage = pages.subscribe;
export const openAppPage = pages.open;
