import {
  DEFAULT_DRAWING_CONTROL_PREFERENCES,
  readDrawingControlPreferences,
  type DrawingControlPreferences,
} from './drawingControlPreferences';
import { DEFAULT_COLORING_BOOK_ENABLED } from './coloringBook';
import { DEFAULT_SOUND_LEVEL, isSoundLevel, type SoundLevel } from './soundLevel';
import {
  DEFAULT_APPEARANCE,
  isAppearancePreference,
  type AppearancePreference,
} from './appearance';
import { DEFAULT_STROKE_WIDTH, isStrokeWidth, type StrokeWidth } from '../drawing/strokeWidth';
import {
  DEFAULT_COLOR_SETTINGS,
  MAX_CUSTOM_COLORS,
  isCustomColor,
  isPaintColor,
  type CustomColor,
  type PaintColor,
} from '../drawing/palette';
import { DEFAULT_PARENT_PREFERENCES } from '../platform/parentDefaults';
import { defaultOrientation } from '../platform/orientationDefault';
import { isOrientationChoice, type OrientationChoice } from './orientation';
import { DEFAULT_SAVE_ON_DELETE_ENABLED } from './saveOnDelete';
import { DEFAULT_BUTTON_SCALE, isButtonScale } from './buttonSize';
import {
  isReduceMotionPreference,
  REDUCE_MOTION_DEFAULT,
  type ReduceMotionPreference,
} from './reduceMotion';
import { isWhatsNewSeen } from './whatsNew';
import { DEFAULT_PENCIL_SETTINGS, readPencilSettings, type PencilSettings } from './pencilEraser';
import {
  readLegacyParentPreferences,
  isParentPolicies,
  type ParentPreferences,
} from '../parentCenter/parentPolicy';

export type WidthSettings = Readonly<{ strokeWidth: StrokeWidth; eraserWidth: StrokeWidth }>;
export type AccessibilitySettings = Readonly<{
  buttonScale: number;
  reduceMotion: ReduceMotionPreference;
  whatsNewSeen: string | null;
}>;
type ColorSettings = Readonly<{
  selectedColor: PaintColor;
  customColors: readonly CustomColor[];
}>;
export type Choices = WidthSettings &
  DrawingControlPreferences &
  ColorSettings &
  ParentPreferences &
  AccessibilitySettings &
  PencilSettings &
  Readonly<{
    soundEnabled: boolean;
    soundLevel: SoundLevel;
    appearance: AppearancePreference;
    coloringBookEnabled: boolean;
    orientation: OrientationChoice;
    saveOnDeleteEnabled: boolean;
  }>;
export type SoundSettings = Choices & Readonly<{ version: 12 }>;
export type SoundSettingsState =
  | (WidthSettings &
      DrawingControlPreferences &
      ColorSettings &
      ParentPreferences &
      AccessibilitySettings &
      PencilSettings & {
        status: 'loading';
        soundEnabled: false;
        soundLevel: SoundLevel;
        appearance: AppearancePreference;
        coloringBookEnabled: boolean;
        orientation: OrientationChoice;
        saveOnDeleteEnabled: boolean;
        message: string;
      })
  | (Choices & { status: 'saving'; message: string })
  | (Choices & { status: 'ready'; saved: boolean; message: string });
export type SoundSettingsStorage = {
  read: () => Promise<string | null>;
  write: (snapshot: string) => Promise<void>;
};
export const MAX_SETTINGS_BYTES = 1024;
const MIGRATED_PARENT_PREFERENCES: ParentPreferences = {
  ...DEFAULT_PARENT_PREFERENCES,
  parentPolicies: { ...DEFAULT_PARENT_PREFERENCES.parentPolicies, imageReport: 'always' },
};
export const DEFAULT_WIDTH_SETTINGS: WidthSettings = {
  strokeWidth: DEFAULT_STROKE_WIDTH,
  eraserWidth: DEFAULT_STROKE_WIDTH,
};
// The shipping defaults: normal-size buttons, motion following the device, and a What's New
// the parent has not opened yet.
export const DEFAULT_ACCESSIBILITY_SETTINGS: AccessibilitySettings = {
  buttonScale: DEFAULT_BUTTON_SCALE,
  reduceMotion: REDUCE_MOTION_DEFAULT,
  whatsNewSeen: null,
};

function readAccessibilitySettings(value: object): AccessibilitySettings {
  const buttonScale = 'buttonScale' in value ? value.buttonScale : undefined;
  if (!isButtonScale(buttonScale)) throw new Error('Button Size choice is invalid.');
  const reduceMotion = 'reduceMotion' in value ? value.reduceMotion : undefined;
  if (!isReduceMotionPreference(reduceMotion)) throw new Error('Reduce Motion choice is invalid.');
  const whatsNewSeen = 'whatsNewSeen' in value ? value.whatsNewSeen : undefined;
  if (!isWhatsNewSeen(whatsNewSeen)) throw new Error("What's New stamp is invalid.");
  return { buttonScale, reduceMotion, whatsNewSeen };
}

function canonical<T>(settings: T, snapshot: string): T {
  if (JSON.stringify(settings) !== snapshot)
    throw new Error('Sound settings are not in the saved format.');
  return settings;
}

function readParentPreferences(value: unknown): ParentPreferences {
  if (
    !value ||
    typeof value !== 'object' ||
    !('aiEnabled' in value) ||
    typeof value.aiEnabled !== 'boolean' ||
    !('parentPolicies' in value) ||
    !isParentPolicies(value.parentPolicies)
  )
    throw new Error('Parent Center settings are invalid.');
  return {
    aiEnabled: value.aiEnabled,
    parentPolicies: {
      ai: value.parentPolicies.ai,
      imageReport: value.parentPolicies.imageReport,
      feedback: value.parentPolicies.feedback,
      parentCenter: value.parentPolicies.parentCenter,
    },
  };
}

function readStoredParentSettings(
  value: object & { version: unknown },
  widths: WidthSettings & { soundEnabled: boolean },
  colors: ColorSettings,
  appearance: AppearancePreference,
  snapshot: string
): SoundSettings {
  const current = value.version === 12;
  const pencilled = current || value.version === 11;
  const accessible = pencilled || value.version === 10;
  const savesOnDelete = accessible || value.version === 9;
  const complete = savesOnDelete || value.version === 8;
  const kept = (key: string) => complete || (value.version === 7 && key in value);
  const parent =
    complete || value.version === 7
      ? readParentPreferences(value)
      : readLegacyParentPreferences(value);
  const coloringBookEnabled =
    value.version === 5
      ? DEFAULT_COLORING_BOOK_ENABLED
      : 'coloringBookEnabled' in value && typeof value.coloringBookEnabled === 'boolean'
        ? value.coloringBookEnabled
        : null;
  if (coloringBookEnabled === null) throw new Error('Coloring book choice is invalid.');
  const hasSoundLevel = kept('soundLevel');
  const soundLevel =
    hasSoundLevel && 'soundLevel' in value ? value.soundLevel : DEFAULT_SOUND_LEVEL;
  if (!isSoundLevel(soundLevel)) throw new Error('Sound level is invalid.');
  const controls = readDrawingControlPreferences(value);
  const orientation = complete && 'orientation' in value ? value.orientation : defaultOrientation();
  if (!isOrientationChoice(orientation)) throw new Error('Orientation choice is invalid.');
  const saveOnDeleteEnabled =
    savesOnDelete && 'saveOnDeleteEnabled' in value
      ? value.saveOnDeleteEnabled
      : DEFAULT_SAVE_ON_DELETE_ENABLED;
  if (typeof saveOnDeleteEnabled !== 'boolean')
    throw new Error('Auto-Save on Delete choice is invalid.');
  const accessibility = accessible
    ? readAccessibilitySettings(value)
    : DEFAULT_ACCESSIBILITY_SETTINGS;
  const pencil = pencilled ? readPencilSettings(value) : DEFAULT_PENCIL_SETTINGS;
  canonical(
    {
      version: value.version,
      ...widths,
      ...colors,
      appearance,
      ...parent,
      ...(value.version === 5 ? {} : { coloringBookEnabled }),
      ...(hasSoundLevel ? { soundLevel } : {}),
      ...(kept('undoButtonEnabled') ? { undoButtonEnabled: controls.undoButtonEnabled } : {}),
      ...(kept('strokeWidthControlEnabled')
        ? { strokeWidthControlEnabled: controls.strokeWidthControlEnabled }
        : {}),
      ...(complete ? { orientation } : {}),
      ...(savesOnDelete ? { saveOnDeleteEnabled } : {}),
      ...(accessible ? accessibility : {}),
      ...(pencilled ? pencil : {}),
      ...(current
        ? {
            toolDrawerEnabled: controls.toolDrawerEnabled,
            screenshotEnabled: controls.screenshotEnabled,
          }
        : {}),
    },
    snapshot
  );
  return {
    version: 12,
    ...widths,
    ...colors,
    appearance,
    ...parent,
    parentPolicies: {
      ai: parent.parentPolicies.ai,
      imageReport:
        'imageReport' in parent.parentPolicies ? parent.parentPolicies.imageReport : 'always',
      feedback: parent.parentPolicies.feedback,
      parentCenter: parent.parentPolicies.parentCenter,
    },
    coloringBookEnabled,
    soundLevel,
    ...controls,
    orientation,
    saveOnDeleteEnabled,
    ...accessibility,
    ...pencil,
  };
}

function migrateLegacyChoices(
  choices: Partial<WidthSettings & ColorSettings & { appearance: AppearancePreference }> & {
    soundEnabled: boolean;
  }
): SoundSettings {
  return {
    version: 12,
    coloringBookEnabled: DEFAULT_COLORING_BOOK_ENABLED,
    ...MIGRATED_PARENT_PREFERENCES,
    ...DEFAULT_WIDTH_SETTINGS,
    ...DEFAULT_COLOR_SETTINGS,
    appearance: DEFAULT_APPEARANCE,
    soundLevel: DEFAULT_SOUND_LEVEL,
    ...DEFAULT_DRAWING_CONTROL_PREFERENCES,
    orientation: defaultOrientation(),
    saveOnDeleteEnabled: DEFAULT_SAVE_ON_DELETE_ENABLED,
    ...DEFAULT_ACCESSIBILITY_SETTINGS,
    ...DEFAULT_PENCIL_SETTINGS,
    ...choices,
  };
}

export function parseSoundSettings(snapshot: string): SoundSettings {
  if (snapshot.length > MAX_SETTINGS_BYTES) throw new Error('Sound settings are too large.');
  const value: unknown = JSON.parse(snapshot);
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('version' in value) ||
    (value.version !== 1 &&
      value.version !== 2 &&
      value.version !== 3 &&
      value.version !== 4 &&
      value.version !== 5 &&
      value.version !== 6 &&
      value.version !== 7 &&
      value.version !== 8 &&
      value.version !== 9 &&
      value.version !== 10 &&
      value.version !== 11 &&
      value.version !== 12) ||
    !('soundEnabled' in value) ||
    typeof value.soundEnabled !== 'boolean'
  )
    throw new Error('Sound settings are invalid.');
  if (value.version === 1) {
    canonical({ version: 1, soundEnabled: value.soundEnabled }, snapshot);
    return migrateLegacyChoices({ soundEnabled: value.soundEnabled });
  }
  if (
    !('strokeWidth' in value) ||
    !isStrokeWidth(value.strokeWidth) ||
    !('eraserWidth' in value) ||
    !isStrokeWidth(value.eraserWidth)
  )
    throw new Error('Drawing widths are invalid.');
  const widths = {
    soundEnabled: value.soundEnabled,
    strokeWidth: value.strokeWidth,
    eraserWidth: value.eraserWidth,
  };
  if (value.version === 2) {
    canonical({ version: 2, ...widths }, snapshot);
    return migrateLegacyChoices(widths);
  }
  if (
    (value.version !== 3 &&
      value.version !== 4 &&
      value.version !== 5 &&
      value.version !== 6 &&
      value.version !== 7 &&
      value.version !== 8 &&
      value.version !== 9 &&
      value.version !== 10 &&
      value.version !== 11 &&
      value.version !== 12) ||
    !('selectedColor' in value) ||
    !isPaintColor(value.selectedColor) ||
    !('customColors' in value) ||
    !Array.isArray(value.customColors) ||
    value.customColors.length > MAX_CUSTOM_COLORS ||
    !value.customColors.every(isCustomColor) ||
    new Set(value.customColors).size !== value.customColors.length ||
    (isCustomColor(value.selectedColor) && !value.customColors.includes(value.selectedColor))
  )
    throw new Error('Paint settings are invalid.');
  const colors = { selectedColor: value.selectedColor, customColors: value.customColors };
  if (value.version === 3) {
    canonical({ version: 3, ...widths, ...colors }, snapshot);
    return migrateLegacyChoices({ ...widths, ...colors });
  }
  if (!('appearance' in value) || !isAppearancePreference(value.appearance))
    throw new Error('Appearance choice is invalid.');
  if (value.version === 4) {
    canonical({ version: 4, ...widths, ...colors, appearance: value.appearance }, snapshot);
    return migrateLegacyChoices({ ...widths, ...colors, appearance: value.appearance });
  }
  return readStoredParentSettings(value, widths, colors, value.appearance, snapshot);
}

export function snapshot(state: Choices): SoundSettings {
  return {
    version: 12,
    soundEnabled: state.soundEnabled,
    strokeWidth: state.strokeWidth,
    eraserWidth: state.eraserWidth,
    selectedColor: state.selectedColor,
    customColors: state.customColors,
    appearance: state.appearance,
    aiEnabled: state.aiEnabled,
    parentPolicies: state.parentPolicies,
    coloringBookEnabled: state.coloringBookEnabled,
    soundLevel: state.soundLevel,
    undoButtonEnabled: state.undoButtonEnabled,
    strokeWidthControlEnabled: state.strokeWidthControlEnabled,
    orientation: state.orientation,
    saveOnDeleteEnabled: state.saveOnDeleteEnabled,
    buttonScale: state.buttonScale,
    reduceMotion: state.reduceMotion,
    whatsNewSeen: state.whatsNewSeen,
    pencilEraserEnabled: state.pencilEraserEnabled,
    applePencilSeen: state.applePencilSeen,
    toolDrawerEnabled: state.toolDrawerEnabled,
    screenshotEnabled: state.screenshotEnabled,
  };
}
