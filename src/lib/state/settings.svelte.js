import { readBool, writeBool, readString, writeString, removeKey } from '../storage.js';
import { saveApiKey, loadApiKey, clearApiKey, requestPersistentStorage } from '../secureStorage.js';

const SOUND_KEY = 'splotch-sound-enabled';
const SAVE_ON_DELETE_KEY = 'splotch-save-on-delete';
const SCREENSHOT_KEY = 'splotch-screenshot-enabled';
const UNDO_KEY = 'splotch-undo-button-enabled';
const STROKE_CTRL_KEY = 'splotch-stroke-width-control';
const ERASER_KEY = 'splotch-eraser-enabled';
const COLORING_BOOK_KEY = 'splotch-coloring-book-enabled';
const AI_IMAGE_KEY = 'splotch-ai-image-enabled';
const AI_CUSTOMIZATION_KEY = 'splotch-ai-customization-enabled';
const AUTO_SAVE_AI_KEY = 'splotch-auto-save-ai';
const AI_ACCESS_TOKEN_KEY = 'splotch-ai-access-token';
const AI_ACCESS_TOKEN_PARAM = 'ai_access_token';
// The parent's own Gemini API key (BYOK). Stored only on this device and sent
// with each AI request so the server bills the parent's Google account instead
// of ours. Either this OR aiAccessToken being set unlocks the AI features.
// The key itself is no longer kept here in plaintext — it lives in secure
// storage (Keychain/Keystore on native, an encrypted IndexedDB payload on the
// web). This constant only names the legacy localStorage slot so hydrateApiKey
// can migrate and scrub any key written by an earlier build.
const AI_USER_API_KEY = 'splotch-ai-user-api-key';
const ADVANCED_CONTROLS_KEY = 'splotch-advanced-controls';
const DRAWER_OPEN_KEY = 'splotch-drawer-open';
const ADMIN_LINK_VISIBLE_KEY = 'splotch-admin-link-visible';

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
  // When on, a finished AI image is dropped straight into the photo gallery
  // (a download on the web) along with the child's drawing — no Download button,
  // and the freed space goes to a larger preview.
  autoSaveAiEnabled: readBool(AUTO_SAVE_AI_KEY, false),
  aiAccessToken: readString(AI_ACCESS_TOKEN_KEY, ''),
  // Parent-supplied Gemini API key (BYOK). Held in memory only; hydrated from
  // secure storage on boot by hydrateApiKey(). Empty until then / unless set.
  aiUserApiKey: '',
  // Master switch for the collapsible action drawer. When on, the chevron
  // toggle shows and the drawer can be opened/closed; when off, the controls
  // are always visible and the chevron is hidden.
  advancedControlsEnabled: readBool(ADVANCED_CONTROLS_KEY, true),
  // Remembered open/closed state of the drawer (defaults closed).
  drawerOpen: readBool(DRAWER_OPEN_KEY, false),
  // Whether the hidden link to the /admin console is shown in the About tab.
  // Unlocked by the version-tap easter egg and kept visible for anyone who has
  // an admin_session cookie; reset to hidden on logout / failed login / leaving
  // the admin page without signing in (see /admin and AboutTab).
  adminLinkVisible: readBool(ADMIN_LINK_VISIBLE_KEY, false)
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
export function setAutoSaveAi(v) { settings.autoSaveAiEnabled = v; writeBool(AUTO_SAVE_AI_KEY, v); }
export function setAiAccessToken(v) { settings.aiAccessToken = v; writeString(AI_ACCESS_TOKEN_KEY, v); }
// Update the live value immediately (so the UI reacts at once), then persist to
// secure storage. Returns the persistence promise so callers can await it.
export function setAiUserApiKey(v) {
  settings.aiUserApiKey = v;
  return v ? saveApiKey(v) : clearApiKey();
}
export function setAdvancedControls(v) { settings.advancedControlsEnabled = v; writeBool(ADVANCED_CONTROLS_KEY, v); }
export function setDrawerOpen(v) { settings.drawerOpen = v; writeBool(DRAWER_OPEN_KEY, v); }
export function setAdminLinkVisible(v) { settings.adminLinkVisible = v; writeBool(ADMIN_LINK_VISIBLE_KEY, v); }

// Re-read every persisted setting into the live store. Used after the durable
// storage layer recovers values that the native WebView had evicted (see
// hydrateDurableStorage in storage.js). A no-op visually when nothing changed.
export function reloadSettings() {
  settings.soundEnabled = readBool(SOUND_KEY, settings.soundEnabled);
  settings.saveOnDeleteEnabled = readBool(SAVE_ON_DELETE_KEY, settings.saveOnDeleteEnabled);
  settings.screenshotEnabled = readBool(SCREENSHOT_KEY, settings.screenshotEnabled);
  settings.undoButtonEnabled = readBool(UNDO_KEY, settings.undoButtonEnabled);
  settings.strokeWidthControlEnabled = readBool(STROKE_CTRL_KEY, settings.strokeWidthControlEnabled);
  settings.eraserEnabled = readBool(ERASER_KEY, settings.eraserEnabled);
  settings.coloringBookEnabled = readBool(COLORING_BOOK_KEY, settings.coloringBookEnabled);
  settings.aiImageEnabled = readBool(AI_IMAGE_KEY, settings.aiImageEnabled);
  settings.aiCustomizationEnabled = readBool(AI_CUSTOMIZATION_KEY, settings.aiCustomizationEnabled);
  settings.autoSaveAiEnabled = readBool(AUTO_SAVE_AI_KEY, settings.autoSaveAiEnabled);
  settings.aiAccessToken = readString(AI_ACCESS_TOKEN_KEY, settings.aiAccessToken);
  settings.advancedControlsEnabled = readBool(ADVANCED_CONTROLS_KEY, settings.advancedControlsEnabled);
  settings.drawerOpen = readBool(DRAWER_OPEN_KEY, settings.drawerOpen);
  settings.adminLinkVisible = readBool(ADMIN_LINK_VISIBLE_KEY, settings.adminLinkVisible);
}

// Pull the saved Gemini key out of secure storage into the live store on boot.
// One-time migration: if an earlier build left a plaintext key in localStorage,
// move it into secure storage and scrub the plaintext copy. Safe to call on the
// web and on native; never throws.
export async function hydrateApiKey() {
  // Best-effort: ask the browser not to evict our encrypted IndexedDB (web only).
  requestPersistentStorage();

  let key = await loadApiKey();

  if (!key) {
    const legacy = readString(AI_USER_API_KEY, '');
    if (legacy) {
      await saveApiKey(legacy);
      removeKey(AI_USER_API_KEY); // remove the plaintext copy now that it's secured
      key = legacy;
    }
  }

  if (key) settings.aiUserApiKey = key;
}

export function captureAiAccessTokenFromUrl() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const token = url.searchParams.get(AI_ACCESS_TOKEN_PARAM);
  if (!token) return;
  setAiAccessToken(token);
  window.history.replaceState({}, '', '/');
}
