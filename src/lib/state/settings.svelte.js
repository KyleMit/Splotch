import { readBool, writeBool, readString, writeString } from '../storage.js';

const SOUND_KEY = 'splotch-sound-enabled';
const SAVE_ON_DELETE_KEY = 'splotch-save-on-delete';
// Per-control "pin" flags. A pinned control stays visible while the drawer is
// closed; unpinned controls live behind the chevron. Default off (unpinned).
const STROKE_PIN_KEY = 'splotch-pin-stroke-width';
const ERASER_PIN_KEY = 'splotch-pin-eraser';
const COLORING_BOOK_PIN_KEY = 'splotch-pin-coloring-book';
const SCREENSHOT_PIN_KEY = 'splotch-pin-screenshot';
const UNDO_PIN_KEY = 'splotch-pin-undo';
const AI_IMAGE_KEY = 'splotch-ai-image-enabled';
const AI_CUSTOMIZATION_KEY = 'splotch-ai-customization-enabled';
const AI_ACCESS_TOKEN_KEY = 'splotch-ai-access-token';
const AI_ACCESS_TOKEN_PARAM = 'ai_access_token';
const ADVANCED_CONTROLS_KEY = 'splotch-advanced-controls';
const DRAWER_OPEN_KEY = 'splotch-drawer-open';

export const settings = $state({
  soundEnabled: readBool(SOUND_KEY, true),
  saveOnDeleteEnabled: readBool(SAVE_ON_DELETE_KEY, false),
  strokeWidthPinned: readBool(STROKE_PIN_KEY, false),
  eraserPinned: readBool(ERASER_PIN_KEY, false),
  coloringBookPinned: readBool(COLORING_BOOK_PIN_KEY, false),
  screenshotPinned: readBool(SCREENSHOT_PIN_KEY, false),
  undoPinned: readBool(UNDO_PIN_KEY, false),
  aiImageEnabled: readBool(AI_IMAGE_KEY, true),
  aiCustomizationEnabled: readBool(AI_CUSTOMIZATION_KEY, true),
  aiAccessToken: readString(AI_ACCESS_TOKEN_KEY, ''),
  // Master switch for the collapsible action drawer. When on, the chevron
  // toggle shows and the drawer can be opened/closed; when off, the controls
  // are always visible and the chevron is hidden.
  advancedControlsEnabled: readBool(ADVANCED_CONTROLS_KEY, true),
  // Remembered open/closed state of the drawer (defaults closed).
  drawerOpen: readBool(DRAWER_OPEN_KEY, false)
});

export function setSound(v) { settings.soundEnabled = v; writeBool(SOUND_KEY, v); }
export function setSaveOnDelete(v) { settings.saveOnDeleteEnabled = v; writeBool(SAVE_ON_DELETE_KEY, v); }
export function setStrokeWidthPinned(v) { settings.strokeWidthPinned = v; writeBool(STROKE_PIN_KEY, v); }
export function setEraserPinned(v) { settings.eraserPinned = v; writeBool(ERASER_PIN_KEY, v); }
export function setColoringBookPinned(v) { settings.coloringBookPinned = v; writeBool(COLORING_BOOK_PIN_KEY, v); }
export function setScreenshotPinned(v) { settings.screenshotPinned = v; writeBool(SCREENSHOT_PIN_KEY, v); }
export function setUndoPinned(v) { settings.undoPinned = v; writeBool(UNDO_PIN_KEY, v); }
export function setAiImage(v) { settings.aiImageEnabled = v; writeBool(AI_IMAGE_KEY, v); }
export function setAiCustomization(v) { settings.aiCustomizationEnabled = v; writeBool(AI_CUSTOMIZATION_KEY, v); }
export function setAiAccessToken(v) { settings.aiAccessToken = v; writeString(AI_ACCESS_TOKEN_KEY, v); }
export function setAdvancedControls(v) { settings.advancedControlsEnabled = v; writeBool(ADVANCED_CONTROLS_KEY, v); }
export function setDrawerOpen(v) { settings.drawerOpen = v; writeBool(DRAWER_OPEN_KEY, v); }

export function captureAiAccessTokenFromUrl() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const token = url.searchParams.get(AI_ACCESS_TOKEN_PARAM);
  if (!token) return;
  setAiAccessToken(token);
  window.history.replaceState({}, '', '/');
}
