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
  rememberColor,
  type CustomColor,
  type PaintColor,
} from '../drawing/palette';
import { DEFAULT_PARENT_PREFERENCES } from '../platform/parentDefaults';
import {
  readLegacyParentPreferences,
  isParentPolicies,
  PROTECTED_PARENT_POLICIES,
  type ParentPreferences,
} from '../parentCenter/parentPolicy';

export type WidthSettings = Readonly<{ strokeWidth: StrokeWidth; eraserWidth: StrokeWidth }>;
type ColorSettings = Readonly<{ selectedColor: PaintColor; customColors: readonly CustomColor[] }>;
type Choices = WidthSettings &
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
const DEFAULT_SOUND_ENABLED = true;
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
  canonical(
    {
      version: value.version,
      ...widths,
      ...colors,
      appearance,
      ...parent,
      ...(value.version === 5 ? {} : { coloringBookEnabled }),
      ...(hasSoundLevel ? { soundLevel } : {}),
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

function snapshot(state: Choices): SoundSettings {
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
  };
}

function initialSoundSettingsState(): SoundSettingsState {
  return {
    status: 'loading',
    coloringBookEnabled: DEFAULT_COLORING_BOOK_ENABLED,
    soundEnabled: false,
    soundLevel: DEFAULT_SOUND_LEVEL,
    ...DEFAULT_WIDTH_SETTINGS,
    ...DEFAULT_COLOR_SETTINGS,
    ...DEFAULT_PARENT_PREFERENCES,
    appearance: DEFAULT_APPEARANCE,
    message: '',
  };
}

function defaultSoundSettings(): SoundSettings {
  return {
    version: 7,
    coloringBookEnabled: DEFAULT_COLORING_BOOK_ENABLED,
    soundEnabled: DEFAULT_SOUND_ENABLED,
    soundLevel: DEFAULT_SOUND_LEVEL,
    ...DEFAULT_WIDTH_SETTINGS,
    ...DEFAULT_COLOR_SETTINGS,
    ...DEFAULT_PARENT_PREFERENCES,
    appearance: DEFAULT_APPEARANCE,
  };
}

function unreadSoundSettingsState(): SoundSettingsState {
  return {
    status: 'ready',
    coloringBookEnabled: false,
    soundEnabled: false,
    soundLevel: DEFAULT_SOUND_LEVEL,
    ...DEFAULT_WIDTH_SETTINGS,
    ...DEFAULT_COLOR_SETTINGS,
    aiEnabled: false,
    parentPolicies: PROTECTED_PARENT_POLICIES,
    appearance: DEFAULT_APPEARANCE,
    saved: false,
    message:
      'Drawing settings could not be read. Sound is off. Your choices work for this session. Choose your settings and retry saving.',
  };
}

function createDrawingPreferenceActions({
  getState,
  isDisposed,
  hasReadFailed,
  publish,
  persist,
}: {
  getState: () => SoundSettingsState;
  isDisposed: () => boolean;
  hasReadFailed: () => boolean;
  publish: (state: SoundSettingsState) => void;
  persist: (settings: SoundSettings) => Promise<void>;
}) {
  return {
    async setSoundLevel(soundLevel: SoundLevel) {
      const state = getState();
      if (isDisposed() || state.status !== 'ready') return;
      if (!isSoundLevel(soundLevel)) throw new Error('Sound level is invalid.');
      if (hasReadFailed()) {
        publish({ ...state, soundLevel });
        return;
      }
      await persist({ ...snapshot(state), soundLevel });
    },
    async setColoringBookEnabled(coloringBookEnabled: boolean) {
      const state = getState();
      if (isDisposed() || state.status !== 'ready') return;
      if (typeof coloringBookEnabled !== 'boolean')
        throw new Error('Coloring book choice is invalid.');
      if (hasReadFailed()) {
        publish({ ...state, coloringBookEnabled });
        return;
      }
      await persist({ ...snapshot(state), coloringBookEnabled });
    },
    async setEnabled(soundEnabled: boolean) {
      const state = getState();
      if (isDisposed() || state.status !== 'ready') return;
      if (typeof soundEnabled !== 'boolean') throw new Error('Sound choice is invalid.');
      if (hasReadFailed()) {
        publish({ ...state, soundEnabled });
        return;
      }
      await persist({ ...snapshot(state), soundEnabled });
    },
    async setWidth(tool: 'drawing' | 'eraser', width: StrokeWidth) {
      const state = getState();
      if (isDisposed() || state.status !== 'ready') return;
      if ((tool !== 'drawing' && tool !== 'eraser') || !isStrokeWidth(width))
        throw new Error('Drawing width choice is invalid.');
      const choices = {
        strokeWidth: tool === 'drawing' ? width : state.strokeWidth,
        eraserWidth: tool === 'eraser' ? width : state.eraserWidth,
      };
      if (hasReadFailed()) {
        publish({ ...state, ...choices });
        return;
      }
      await persist({ ...snapshot(state), ...choices });
    },
    async setColor(selectedColor: PaintColor) {
      const state = getState();
      if (isDisposed() || state.status !== 'ready') return;
      if (!isPaintColor(selectedColor)) throw new Error('Paint color is invalid.');
      const choices = {
        selectedColor,
        customColors: isCustomColor(selectedColor)
          ? rememberColor(state.customColors, selectedColor)
          : state.customColors,
      };
      if (hasReadFailed()) {
        publish({ ...state, ...choices });
        return;
      }
      await persist({ ...snapshot(state), ...choices });
    },
    async setAppearance(appearance: AppearancePreference) {
      const state = getState();
      if (isDisposed() || state.status !== 'ready') return;
      if (!isAppearancePreference(appearance)) throw new Error('Appearance choice is invalid.');
      if (hasReadFailed()) {
        publish({ ...state, appearance });
        return;
      }
      await persist({ ...snapshot(state), appearance });
    },
  };
}

export function createSoundSettings(
  storage: SoundSettingsStorage,
  onChange: (state: SoundSettingsState) => void
) {
  let state = initialSoundSettingsState();
  let disposed = false;
  let readFailed = false;
  let pendingParent: SoundSettings | null = null;
  function publish(next: SoundSettingsState) {
    if (disposed) return;
    state = next;
    onChange(state);
  }
  async function persist(settings: SoundSettings) {
    readFailed = false;
    pendingParent = null;
    const { version: _version, ...choices } = settings;
    publish({ status: 'saving', ...choices, message: '' });
    try {
      await storage.write(JSON.stringify(settings));
      publish({ status: 'ready', ...choices, saved: true, message: '' });
    } catch {
      publish({
        status: 'ready',
        ...choices,
        saved: false,
        message: 'Your settings work for this session, but could not be saved. Please retry.',
      });
    }
  }
  async function persistParent(settings: SoundSettings) {
    if (state.status !== 'ready' || readFailed) return;
    const previous = snapshot(state);
    pendingParent = settings;
    const { version: _version, ...choices } = previous;
    publish({ status: 'saving', ...choices, message: 'Saving Parent Center choices…' });
    try {
      await storage.write(JSON.stringify(settings));
      const { version: _nextVersion, ...next } = settings;
      pendingParent = null;
      publish({ status: 'ready', ...next, saved: true, message: 'Parent Center choices saved.' });
    } catch {
      publish({
        status: 'ready',
        ...choices,
        saved: false,
        message:
          'Parent Center choices were not saved. Previous protection is still active. Retry saving.',
      });
    }
  }
  return {
    async load() {
      if (disposed || state.status !== 'loading') return;
      try {
        const stored = await storage.read();
        const settings = stored === null ? defaultSoundSettings() : parseSoundSettings(stored);
        const { version: _version, ...choices } = settings;
        publish({ status: 'ready', ...choices, saved: true, message: '' });
      } catch {
        readFailed = true;
        publish(unreadSoundSettingsState());
      }
    },
    ...createDrawingPreferenceActions({
      getState: () => state,
      isDisposed: () => disposed,
      hasReadFailed: () => readFailed,
      publish,
      persist,
    }),
    async retrySave() {
      if (disposed || state.status !== 'ready' || state.saved) return;
      if (pendingParent) {
        publish({ ...state, message: 'Open Parent Center to retry saving its choices.' });
        return;
      }
      if (readFailed) {
        publish({ ...state, message: 'Read settings again before saving Parent Center choices.' });
        return;
      }
      await persist(snapshot(state));
    },
    async setParentPreferences(choices: ParentPreferences) {
      if (disposed || state.status !== 'ready' || readFailed) return;
      if (typeof choices.aiEnabled !== 'boolean' || !isParentPolicies(choices.parentPolicies))
        throw new Error('Parent Center choice is invalid.');
      await persistParent({ ...snapshot(state), ...choices });
    },
    async retryParentSave() {
      if (disposed || state.status !== 'ready' || !pendingParent || readFailed) return;
      await persistParent({
        ...snapshot(state),
        aiEnabled: pendingParent.aiEnabled,
        parentPolicies: pendingParent.parentPolicies,
      });
    },
    async retryRead() {
      if (disposed || state.status !== 'ready' || !readFailed) return;
      try {
        const stored = await storage.read();
        const next =
          stored === null
            ? { ...snapshot(state), ...DEFAULT_PARENT_PREFERENCES }
            : parseSoundSettings(stored);
        const { version: _version, ...choices } = next;
        readFailed = false;
        publish({ status: 'ready', ...choices, saved: true, message: '' });
      } catch {
        publish({
          ...state,
          message: 'Settings still could not be read. AI stays off and protection stays active.',
        });
      }
    },
    canEditParent: () => !disposed && !readFailed && state.status === 'ready',
    dispose() {
      disposed = true;
    },
  };
}
