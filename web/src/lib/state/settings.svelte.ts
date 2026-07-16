import {
  readBool,
  writeBool,
  readString,
  writeString,
  readInt,
  writeInt,
  removeKey,
} from '../storage';
import { saveApiKey, loadApiKey, clearApiKey, requestPersistentStorage } from '../secureStorage';
import { applyTheme, isThemePreference, THEME_DEFAULT, type ThemePreference } from '../theme';
import {
  folderSaveSupported,
  chooseSaveFolder,
  getSaveFolderName,
  clearSaveFolder,
  onSaveFolderCleared,
} from '$lib/drawing/folderSave';

const SOUND_KEY = 'splotch-sound-enabled';
const SOUND_VOLUME_KEY = 'splotch-sound-volume';
const ACTION_BUTTON_SCALE_KEY = 'splotch-action-button-scale';
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
const LOCK_ROTATION_KEY = 'splotch-lock-rotation';
const FORCE_LANDSCAPE_KEY = 'splotch-force-landscape';
const PENCIL_ERASER_KEY = 'splotch-pencil-eraser-enabled';
const APPLE_PENCIL_SEEN_KEY = 'splotch-apple-pencil-seen';
const THEME_KEY = 'splotch-theme';

function defaultForceLandscapeOrientation() {
  if (typeof window === 'undefined') return true;
  // iPad Mini and larger tablets have a smallest CSS viewport side around
  // 744px; Android tablet layouts commonly start at 600dp. Phone-class devices
  // stay below that, even in landscape, so they default to portrait.
  return Math.min(window.innerWidth, window.innerHeight) >= 600;
}

// Single source of truth for every boolean setting: live-state property name ->
// [localStorage key, default]. The initial $state, the per-setting setters, and
// reloadSettings() are all generated from this table, so adding a boolean
// setting means adding one entry here (plus a one-line named-export wrapper so
// the setter keeps its stable import name — ES modules can't generate those).
// Forgetting the reloadSettings entry — the bug this table exists to prevent —
// is now impossible.
const BOOL_SETTINGS = {
  soundEnabled: [SOUND_KEY, true],
  saveOnDeleteEnabled: [SAVE_ON_DELETE_KEY, false],
  screenshotEnabled: [SCREENSHOT_KEY, true],
  undoButtonEnabled: [UNDO_KEY, true],
  strokeWidthControlEnabled: [STROKE_CTRL_KEY, true],
  eraserEnabled: [ERASER_KEY, true],
  coloringBookEnabled: [COLORING_BOOK_KEY, true],
  aiImageEnabled: [AI_IMAGE_KEY, true],
  aiCustomizationEnabled: [AI_CUSTOMIZATION_KEY, true],
  // When on, a finished AI image is dropped straight into the photo gallery
  // (a download on the web) along with the child's drawing — no Download button,
  // and the freed space goes to a larger preview.
  autoSaveAiEnabled: [AUTO_SAVE_AI_KEY, false],
  // Master switch for the collapsible action drawer. When on, the chevron
  // toggle shows and the drawer can be opened/closed; when off, the controls
  // are always visible and the chevron is hidden.
  advancedControlsEnabled: [ADVANCED_CONTROLS_KEY, true],
  // Remembered open/closed state of the drawer (defaults closed).
  drawerOpen: [DRAWER_OPEN_KEY, false],
  // Whether the hidden link to the /admin console is shown in the About tab.
  // Unlocked by the version-tap easter egg and kept visible for anyone who has
  // an admin_session cookie; reset to hidden on logout / failed login / leaving
  // the admin page without signing in (see /admin and AboutSection).
  adminLinkVisible: [ADMIN_LINK_VISIBLE_KEY, false],
  // Parent device-orientation controls. The force-landscape default is filled
  // in below from the viewport so phones start portrait while tablet-class
  // devices, including iPad Mini, start landscape.
  lockRotationEnabled: [LOCK_ROTATION_KEY, true],
  forceLandscapeOrientation: [FORCE_LANDSCAPE_KEY, defaultForceLandscapeOrientation()],
  // Apple Pencil double-tap → toggle eraser (iOS native). On by default; the
  // toggle that controls it only appears once a pencil has actually been used on
  // this device (applePencilSeen), giving parents a way to turn it off if a
  // toddler keeps flipping tools by accident. See web/src/lib/plugins/pencilEraser.ts.
  pencilEraserEnabled: [PENCIL_ERASER_KEY, true],
  // Sticky per-device detection flag, set the first time an Apple Pencil
  // double-tap fires. Not a user toggle itself — it's what reveals the
  // pencilEraserEnabled row in the Parent Center.
  applePencilSeen: [APPLE_PENCIL_SEEN_KEY, false],
} satisfies Record<string, [string, boolean]>;

type BoolSettingKey = keyof typeof BOOL_SETTINGS;

// 50 is the normal authored volume (the slider's midpoint and its snap detent).
export const SOUND_VOLUME_DEFAULT = 50;

function clampVolume(v: number) {
  if (!Number.isFinite(v)) return SOUND_VOLUME_DEFAULT;
  return Math.max(0, Math.min(100, Math.round(v)));
}

// Action-center button size, expressed as a percentage of the authored size
// (100 = the default 60px/55px buttons). The range is symmetric around the
// default so the slider sits half-filled at 100%.
export const ACTION_BUTTON_SCALE_MIN = 70;
export const ACTION_BUTTON_SCALE_MAX = 130;
export const ACTION_BUTTON_SCALE_DEFAULT = 100;

function clampButtonScale(v: number) {
  if (!Number.isFinite(v)) return ACTION_BUTTON_SCALE_DEFAULT;
  return Math.max(ACTION_BUTTON_SCALE_MIN, Math.min(ACTION_BUTTON_SCALE_MAX, Math.round(v)));
}

function readTheme(fallback: ThemePreference): ThemePreference {
  const raw = readString(THEME_KEY, fallback);
  return isThemePreference(raw) ? raw : fallback;
}

interface Settings extends Record<BoolSettingKey, boolean> {
  // Appearance: explicit light/dark, or 'system' to follow the OS setting.
  theme: ThemePreference;
  // Drawing sound volume percentage. 50 is the normal authored volume, 100 is 2x.
  soundVolume: number;
  // Action-center button size percentage (see ACTION_BUTTON_SCALE_* above).
  actionButtonScale: number;
  // String setting (special case): the managed-access token, persisted verbatim.
  aiAccessToken: string;
  // Parent-supplied Gemini API key (BYOK). Held in memory only; hydrated from
  // secure storage on boot by hydrateApiKey(). Empty until then / unless set.
  aiUserApiKey: string;
  // Desktop web only: the name of the optional folder web saves are written into
  // (File System Access API). Not persisted here — derived from the directory
  // handle in IndexedDB and hydrated on boot by hydrateSaveFolder(). Null when no
  // folder is set, in which case saves just download. Drives the Parent Center
  // folder display; nothing else depends on it.
  saveFolderName: string | null;
}

export const settings: Settings = $state({
  ...(Object.fromEntries(
    Object.entries(BOOL_SETTINGS).map(([prop, [key, def]]) => [prop, readBool(key, def)])
  ) as Record<BoolSettingKey, boolean>),
  theme: readTheme(THEME_DEFAULT),
  soundVolume: clampVolume(readInt(SOUND_VOLUME_KEY, SOUND_VOLUME_DEFAULT)),
  actionButtonScale: clampButtonScale(
    readInt(ACTION_BUTTON_SCALE_KEY, ACTION_BUTTON_SCALE_DEFAULT)
  ),
  aiAccessToken: readString(AI_ACCESS_TOKEN_KEY, ''),
  aiUserApiKey: '',
  saveFolderName: null,
});

// Build a setter that updates the live value and persists it to localStorage.
function makeBoolSetter(prop: BoolSettingKey) {
  const [key] = BOOL_SETTINGS[prop];
  return (v: boolean) => {
    settings[prop] = v;
    writeBool(key, v);
  };
}

export const setSound = makeBoolSetter('soundEnabled');
export const setSaveOnDelete = makeBoolSetter('saveOnDeleteEnabled');
export const setScreenshot = makeBoolSetter('screenshotEnabled');
export const setUndoButton = makeBoolSetter('undoButtonEnabled');
export const setStrokeWidthControl = makeBoolSetter('strokeWidthControlEnabled');
export const setEraser = makeBoolSetter('eraserEnabled');
export const setColoringBook = makeBoolSetter('coloringBookEnabled');
export const setAiImage = makeBoolSetter('aiImageEnabled');
export const setAiCustomization = makeBoolSetter('aiCustomizationEnabled');
export const setAutoSaveAi = makeBoolSetter('autoSaveAiEnabled');
export const setAdvancedControls = makeBoolSetter('advancedControlsEnabled');
export const setDrawerOpen = makeBoolSetter('drawerOpen');
export const setAdminLinkVisible = makeBoolSetter('adminLinkVisible');
export const setLockRotation = makeBoolSetter('lockRotationEnabled');
export const setForceLandscapeOrientation = makeBoolSetter('forceLandscapeOrientation');
export const setPencilEraserEnabled = makeBoolSetter('pencilEraserEnabled');
export const setApplePencilSeen = makeBoolSetter('applePencilSeen');

export function setTheme(v: ThemePreference) {
  settings.theme = v;
  writeString(THEME_KEY, v);
  applyTheme(v);
}

export function setSoundVolume(v: number) {
  const next = clampVolume(v);
  settings.soundVolume = next;
  writeInt(SOUND_VOLUME_KEY, next);
}

export function setActionButtonScale(v: number) {
  const next = clampButtonScale(v);
  settings.actionButtonScale = next;
  writeInt(ACTION_BUTTON_SCALE_KEY, next);
}

export function setAiAccessToken(v: string) {
  settings.aiAccessToken = v;
  writeString(AI_ACCESS_TOKEN_KEY, v);
}
let aiKeyWriteVersion = 0;
// Keep secure writes ordered so an older save already in flight cannot finish
// after a replacement and become the credential restored on the next launch.
let aiKeyWriteQueue = Promise.resolve();

async function persistAiUserApiKey(v: string) {
  if (v) await saveApiKey(v);
  else await clearApiKey();
}

export function setAiUserApiKey(v: string, ownsRequest: () => boolean = () => true) {
  const writeVersion = ++aiKeyWriteVersion;
  const operation = aiKeyWriteQueue.then(async () => {
    if (writeVersion !== aiKeyWriteVersion || !ownsRequest()) return false;

    await persistAiUserApiKey(v);

    if (writeVersion !== aiKeyWriteVersion) return false;
    if (!ownsRequest()) {
      await persistAiUserApiKey(settings.aiUserApiKey);
      return false;
    }

    settings.aiUserApiKey = v;
    return true;
  });
  aiKeyWriteQueue = operation.then(
    () => undefined,
    () => undefined
  );
  return operation;
}

// Re-read every persisted setting into the live store. Used after the durable
// storage layer recovers values that the native WebView had evicted (see
// hydrateDurableStorage in storage.js). A no-op visually when nothing changed.
export function reloadSettings() {
  for (const [prop, [key]] of Object.entries(BOOL_SETTINGS) as [
    BoolSettingKey,
    [string, boolean],
  ][]) {
    settings[prop] = readBool(key, settings[prop]);
  }
  settings.soundVolume = clampVolume(readInt(SOUND_VOLUME_KEY, settings.soundVolume));
  settings.actionButtonScale = clampButtonScale(
    readInt(ACTION_BUTTON_SCALE_KEY, settings.actionButtonScale)
  );
  settings.aiAccessToken = readString(AI_ACCESS_TOKEN_KEY, settings.aiAccessToken);
  settings.theme = readTheme(settings.theme);
  applyTheme(settings.theme);
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

// A save that discovers the chosen folder is gone (moved/deleted) drops the
// stored handle itself; mirror that here so the Parent Center pill doesn't keep
// naming a folder that no longer receives saves.
onSaveFolderCleared(() => {
  settings.saveFolderName = null;
});

// Pick (or re-pick) the optional destination folder for web saves. Must be
// called from a click handler so the picker keeps its user activation. Keeps the
// current folder if the parent cancels. Purely a convenience — it doesn't enable
// or disable any save action; saves work the same with or without a folder.
export async function changeSaveFolder() {
  const name = await chooseSaveFolder();
  if (name) settings.saveFolderName = name;
}

// Forget the chosen folder, so web saves revert to the browser's default
// download location. Doesn't stop anything from saving.
export async function forgetSaveFolder() {
  await clearSaveFolder();
  settings.saveFolderName = null;
}

// Boot hydration (web/desktop only): read the remembered folder name from the
// directory handle in IndexedDB into the live store so the Parent Center can
// show it. No side effects on the save features.
export async function hydrateSaveFolder() {
  if (!folderSaveSupported()) return;
  settings.saveFolderName = await getSaveFolderName();
}

export function captureAiAccessTokenFromUrl() {
  if (typeof window === 'undefined') return;
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- one-shot parse of the current URL, not reactive state
  const url = new URL(window.location.href);
  const token = url.searchParams.get(AI_ACCESS_TOKEN_PARAM);
  if (!token) return;
  setAiAccessToken(token);
  window.history.replaceState({}, '', '/');
}
