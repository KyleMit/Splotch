import { readBool, writeBool, readString, writeString } from '../storage.js';

const SOUND_KEY = 'splotch-sound-enabled';
const SAVE_ON_DELETE_KEY = 'splotch-save-on-delete';
const SCREENSHOT_KEY = 'splotch-screenshot-enabled';
const UNDO_KEY = 'splotch-undo-button-enabled';
const STROKE_CTRL_KEY = 'splotch-stroke-width-control';
const ERASER_KEY = 'splotch-eraser-enabled';
const COLORING_BOOK_KEY = 'splotch-coloring-book-enabled';
const AI_IMAGE_KEY = 'splotch-ai-image-enabled';
const AI_CUSTOMIZATION_KEY = 'splotch-ai-customization-enabled';
const AI_ACCESS_TOKEN_KEY = 'splotch-ai-access-token';
const AI_ACCESS_TOKEN_PARAM = 'ai_access_token';

export const settings = $state({
  soundEnabled: readBool(SOUND_KEY, true),
  saveOnDeleteEnabled: readBool(SAVE_ON_DELETE_KEY, false),
  screenshotEnabled: readBool(SCREENSHOT_KEY, true),
  undoButtonEnabled: readBool(UNDO_KEY, true),
  strokeWidthControlEnabled: readBool(STROKE_CTRL_KEY, true),
  eraserEnabled: readBool(ERASER_KEY, true),
  coloringBookEnabled: readBool(COLORING_BOOK_KEY, true),
  aiImageEnabled: readBool(AI_IMAGE_KEY, true),
  aiCustomizationEnabled: readBool(AI_CUSTOMIZATION_KEY, true),
  aiAccessToken: readString(AI_ACCESS_TOKEN_KEY, '')
});

export function setSound(v) { settings.soundEnabled = v; writeBool(SOUND_KEY, v); }
export function setSaveOnDelete(v) { settings.saveOnDeleteEnabled = v; writeBool(SAVE_ON_DELETE_KEY, v); }
export function setScreenshot(v) { settings.screenshotEnabled = v; writeBool(SCREENSHOT_KEY, v); }
export function setUndoButton(v) { settings.undoButtonEnabled = v; writeBool(UNDO_KEY, v); }
export function setStrokeWidthControl(v) { settings.strokeWidthControlEnabled = v; writeBool(STROKE_CTRL_KEY, v); }
export function setEraser(v) { settings.eraserEnabled = v; writeBool(ERASER_KEY, v); }
export function setColoringBook(v) { settings.coloringBookEnabled = v; writeBool(COLORING_BOOK_KEY, v); }
export function setAiImage(v) { settings.aiImageEnabled = v; writeBool(AI_IMAGE_KEY, v); }
export function setAiCustomization(v) { settings.aiCustomizationEnabled = v; writeBool(AI_CUSTOMIZATION_KEY, v); }
export function setAiAccessToken(v) { settings.aiAccessToken = v; writeString(AI_ACCESS_TOKEN_KEY, v); }

export function captureAiAccessTokenFromUrl() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const token = url.searchParams.get(AI_ACCESS_TOKEN_PARAM);
  if (!token) return;
  setAiAccessToken(token);
  window.history.replaceState({}, '', '/');
}
