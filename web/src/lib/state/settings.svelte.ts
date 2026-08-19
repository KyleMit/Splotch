import {
  STORAGE_KEYS,
  readBool,
  writeBool,
  readString,
  writeString,
  readInt,
  writeInt,
  onDurableRestore,
  type StorageKey,
} from '../storage';
import { applyTheme, isThemePreference, THEME_DEFAULT, type ThemePreference } from '../theme';
import { TABLET_MIN_SIDE_PX } from '$lib/breakpoints';
import type { CredentialKind } from '$lib/aiCredential';
import {
  OPTIONAL_BRUSH_TYPES,
  fallBackFromBrush,
  type OptionalBrushType,
} from '$lib/state/tool.svelte';

// Phone-class devices stay below the shared tablet floor even in landscape, so
// they default to portrait. The threshold itself is owned by $lib/platform, which
// applies the same boundary to orientation-lock capability.
function defaultForceLandscapeOrientation() {
  if (typeof window === 'undefined') return true;
  return Math.min(window.innerWidth, window.innerHeight) >= TABLET_MIN_SIDE_PX;
}

// Single source of truth for every boolean setting: live-state property name ->
// [localStorage key, default]. The initial $state, the per-setting setters, and
// reloadSettings() are all generated from this table, so adding a boolean
// setting means adding one entry here (plus a one-line named-export wrapper so
// the setter keeps its stable import name — ES modules can't generate those).
// Forgetting the reloadSettings entry — the bug this table exists to prevent —
// is now impossible.
const BOOL_SETTINGS = {
  soundEnabled: [STORAGE_KEYS.soundEnabled, true],
  saveOnDeleteEnabled: [STORAGE_KEYS.saveOnDelete, false],
  screenshotEnabled: [STORAGE_KEYS.screenshotEnabled, true],
  undoButtonEnabled: [STORAGE_KEYS.undoButtonEnabled, true],
  strokeWidthControlEnabled: [STORAGE_KEYS.strokeWidthControl, true],
  crayonEnabled: [STORAGE_KEYS.crayonEnabled, true],
  magicBrushEnabled: [STORAGE_KEYS.magicBrushEnabled, true],
  eraserEnabled: [STORAGE_KEYS.eraserEnabled, true],
  coloringBookEnabled: [STORAGE_KEYS.coloringBookEnabled, true],
  coloringPacksAllowMetered: [STORAGE_KEYS.coloringPacksAllowMetered, false],
  aiImageEnabled: [STORAGE_KEYS.aiImageEnabled, false],
  aiCustomizationEnabled: [STORAGE_KEYS.aiCustomizationEnabled, true],
  // When on, a finished AI image is dropped straight into the photo gallery
  // (a download on the web) along with the child's drawing — no Download button,
  // and the freed space goes to a larger preview.
  autoSaveAiEnabled: [STORAGE_KEYS.autoSaveAi, false],
  // Master switch for the collapsible action drawer. When on, the chevron
  // toggle shows and the drawer can be opened/closed; when off, the controls
  // are always visible and the chevron is hidden.
  advancedControlsEnabled: [STORAGE_KEYS.advancedControls, true],
  // Remembered open/closed state of the drawer (defaults closed).
  drawerOpen: [STORAGE_KEYS.drawerOpen, false],
  // Parent device-orientation controls. The force-landscape default is filled
  // in below from the viewport so phones start portrait while tablet-class
  // devices, including iPad Mini, start landscape.
  lockRotationEnabled: [STORAGE_KEYS.lockRotation, true],
  forceLandscapeOrientation: [STORAGE_KEYS.forceLandscape, defaultForceLandscapeOrientation()],
  // Apple Pencil double-tap → toggle eraser (iOS native). On by default; the
  // toggle that controls it only appears once a pencil has actually been used on
  // this device (applePencilSeen), giving parents a way to turn it off if a
  // toddler keeps flipping tools by accident. See web/src/lib/plugins/pencilEraser.ts.
  pencilEraserEnabled: [STORAGE_KEYS.pencilEraserEnabled, true],
  // Sticky per-device detection flag, set the first time an Apple Pencil
  // double-tap fires. Not a user toggle itself — it's what reveals the
  // pencilEraserEnabled row in Settings.
  applePencilSeen: [STORAGE_KEYS.applePencilSeen, false],
} satisfies Record<string, [StorageKey, boolean]>;

type BoolSettingKey = keyof typeof BOOL_SETTINGS;

const boolSettingEntries = () =>
  Object.entries(BOOL_SETTINGS) as [BoolSettingKey, [StorageKey, boolean]][];

// 50 is the normal authored volume (the slider's midpoint and its snap detent).
export const SOUND_VOLUME_MIN = 0;
export const SOUND_VOLUME_MAX = 100;
export const SOUND_VOLUME_DEFAULT = 50;

function clampVolume(v: number) {
  if (!Number.isFinite(v)) return SOUND_VOLUME_DEFAULT;
  return Math.max(SOUND_VOLUME_MIN, Math.min(SOUND_VOLUME_MAX, Math.round(v)));
}

// Action-center button size, expressed as a percentage of whichever size-class
// step the screen takes (ACTION_BUTTON_BASE_PX in actionButtonLayout.ts), so
// 100% means the step rather than any one pixel size. The range is symmetric
// around the default, so the slider sits half-filled at 100% on every screen.
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
  soundVolume: [STORAGE_KEYS.soundVolume, SOUND_VOLUME_DEFAULT, clampVolume],
  // Action-center button size percentage (see ACTION_BUTTON_SCALE_* above).
  actionButtonScale: [
    STORAGE_KEYS.actionButtonScale,
    ACTION_BUTTON_SCALE_DEFAULT,
    clampButtonScale,
  ],
} satisfies Record<string, [StorageKey, number, (v: number) => number]>;

type IntSettingKey = keyof typeof INT_SETTINGS;

const intSettingEntries = () =>
  Object.entries(INT_SETTINGS) as [IntSettingKey, [StorageKey, number, (v: number) => number]][];

function readTheme(fallback: ThemePreference): ThemePreference {
  const raw = readString(STORAGE_KEYS.theme, fallback);
  return isThemePreference(raw) ? raw : fallback;
}

interface Settings extends Record<BoolSettingKey, boolean>, Record<IntSettingKey, number> {
  // Appearance: explicit light/dark, or 'system' to follow the OS setting.
  theme: ThemePreference;
  // Managed-access token. Held in memory only; hydrated from secure storage on
  // boot by hydrateAiAccessToken(). Empty until then / unless set.
  aiAccessToken: string;
  // Parent-supplied AI provider API key (BYOK). Held in memory only; hydrated from
  // secure storage on boot by hydrateApiKey(). Empty until then / unless set.
  aiUserApiKey: string;
  // Desktop web only: the name of the optional folder web saves are written into
  // (File System Access API). Not persisted here — derived from the directory
  // handle in IndexedDB and hydrated on boot by hydrateSaveFolder(). Null when no
  // folder is set, in which case saves just download. Drives the folder
  // display in Settings; nothing else depends on it.
  saveFolderName: string | null;
}

export const settings: Settings = $state({
  ...(Object.fromEntries(
    boolSettingEntries().map(([prop, [key, def]]) => [prop, readBool(key, def)])
  ) as Record<BoolSettingKey, boolean>),
  ...(Object.fromEntries(
    intSettingEntries().map(([prop, [key, def, clamp]]) => [prop, clamp(readInt(key, def))])
  ) as Record<IntSettingKey, number>),
  theme: readTheme(THEME_DEFAULT),
  aiAccessToken: '',
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

const OPTIONAL_BRUSH_SETTING = {
  crayon: 'crayonEnabled',
  magic: 'magicBrushEnabled',
  eraser: 'eraserEnabled',
} as const satisfies Record<OptionalBrushType, BoolSettingKey>;

function isOptionalBrushEnabled(brush: OptionalBrushType): boolean {
  return settings[OPTIONAL_BRUSH_SETTING[brush]];
}

export function enabledOptionalBrushes(): OptionalBrushType[] {
  return OPTIONAL_BRUSH_TYPES.filter(isOptionalBrushEnabled);
}

function normalizeDisabledBrushes() {
  for (const brush of OPTIONAL_BRUSH_TYPES) {
    if (!isOptionalBrushEnabled(brush)) fallBackFromBrush(brush);
  }
}

export const setSound = makeBoolSetter('soundEnabled');
export const setSaveOnDelete = makeBoolSetter('saveOnDeleteEnabled');
export const setScreenshot = makeBoolSetter('screenshotEnabled');
export const setUndoButton = makeBoolSetter('undoButtonEnabled');
export const setStrokeWidthControl = makeBoolSetter('strokeWidthControlEnabled');
const setCrayonSetting = makeBoolSetter('crayonEnabled');
const setMagicBrushSetting = makeBoolSetter('magicBrushEnabled');
const setEraserSetting = makeBoolSetter('eraserEnabled');

export function setCrayon(v: boolean) {
  setCrayonSetting(v);
  if (!v) fallBackFromBrush('crayon');
}

export function setMagicBrush(v: boolean) {
  setMagicBrushSetting(v);
  if (!v) fallBackFromBrush('magic');
}

export function setEraser(v: boolean) {
  setEraserSetting(v);
  if (!v) fallBackFromBrush('eraser');
}
export const setColoringBook = makeBoolSetter('coloringBookEnabled');
export const setColoringPacksAllowMetered = makeBoolSetter('coloringPacksAllowMetered');
export const setAiImage = makeBoolSetter('aiImageEnabled');
export const setAiCustomization = makeBoolSetter('aiCustomizationEnabled');
export const setAutoSaveAi = makeBoolSetter('autoSaveAiEnabled');
export const setAdvancedControls = makeBoolSetter('advancedControlsEnabled');
export const setDrawerOpen = makeBoolSetter('drawerOpen');
export const setLockRotation = makeBoolSetter('lockRotationEnabled');
export const setForceLandscapeOrientation = makeBoolSetter('forceLandscapeOrientation');
export const setPencilEraserEnabled = makeBoolSetter('pencilEraserEnabled');
export const setApplePencilSeen = makeBoolSetter('applePencilSeen');

export function setTheme(v: ThemePreference) {
  settings.theme = v;
  writeString(STORAGE_KEYS.theme, v);
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

// Extends the verification vocabulary rather than restating it, so a new
// credential kind cannot compile in aiCredential.ts while being silently absent
// from persisted-state classification. 'none' is this module's own addition:
// verification always has a kind, but stored state may have neither credential.
export type AiCredentialKind = CredentialKind | 'none';

// Which AI credential is "active" when both happen to be set (nothing clears
// one when the other is submitted): a BYOK key wins over an access code.
export function aiCredentialKind(): AiCredentialKind {
  if (settings.aiUserApiKey) return 'apiKey';
  if (settings.aiAccessToken) return 'accessCode';
  return 'none';
}

// Re-read every persisted setting into the live store. Used after the durable
// storage layer recovers values that the native WebView had evicted (see
// hydrateDurableStorage in storage.ts). A no-op visually when nothing changed.
export function reloadSettings() {
  for (const [prop, [key]] of boolSettingEntries()) {
    settings[prop] = readBool(key, settings[prop]);
  }
  for (const [prop, [key, , clamp]] of intSettingEntries()) {
    settings[prop] = clamp(readInt(key, settings[prop]));
  }
  settings.theme = readTheme(settings.theme);
  applyTheme(settings.theme);
  normalizeDisabledBrushes();
}

normalizeDisabledBrushes();

onDurableRestore(reloadSettings);
