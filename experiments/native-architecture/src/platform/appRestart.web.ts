// Marks the load after Start over as a fresh launch. It rides in the URL rather than in storage,
// which a browser may refuse, so a restart is fresh whenever it happens at all. It is a query on
// the app root: the drawing route (appPath.web.ts) and the service worker's app-shell route both
// match on the path alone, and the name differs from the invite and cache-bust parameters
// (native-web-not-found.test.mjs holds all three apart).
export const FRESH_START_PARAM = 'fresh-start';

// Shipping's ErrorScreen restarts with location.assign('/'): a full load of the app root.
export function reloadApp(): boolean {
  location.assign(`/?${FRESH_START_PARAM}=1`);
  return true;
}

// Reads the mark once and takes it out of the address, keeping any other query (an invite) and the
// history entry's state, so a later reload or a bookmark is an ordinary launch.
export function takeFreshStart(): boolean {
  const url = new URL(location.href);
  if (!url.searchParams.has(FRESH_START_PARAM)) return false;
  url.searchParams.delete(FRESH_START_PARAM);
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  return true;
}
