// Shipping's ErrorScreen restarts with location.assign('/'): a full load of the app root.
export function reloadApp(): boolean {
  location.assign('/');
  return true;
}
