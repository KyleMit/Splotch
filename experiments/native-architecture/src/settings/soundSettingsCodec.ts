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
import {
  readLegacyParentPreferences,
  isParentPolicies,
  type ParentPreferences,
} from '../parentCenter/parentPolicy';

export type WidthSettings = Readonly<{ strokeWidth: StrokeWidth; eraserWidth: StrokeWidth }>;
type ColorSettings = Readonly<{
  selectedColor: PaintColor;
  customColors: readonly CustomColor[];
}>;
export type Choices = WidthSettings &
  DrawingControlPreferences &
  ColorSettings &
  ParentPreferences &
  Readonly<{
    soundEnabled: boolean;
    soundLevel: SoundLevel;
    appearance: AppearancePreference;
    coloringBookEnabled: boolean;
  }>;
export type SoundSettings = Choices & Readonly<{ version: 7 }>;
export type SoundSettingsState =
  | (WidthSettings &
      DrawingControlPreferences &
      ColorSettings &
      ParentPreferences & {
        status: 'loading';
        soundEnabled: false;
        soundLevel: SoundLevel;
        appearance: AppearancePreference;
        coloringBookEnabled: boolean;
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
  const parent =
    value.version === 7 ? readParentPreferences(value) : readLegacyParentPreferences(value);
  const coloringBookEnabled =
    value.version === 5
      ? DEFAULT_COLORING_BOOK_ENABLED
      : 'coloringBookEnabled' in value && typeof value.coloringBookEnabled === 'boolean'
        ? value.coloringBookEnabled
        : null;
  if (coloringBookEnabled === null) throw new Error('Coloring book choice is invalid.');
  const hasSoundLevel = value.version === 7 && 'soundLevel' in value;
  const soundLevel =
    hasSoundLevel && 'soundLevel' in value ? value.soundLevel : DEFAULT_SOUND_LEVEL;
  if (!isSoundLevel(soundLevel)) throw new Error('Sound level is invalid.');
  const controls = readDrawingControlPreferences(value);
  canonical(
    {
      version: value.version,
      ...widths,
      ...colors,
      appearance,
      ...parent,
      ...(value.version === 5 ? {} : { coloringBookEnabled }),
      ...(hasSoundLevel ? { soundLevel } : {}),
      ...(value.version === 7 && 'undoButtonEnabled' in value
        ? { undoButtonEnabled: controls.undoButtonEnabled }
        : {}),
      ...(value.version === 7 && 'strokeWidthControlEnabled' in value
        ? { strokeWidthControlEnabled: controls.strokeWidthControlEnabled }
        : {}),
    },
    snapshot
  );
  return {
    version: 7,
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
  };
}

function migrateLegacyChoices(
  choices: Partial<WidthSettings & ColorSettings & { appearance: AppearancePreference }> & {
    soundEnabled: boolean;
  }
): SoundSettings {
  return {
    version: 7,
    coloringBookEnabled: DEFAULT_COLORING_BOOK_ENABLED,
    ...MIGRATED_PARENT_PREFERENCES,
    ...DEFAULT_WIDTH_SETTINGS,
    ...DEFAULT_COLOR_SETTINGS,
    appearance: DEFAULT_APPEARANCE,
    soundLevel: DEFAULT_SOUND_LEVEL,
    ...DEFAULT_DRAWING_CONTROL_PREFERENCES,
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
      value.version !== 7) ||
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
      value.version !== 7) ||
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
    version: 7,
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
  };
}
