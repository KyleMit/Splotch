// Marks the next load as Start over's fresh launch; one tab's session, read once.
export const FRESH_START_KEY = 'splotch-candidate:fresh-start';

// Shipping's ErrorScreen restarts with location.assign('/'): a full load of the app root.
export function reloadApp(): boolean {
  try {
    sessionStorage.setItem(FRESH_START_KEY, '1');
  } catch {
    // Without session storage the reload still restarts, as shipping's does.
  }
  location.assign('/');
  return true;
}

export function takeFreshStart(): boolean {
  try {
    const fresh = sessionStorage.getItem(FRESH_START_KEY) !== null;
    sessionStorage.removeItem(FRESH_START_KEY);
    return fresh;
  } catch {
    return false;
  }
}
