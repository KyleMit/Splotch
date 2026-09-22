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
import {
  isReduceMotionPreference,
  REDUCE_MOTION_DEFAULT,
  type ReduceMotionPreference,
} from '$lib/platform/reducedMotion';
import { TABLET_MIN_SIDE_PX } from '$lib/breakpoints';
import type { CredentialKind } from '$lib/aiCredential';
import {
  OPTIONAL_BRUSH_TYPES,
  toolState,
  type OptionalBrushType,
  type ToolState,
} from '$lib/state/tool.svelte';
import { readonlyView } from './readonlyView';

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
  drawingSoundEnabled: [STORAGE_KEYS.drawingSoundEnabled, true],
  deleteSoundEnabled: [STORAGE_KEYS.deleteSoundEnabled, true],
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
  // The Tool Drawer section's own switch. Off hides the drawer's own tools
  // (TOOL_DRAWER_CONTROLS) without touching their stored flags, so turning it
  // back on restores the set the parent chose. Buttons other sections own stay
  // reachable, so the chevron goes only when no control at all is left.
  toolDrawerEnabled: [STORAGE_KEYS.toolDrawer, true],
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
  // Swaps the crayon bar and hex picker for palettes that stay distinct under
  // red-green and blue-yellow color blindness (issue #2096 spike).
  colorBlindFriendlyEnabled: [STORAGE_KEYS.colorBlindFriendly, false],
} satisfies Record<string, [StorageKey, boolean]>;

type BoolSettingKey = keyof typeof BOOL_SETTINGS;

// The controls the Tool Drawer section's switch governs, in the order the
// section lists them: what a child draws with, then the controls beside it.
export const TOOL_DRAWER_CONTROLS = [
  'crayonEnabled',
  'magicBrushEnabled',
  'eraserEnabled',
  'strokeWidthControlEnabled',
  'undoButtonEnabled',
] as const satisfies readonly BoolSettingKey[];
export type ToolDrawerControl = (typeof TOOL_DRAWER_CONTROLS)[number];

// Every Actions Panel control a parent can switch off: the drawer's own, then
// the buttons other sections own (Coloring's books, Saving's camera). The AI
// button is absent because its visibility also hangs on client-only state —
// see isAiImageButtonVisible in actionButtonLayout.ts.
export type ActionPanelControl = ToolDrawerControl | 'coloringBookEnabled' | 'screenshotEnabled';

function isToolDrawerControl(control: ActionPanelControl): control is ToolDrawerControl {
  return (TOOL_DRAWER_CONTROLS as readonly ActionPanelControl[]).includes(control);
}

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

function readReduceMotion(fallback: ReduceMotionPreference): ReduceMotionPreference {
  const raw = readString(STORAGE_KEYS.reduceMotion, fallback);
  return isReduceMotionPreference(raw) ? raw : fallback;
}

function readBoolSettings(): Record<BoolSettingKey, boolean> {
  return Object.fromEntries(
    boolSettingEntries().map(([prop, [key, def]]) => [prop, readBool(key, def)])
  ) as Record<BoolSettingKey, boolean>;
}

function readIntSettings(): Record<IntSettingKey, number> {
  return Object.fromEntries(
    intSettingEntries().map(([prop, [key, def, clamp]]) => [prop, clamp(readInt(key, def))])
  ) as Record<IntSettingKey, number>;
}

export type ToolbarStyle = 'buttons' | 'bare';

function readToolbarStyle(): ToolbarStyle {
  return readString(STORAGE_KEYS.toolbarStyle, 'buttons') === 'bare' ? 'bare' : 'buttons';
}

interface Settings extends Record<BoolSettingKey, boolean>, Record<IntSettingKey, number> {
  // Appearance: explicit light/dark, or 'system' to follow the OS setting.
  theme: ThemePreference;
  // Explicit reduce/full, or 'system' to follow the OS setting. The effective
  // answer is resolved in appearance.svelte.ts, which also knows the OS half.
  reduceMotion: ReduceMotionPreference;
  toolbarStyle: ToolbarStyle;
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

// Extends the verification vocabulary rather than restating it, so a new
// credential kind cannot compile in aiCredential.ts while being silently absent
// from persisted-state classification. 'none' is this module's own addition:
// verification always has a kind, but stored state may have neither credential.
type AiCredentialKind = CredentialKind | 'none';

interface SettingsMutators {
  setSound(v: boolean): void;
  setDrawingSound(v: boolean): void;
  setDeleteSound(v: boolean): void;
  setSaveOnDelete(v: boolean): void;
  setScreenshot(v: boolean): void;
  setUndoButton(v: boolean): void;
  setStrokeWidthControl(v: boolean): void;
  setCrayon(v: boolean): void;
  setMagicBrush(v: boolean): void;
  setEraser(v: boolean): void;
  setColoringBook(v: boolean): void;
  setColoringPacksAllowMetered(v: boolean): void;
  setAiImage(v: boolean): void;
  setAiCustomization(v: boolean): void;
  setAutoSaveAi(v: boolean): void;
  setToolDrawerEnabled(v: boolean): void;
  setDrawerOpen(v: boolean): void;
  setLockRotation(v: boolean): void;
  setForceLandscapeOrientation(v: boolean): void;
  setPencilEraserEnabled(v: boolean): void;
  setApplePencilSeen(v: boolean): void;
  setColorBlindFriendly(v: boolean): void;
  setTheme(v: ThemePreference): void;
  setReduceMotion(v: ReduceMotionPreference): void;
  setToolbarStyle(v: ToolbarStyle): void;
  setSoundVolume(v: number): void;
  setActionButtonScale(v: number): void;
  // The in-memory mirrors of values persisted elsewhere (secure storage, the
  // IndexedDB directory handle). The credential coordinators and the save-folder
  // hydration own persistence and are the only production callers.
  mirrorAiUserApiKey(value: string): void;
  mirrorAiAccessToken(value: string): void;
  mirrorSaveFolderName(name: string | null): void;
  /** Whether the Actions Panel shows a control: its own flag, and the drawer switch for the drawer's own tools. */
  actionControlShown(control: ActionPanelControl): boolean;
  enabledOptionalBrushes(): OptionalBrushType[];
  aiCredentialKind(): AiCredentialKind;
  reloadSettings(): void;
}

export type SettingsState = Readonly<Settings> & SettingsMutators;

export function createSettings(tool: ToolState): SettingsState {
  const s: Settings = $state({
    ...readBoolSettings(),
    ...readIntSettings(),
    theme: readTheme(THEME_DEFAULT),
    reduceMotion: readReduceMotion(REDUCE_MOTION_DEFAULT),
    toolbarStyle: readToolbarStyle(),
    aiAccessToken: '',
    aiUserApiKey: '',
    saveFolderName: null,
  });

  // Build a setter that updates the live value and persists it to localStorage.
  function makeBoolSetter(prop: BoolSettingKey) {
    const [key] = BOOL_SETTINGS[prop];
    return (v: boolean) => {
      s[prop] = v;
      writeBool(key, v);
    };
  }

  // Build a setter that clamps, updates the live value, and persists it.
  function makeIntSetter(prop: IntSettingKey) {
    const [key, , clamp] = INT_SETTINGS[prop];
    return (v: number) => {
      const next = clamp(v);
      s[prop] = next;
      writeInt(key, next);
    };
  }

  function actionControlShown(control: ActionPanelControl): boolean {
    return s[control] && (s.toolDrawerEnabled || !isToolDrawerControl(control));
  }

  const OPTIONAL_BRUSH_SETTING = {
    crayon: 'crayonEnabled',
    magic: 'magicBrushEnabled',
    eraser: 'eraserEnabled',
  } as const satisfies Record<OptionalBrushType, BoolSettingKey>;

  function isOptionalBrushEnabled(brush: OptionalBrushType): boolean {
    return actionControlShown(OPTIONAL_BRUSH_SETTING[brush]);
  }

  function normalizeDisabledBrushes() {
    for (const brush of OPTIONAL_BRUSH_TYPES) {
      if (!isOptionalBrushEnabled(brush)) tool.fallBackFromBrush(brush);
    }
  }

  const setCrayonSetting = makeBoolSetter('crayonEnabled');
  const setMagicBrushSetting = makeBoolSetter('magicBrushEnabled');
  const setEraserSetting = makeBoolSetter('eraserEnabled');
  const setToolDrawerSetting = makeBoolSetter('toolDrawerEnabled');

  function setTheme(v: ThemePreference) {
    s.theme = v;
    writeString(STORAGE_KEYS.theme, v);
    applyTheme(v);
  }

  const mutators: SettingsMutators = {
    setSound: makeBoolSetter('soundEnabled'),
    setDrawingSound: makeBoolSetter('drawingSoundEnabled'),
    setDeleteSound: makeBoolSetter('deleteSoundEnabled'),
    setSaveOnDelete: makeBoolSetter('saveOnDeleteEnabled'),
    setScreenshot: makeBoolSetter('screenshotEnabled'),
    setUndoButton: makeBoolSetter('undoButtonEnabled'),
    setStrokeWidthControl: makeBoolSetter('strokeWidthControlEnabled'),
    setCrayon(v) {
      setCrayonSetting(v);
      if (!v) tool.fallBackFromBrush('crayon');
    },
    setMagicBrush(v) {
      setMagicBrushSetting(v);
      if (!v) tool.fallBackFromBrush('magic');
    },
    setEraser(v) {
      setEraserSetting(v);
      if (!v) tool.fallBackFromBrush('eraser');
    },
    setColoringBook: makeBoolSetter('coloringBookEnabled'),
    setColoringPacksAllowMetered: makeBoolSetter('coloringPacksAllowMetered'),
    setAiImage: makeBoolSetter('aiImageEnabled'),
    setAiCustomization: makeBoolSetter('aiCustomizationEnabled'),
    setAutoSaveAi: makeBoolSetter('autoSaveAiEnabled'),
    // Off takes the drawer's brushes with it, so the held brush falls back the way
    // it does when that one brush is switched off — otherwise a child left holding
    // the eraser would have no visible way back to ink.
    setToolDrawerEnabled(v) {
      setToolDrawerSetting(v);
      if (!v) normalizeDisabledBrushes();
    },
    setDrawerOpen: makeBoolSetter('drawerOpen'),
    setLockRotation: makeBoolSetter('lockRotationEnabled'),
    setForceLandscapeOrientation: makeBoolSetter('forceLandscapeOrientation'),
    setPencilEraserEnabled: makeBoolSetter('pencilEraserEnabled'),
    setApplePencilSeen: makeBoolSetter('applePencilSeen'),
    setColorBlindFriendly: makeBoolSetter('colorBlindFriendlyEnabled'),
    setTheme,
    setReduceMotion(v) {
      s.reduceMotion = v;
      writeString(STORAGE_KEYS.reduceMotion, v);
    },
    setToolbarStyle(v) {
      s.toolbarStyle = v;
      writeString(STORAGE_KEYS.toolbarStyle, v);
    },
    setSoundVolume: makeIntSetter('soundVolume'),
    setActionButtonScale: makeIntSetter('actionButtonScale'),
    mirrorAiUserApiKey(value) {
      s.aiUserApiKey = value;
    },
    mirrorAiAccessToken(value) {
      s.aiAccessToken = value;
    },
    mirrorSaveFolderName(name) {
      s.saveFolderName = name;
    },
    actionControlShown,
    enabledOptionalBrushes() {
      return OPTIONAL_BRUSH_TYPES.filter(isOptionalBrushEnabled);
    },
    // Which AI credential is "active" when both happen to be set (nothing clears
    // one when the other is submitted): a BYOK key wins over an access code.
    aiCredentialKind() {
      if (s.aiUserApiKey) return 'apiKey';
      if (s.aiAccessToken) return 'accessCode';
      return 'none';
    },
    // Re-read every persisted setting into the live store. Used after the durable
    // storage layer recovers values that the native WebView had evicted (see
    // hydrateDurableStorage in storage.ts). A no-op visually when nothing changed.
    reloadSettings() {
      for (const [prop, [key]] of boolSettingEntries()) {
        s[prop] = readBool(key, s[prop]);
      }
      for (const [prop, [key, , clamp]] of intSettingEntries()) {
        s[prop] = clamp(readInt(key, s[prop]));
      }
      s.theme = readTheme(s.theme);
      s.reduceMotion = readReduceMotion(s.reduceMotion);
      s.toolbarStyle = readToolbarStyle();
      applyTheme(s.theme);
      normalizeDisabledBrushes();
    },
  };

  normalizeDisabledBrushes();

  return readonlyView(s, mutators);
}

export const settingsState = createSettings(toolState);

export const {
  setSound,
  setDrawingSound,
  setDeleteSound,
  setSaveOnDelete,
  setScreenshot,
  setUndoButton,
  setStrokeWidthControl,
  setCrayon,
  setMagicBrush,
  setEraser,
  setColoringBook,
  setColoringPacksAllowMetered,
  setAiImage,
  setAiCustomization,
  setAutoSaveAi,
  setToolDrawerEnabled,
  setDrawerOpen,
  setLockRotation,
  setForceLandscapeOrientation,
  setPencilEraserEnabled,
  setApplePencilSeen,
  setColorBlindFriendly,
  setTheme,
  setReduceMotion,
  setToolbarStyle,
  setSoundVolume,
  setActionButtonScale,
  actionControlShown,
  enabledOptionalBrushes,
  aiCredentialKind,
  reloadSettings,
} = settingsState;

onDurableRestore(reloadSettings);
