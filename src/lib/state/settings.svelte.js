import { readBool, writeBool } from '../storage.js';

const SOUND_KEY = 'splotch-sound-enabled';
const SAVE_ON_DELETE_KEY = 'splotch-save-on-delete';
const SCREENSHOT_KEY = 'splotch-screenshot-enabled';
const UNDO_KEY = 'splotch-undo-button-enabled';
const STROKE_CTRL_KEY = 'splotch-stroke-width-control';
const COLORING_BOOK_KEY = 'splotch-coloring-book-enabled';

export const settings = $state({
  soundEnabled: readBool(SOUND_KEY, true),
  saveOnDeleteEnabled: readBool(SAVE_ON_DELETE_KEY, false),
  screenshotEnabled: readBool(SCREENSHOT_KEY, true),
  undoButtonEnabled: readBool(UNDO_KEY, true),
  strokeWidthControlEnabled: readBool(STROKE_CTRL_KEY, true),
  coloringBookEnabled: readBool(COLORING_BOOK_KEY, true)
});

export function setSound(v) { settings.soundEnabled = v; writeBool(SOUND_KEY, v); }
export function setSaveOnDelete(v) { settings.saveOnDeleteEnabled = v; writeBool(SAVE_ON_DELETE_KEY, v); }
export function setScreenshot(v) { settings.screenshotEnabled = v; writeBool(SCREENSHOT_KEY, v); }
export function setUndoButton(v) { settings.undoButtonEnabled = v; writeBool(UNDO_KEY, v); }
export function setStrokeWidthControl(v) { settings.strokeWidthControlEnabled = v; writeBool(STROKE_CTRL_KEY, v); }
export function setColoringBook(v) { settings.coloringBookEnabled = v; writeBool(COLORING_BOOK_KEY, v); }
