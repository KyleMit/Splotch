import {
  readBool,
  writeBool,
  readString,
  writeString,
  readInt,
  writeInt,
  onDurableRestore,
} from '../storage';
import { applyTheme, isThemePreference, THEME_DEFAULT, type ThemePreference } from '../theme';

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
  // Hides the eraser entry in the Actions Panel's Brush Menu (the eraser moved
  // there from its old top-level button; the stored key predates the move).
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

// The integer counterpart to BOOL_SETTINGS: live-state property name ->
// [localStorage key, default, clamp]. Same generation guarantee — the initial
// $state, the setters, and reloadSettings() all come from this table, so a new
// int setting is one entry here plus its named-export wrapper.
const INT_SETTINGS = {
  // Drawing sound volume percentage. 50 is the normal authored volume, 100 is 2x.
  soundVolume: [SOUND_VOLUME_KEY, SOUND_VOLUME_DEFAULT, clampVolume],
  // Action-center button size percentage (see ACTION_BUTTON_SCALE_* above).
  actionButtonScale: [ACTION_BUTTON_SCALE_KEY, ACTION_BUTTON_SCALE_DEFAULT, clampButtonScale],
} satisfies Record<string, [string, number, (v: number) => number]>;

type IntSettingKey = keyof typeof INT_SETTINGS;

function readTheme(fallback: ThemePreference): ThemePreference {
  const raw = readString(THEME_KEY, fallback);
  return isThemePreference(raw) ? raw : fallback;
}

interface Settings extends Record<BoolSettingKey, boolean>, Record<IntSettingKey, number> {
  // Appearance: explicit light/dark, or 'system' to follow the OS setting.
  theme: ThemePreference;
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
  ...(Object.fromEntries(
    Object.entries(INT_SETTINGS).map(([prop, [key, def, clamp]]) => [
      prop,
      clamp(readInt(key, def)),
    ])
  ) as Record<IntSettingKey, number>),
  theme: readTheme(THEME_DEFAULT),
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

// Build a setter that clamps, updates the live value, and persists it.
function makeIntSetter(prop: IntSettingKey) {
  const [key, , clamp] = INT_SETTINGS[prop];
  return (v: number) => {
    const next = clamp(v);
    settings[prop] = next;
    writeInt(key, next);
  };
}

export const setSoundVolume = makeIntSetter('soundVolume');
export const setActionButtonScale = makeIntSetter('actionButtonScale');

export function setAiAccessToken(v: string) {
  settings.aiAccessToken = v;
  writeString(AI_ACCESS_TOKEN_KEY, v);
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
  for (const [prop, [key, , clamp]] of Object.entries(INT_SETTINGS) as [
    IntSettingKey,
    [string, number, (v: number) => number],
  ][]) {
    settings[prop] = clamp(readInt(key, settings[prop]));
  }
  settings.aiAccessToken = readString(AI_ACCESS_TOKEN_KEY, settings.aiAccessToken);
  settings.theme = readTheme(settings.theme);
  applyTheme(settings.theme);
}

onDurableRestore(reloadSettings);

export function captureAiAccessTokenFromUrl() {
  if (typeof window === 'undefined') return;
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- one-shot parse of the current URL, not reactive state
  const url = new URL(window.location.href);
  const token = url.searchParams.get(AI_ACCESS_TOKEN_PARAM);
  if (!token) return;
  setAiAccessToken(token);
  window.history.replaceState({}, '', '/');
}
