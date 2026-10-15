import {
  DEFAULT_DRAWING_CONTROL_PREFERENCES,
  readDrawingControlPreferences,
  type DrawingControlPreferences,
} from './drawingControlPreferences';
import { DEFAULT_COLORING_BOOK_ENABLED } from './coloringBook';
import { isSoundVolume, legacySoundLevelVolume, SOUND_VOLUME_DEFAULT } from './soundVolume';
import { DEFAULT_TOOLBAR_STYLE, isToolbarStyle, type ToolbarStyle } from './toolbarStyle';
import {
  DEFAULT_APPEARANCE,
  isAppearancePreference,
  type AppearancePreference,
} from './appearance';
import { DEFAULT_STROKE_WIDTH, isStrokeWidth, type StrokeWidth } from '../drawing/strokeWidth';
import {
  MAX_CUSTOM_COLORS,
  isCustomColor,
  isPaintColor,
  type CustomColor,
  type PaintColor,
} from '../drawing/palette';
import { DEFAULT_PARENT_PREFERENCES } from '../platform/parentDefaults';
import { PARENT_PLATFORM } from '../platform/parentPlatform';
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
import { DEFAULT_AI_PREFERENCES, readAiPreferences, type AiPreferences } from './aiPreferences';
import {
  readLegacyParentPreferences,
  isParentPolicies,
  isParentPoliciesBeforeExternalLinks,
  availablePolicies,
  orderedParentPolicies,
  type ParentPreferences,
} from '../parentCenter/parentPolicy';

export type WidthSettings = Readonly<{ strokeWidth: StrokeWidth; eraserWidth: StrokeWidth }>;
export type AccessibilitySettings = Readonly<{
  buttonScale: number;
  reduceMotion: ReduceMotionPreference;
  whatsNewSeen: string | null;
}>;
// The paint is session state, as in shipping: every launch starts on DEFAULT_COLOR_SETTINGS.
export type ColorSettings = Readonly<{
  selectedColor: PaintColor;
  customColors: readonly CustomColor[];
}>;
// How loud sound plays and which of the two sources make it; the master switch stays separate.
export type SoundSourceSettings = Readonly<{
  soundVolume: number;
  drawingSoundEnabled: boolean;
  deleteSoundEnabled: boolean;
}>;
export type Choices = WidthSettings &
  DrawingControlPreferences &
  ParentPreferences &
  AccessibilitySettings &
  PencilSettings &
  SoundSourceSettings &
  AiPreferences &
  Readonly<{
    soundEnabled: boolean;
    appearance: AppearancePreference;
    toolbarStyle: ToolbarStyle;
    coloringBookEnabled: boolean;
    orientation: OrientationChoice;
    saveOnDeleteEnabled: boolean;
  }>;
// Compatibility: a build that reads a higher version keeps that record untouched and runs on
// protected session settings until it is updated, so every bump strands each older install's saved
// settings. Bump only for a meaningful contract change: a key removed or renamed, a value whose
// type, range or meaning changes, or a change to what a protection allows. A preference that
// protects nothing and that an older build may simply not know goes in a store key of its own, as
// the Tool Drawer's open state does (drawerOpenStorage), and leaves this record and its version
// alone. Every version's canonical record opens with its integer version as the first key, which
// is how an older build tells a newer record from a damaged one (settingsRead.ts).
export const SOUND_SETTINGS_VERSION = 16;
export type SoundSettings = Choices & Readonly<{ version: typeof SOUND_SETTINGS_VERSION }>;
export type SoundSettingsState =
  | (WidthSettings &
      DrawingControlPreferences &
      ColorSettings &
      ParentPreferences &
      AccessibilitySettings &
      PencilSettings &
      SoundSourceSettings &
      AiPreferences & {
        status: 'loading';
        soundEnabled: false;
        appearance: AppearancePreference;
        toolbarStyle: ToolbarStyle;
        coloringBookEnabled: boolean;
        orientation: OrientationChoice;
        saveOnDeleteEnabled: boolean;
        message: string;
      })
  | (Choices & ColorSettings & { status: 'saving'; message: string })
  | (Choices & ColorSettings & { status: 'ready'; saved: boolean; message: string });
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
// The shipping defaults: the authored loudness from both sources.
export const DEFAULT_SOUND_SOURCE_SETTINGS: SoundSourceSettings = {
  soundVolume: SOUND_VOLUME_DEFAULT,
  drawingSoundEnabled: true,
  deleteSoundEnabled: true,
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

function readSoundSourceSettings(value: object): SoundSourceSettings {
  const soundVolume = 'soundVolume' in value ? value.soundVolume : undefined;
  if (!isSoundVolume(soundVolume)) throw new Error('Volume is invalid.');
  const drawingSoundEnabled = 'drawingSoundEnabled' in value ? value.drawingSoundEnabled : null;
  const deleteSoundEnabled = 'deleteSoundEnabled' in value ? value.deleteSoundEnabled : null;
  if (typeof drawingSoundEnabled !== 'boolean' || typeof deleteSoundEnabled !== 'boolean')
    throw new Error('Sound source choice is invalid.');
  return { soundVolume, drawingSoundEnabled, deleteSoundEnabled };
}

// Before version 13 a record held a three-step level, or nothing before version 7.
function migrateSoundSourceSettings(hasSoundLevel: boolean, value: object): SoundSourceSettings {
  return {
    ...DEFAULT_SOUND_SOURCE_SETTINGS,
    ...(hasSoundLevel
      ? { soundVolume: legacySoundLevelVolume('soundLevel' in value ? value.soundLevel : null) }
      : {}),
  };
}

export function sessionPaint({ selectedColor, customColors }: ColorSettings): ColorSettings {
  return { selectedColor, customColors };
}

function canonical<T>(settings: T, snapshot: string): T {
  if (JSON.stringify(settings) !== snapshot)
    throw new Error('Sound settings are not in the saved format.');
  return settings;
}

function readParentPreferences(value: unknown) {
  if (
    !value ||
    typeof value !== 'object' ||
    !('aiEnabled' in value) ||
    !('parentPolicies' in value)
  )
    throw new Error('Parent Center settings are invalid.');
  const { aiEnabled, parentPolicies } = value;
  if (typeof aiEnabled !== 'boolean') throw new Error('Parent Center settings are invalid.');
  if (
    'version' in value &&
    (value.version === 12 ||
      value.version === 13 ||
      value.version === 14 ||
      value.version === 15 ||
      value.version === 16)
  ) {
    if (!isParentPolicies(parentPolicies)) throw new Error('Parent Center settings are invalid.');
    return { aiEnabled, parentPolicies: orderedParentPolicies(parentPolicies) };
  }
  if (!isParentPoliciesBeforeExternalLinks(parentPolicies))
    throw new Error('Parent Center settings are invalid.');
  return {
    aiEnabled,
    parentPolicies: {
      ai: parentPolicies.ai,
      imageReport: parentPolicies.imageReport,
      feedback: parentPolicies.feedback,
      parentCenter: parentPolicies.parentCenter,
    },
  };
}

function readStoredParentSettings(
  value: object & { version: unknown },
  widths: WidthSettings & { soundEnabled: boolean },
  storedPaint: ColorSettings | null,
  appearance: AppearancePreference,
  snapshot: string
): SoundSettings {
  const paintless = value.version === 16;
  const aiStyled = paintless || value.version === 15;
  const drawered = aiStyled || value.version === 14;
  const sourced = drawered || value.version === 13;
  const linksPolicy = sourced || value.version === 12;
  const pencilled = linksPolicy || value.version === 11;
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
  const hasSoundLevel = !sourced && kept('soundLevel');
  const sound = sourced
    ? readSoundSourceSettings(value)
    : migrateSoundSourceSettings(hasSoundLevel, value);
  const toolbarStyle =
    sourced && 'toolbarStyle' in value ? value.toolbarStyle : DEFAULT_TOOLBAR_STYLE;
  if (!isToolbarStyle(toolbarStyle)) throw new Error('Button style choice is invalid.');
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
  const ai = aiStyled ? readAiPreferences(value) : DEFAULT_AI_PREFERENCES;
  canonical(
    {
      version: value.version,
      ...widths,
      ...storedPaint,
      appearance,
      ...parent,
      ...(value.version === 5 ? {} : { coloringBookEnabled }),
      ...(hasSoundLevel && 'soundLevel' in value ? { soundLevel: value.soundLevel } : {}),
      ...(sourced ? sound : {}),
      ...(kept('undoButtonEnabled') ? { undoButtonEnabled: controls.undoButtonEnabled } : {}),
      ...(kept('strokeWidthControlEnabled')
        ? { strokeWidthControlEnabled: controls.strokeWidthControlEnabled }
        : {}),
      ...(complete ? { orientation } : {}),
      ...(savesOnDelete ? { saveOnDeleteEnabled } : {}),
      ...(accessible ? accessibility : {}),
      ...(pencilled ? pencil : {}),
      ...(sourced ? { toolbarStyle } : {}),
      ...(drawered
        ? {
            toolDrawerEnabled: controls.toolDrawerEnabled,
            screenshotEnabled: controls.screenshotEnabled,
          }
        : {}),
      ...(aiStyled ? ai : {}),
    },
    snapshot
  );
  return {
    version: SOUND_SETTINGS_VERSION,
    ...widths,
    appearance,
    ...parent,
    parentPolicies: availablePolicies(
      orderedParentPolicies({
        externalLinks: DEFAULT_PARENT_PREFERENCES.parentPolicies.externalLinks,
        imageReport: 'always',
        ...parent.parentPolicies,
      }),
      PARENT_PLATFORM,
      DEFAULT_PARENT_PREFERENCES.parentPolicies
    ),
    coloringBookEnabled,
    ...sound,
    ...controls,
    orientation,
    saveOnDeleteEnabled,
    ...accessibility,
    ...pencil,
    toolbarStyle,
    ...ai,
  };
}

function migrateLegacyChoices(
  choices: Partial<WidthSettings & { appearance: AppearancePreference }> & {
    soundEnabled: boolean;
  }
): SoundSettings {
  return {
    version: SOUND_SETTINGS_VERSION,
    coloringBookEnabled: DEFAULT_COLORING_BOOK_ENABLED,
    ...MIGRATED_PARENT_PREFERENCES,
    ...DEFAULT_WIDTH_SETTINGS,
    appearance: DEFAULT_APPEARANCE,
    toolbarStyle: DEFAULT_TOOLBAR_STYLE,
    ...DEFAULT_SOUND_SOURCE_SETTINGS,
    ...DEFAULT_DRAWING_CONTROL_PREFERENCES,
    orientation: defaultOrientation(),
    saveOnDeleteEnabled: DEFAULT_SAVE_ON_DELETE_ENABLED,
    ...DEFAULT_ACCESSIBILITY_SETTINGS,
    ...DEFAULT_PENCIL_SETTINGS,
    ...DEFAULT_AI_PREFERENCES,
    ...choices,
  };
}

// Versions 3 to 15 also saved the paint. It is still validated, so the record stays strict, and
// then dropped.
function readStoredPaint(value: object): ColorSettings {
  if (
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
  return { selectedColor: value.selectedColor, customColors: value.customColors };
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
      value.version !== 12 &&
      value.version !== 13 &&
      value.version !== 14 &&
      value.version !== 15 &&
      value.version !== 16) ||
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
  const storedPaint = value.version === 16 ? null : readStoredPaint(value);
  if (value.version === 3) {
    canonical({ version: 3, ...widths, ...storedPaint }, snapshot);
    return migrateLegacyChoices(widths);
  }
  if (!('appearance' in value) || !isAppearancePreference(value.appearance))
    throw new Error('Appearance choice is invalid.');
  if (value.version === 4) {
    canonical({ version: 4, ...widths, ...storedPaint, appearance: value.appearance }, snapshot);
    return migrateLegacyChoices({ ...widths, appearance: value.appearance });
  }
  return readStoredParentSettings(value, widths, storedPaint, value.appearance, snapshot);
}

export function snapshot(state: Choices): SoundSettings {
  return {
    version: SOUND_SETTINGS_VERSION,
    soundEnabled: state.soundEnabled,
    strokeWidth: state.strokeWidth,
    eraserWidth: state.eraserWidth,
    appearance: state.appearance,
    aiEnabled: state.aiEnabled,
    parentPolicies: orderedParentPolicies(state.parentPolicies),
    coloringBookEnabled: state.coloringBookEnabled,
    soundVolume: state.soundVolume,
    drawingSoundEnabled: state.drawingSoundEnabled,
    deleteSoundEnabled: state.deleteSoundEnabled,
    undoButtonEnabled: state.undoButtonEnabled,
    strokeWidthControlEnabled: state.strokeWidthControlEnabled,
    orientation: state.orientation,
    saveOnDeleteEnabled: state.saveOnDeleteEnabled,
    buttonScale: state.buttonScale,
    reduceMotion: state.reduceMotion,
    whatsNewSeen: state.whatsNewSeen,
    pencilEraserEnabled: state.pencilEraserEnabled,
    applePencilSeen: state.applePencilSeen,
    toolbarStyle: state.toolbarStyle,
    toolDrawerEnabled: state.toolDrawerEnabled,
    screenshotEnabled: state.screenshotEnabled,
    aiCustomizationEnabled: state.aiCustomizationEnabled,
    autoSaveAiEnabled: state.autoSaveAiEnabled,
  };
}
