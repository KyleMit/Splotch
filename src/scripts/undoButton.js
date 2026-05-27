// Persisted "show the undo button in the actions panel" preference.
// Defaults to enabled so the button remains visible for existing users.

const UNDO_BUTTON_KEY = 'splotch-undo-button-enabled';

const stored = localStorage.getItem(UNDO_BUTTON_KEY);
let undoButtonEnabled = stored === null ? true : stored === 'true';

export function isUndoButtonEnabled() {
  return undoButtonEnabled;
}

export function setUndoButtonEnabled(enabled) {
  undoButtonEnabled = enabled;
  localStorage.setItem(UNDO_BUTTON_KEY, enabled.toString());
}
