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

export type WidthSettings = Readonly<{ strokeWidth: StrokeWidth; eraserWidth: StrokeWidth }>;
type ColorSettings = Readonly<{ selectedColor: PaintColor; customColors: readonly CustomColor[] }>;
type Choices = WidthSettings &
  ColorSettings &
  Readonly<{ soundEnabled: boolean; appearance: AppearancePreference }>;
export type SoundSettings = Choices & Readonly<{ version: 4 }>;
export type SoundSettingsState =
  | (WidthSettings &
      ColorSettings & {
        status: 'loading';
        soundEnabled: false;
        appearance: AppearancePreference;
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
export const DEFAULT_WIDTH_SETTINGS: WidthSettings = {
  strokeWidth: DEFAULT_STROKE_WIDTH,
  eraserWidth: DEFAULT_STROKE_WIDTH,
};

function canonical<T>(settings: T, snapshot: string): T {
  if (JSON.stringify(settings) !== snapshot)
    throw new Error('Sound settings are not in the saved format.');
  return settings;
}

export function parseSoundSettings(snapshot: string): SoundSettings {
  if (snapshot.length > MAX_SETTINGS_BYTES) throw new Error('Sound settings are too large.');
  const value: unknown = JSON.parse(snapshot);
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('version' in value) ||
    (value.version !== 1 && value.version !== 2 && value.version !== 3 && value.version !== 4) ||
    !('soundEnabled' in value) ||
    typeof value.soundEnabled !== 'boolean'
  )
    throw new Error('Sound settings are invalid.');
  if (value.version === 1) {
    canonical({ version: 1, soundEnabled: value.soundEnabled }, snapshot);
    return {
      version: 4,
      soundEnabled: value.soundEnabled,
      ...DEFAULT_WIDTH_SETTINGS,
      ...DEFAULT_COLOR_SETTINGS,
      appearance: DEFAULT_APPEARANCE,
    };
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
    return { version: 4, ...widths, ...DEFAULT_COLOR_SETTINGS, appearance: DEFAULT_APPEARANCE };
  }
  if (
    (value.version !== 3 && value.version !== 4) ||
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
    return { version: 4, ...widths, ...colors, appearance: DEFAULT_APPEARANCE };
  }
  if (!('appearance' in value) || !isAppearancePreference(value.appearance))
    throw new Error('Appearance choice is invalid.');
  return canonical({ version: 4, ...widths, ...colors, appearance: value.appearance }, snapshot);
}

function snapshot(state: Choices): SoundSettings {
  return {
    version: 4,
    soundEnabled: state.soundEnabled,
    strokeWidth: state.strokeWidth,
    eraserWidth: state.eraserWidth,
    selectedColor: state.selectedColor,
    customColors: state.customColors,
    appearance: state.appearance,
  };
}

export function createSoundSettings(
  storage: SoundSettingsStorage,
  onChange: (state: SoundSettingsState) => void
) {
  let state: SoundSettingsState = {
    status: 'loading',
    soundEnabled: false,
    ...DEFAULT_WIDTH_SETTINGS,
    ...DEFAULT_COLOR_SETTINGS,
    appearance: DEFAULT_APPEARANCE,
    message: '',
  };
  let disposed = false;
  let readFailed = false;
  function publish(next: SoundSettingsState) {
    if (disposed) return;
    state = next;
    onChange(state);
  }
  async function persist(settings: SoundSettings) {
    readFailed = false;
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
  return {
    async load() {
      if (disposed || state.status !== 'loading') return;
      try {
        const stored = await storage.read();
        const settings =
          stored === null
            ? {
                version: 4,
                soundEnabled: DEFAULT_SOUND_ENABLED,
                ...DEFAULT_WIDTH_SETTINGS,
                ...DEFAULT_COLOR_SETTINGS,
                appearance: DEFAULT_APPEARANCE,
              }
            : parseSoundSettings(stored);
        const { version: _version, ...choices } = settings;
        publish({ status: 'ready', ...choices, saved: true, message: '' });
      } catch {
        readFailed = true;
        publish({
          status: 'ready',
          soundEnabled: false,
          ...DEFAULT_WIDTH_SETTINGS,
          ...DEFAULT_COLOR_SETTINGS,
          appearance: DEFAULT_APPEARANCE,
          saved: false,
          message:
            'Drawing settings could not be read. Sound is off. Your choices work for this session. Choose your settings and retry saving.',
        });
      }
    },
    async setEnabled(soundEnabled: boolean) {
      if (disposed || state.status !== 'ready') return;
      if (typeof soundEnabled !== 'boolean') throw new Error('Sound choice is invalid.');
      await persist({ ...snapshot(state), soundEnabled });
    },
    async setWidth(tool: 'drawing' | 'eraser', width: StrokeWidth) {
      if (disposed || state.status !== 'ready') return;
      if ((tool !== 'drawing' && tool !== 'eraser') || !isStrokeWidth(width))
        throw new Error('Drawing width choice is invalid.');
      const choices = {
        strokeWidth: tool === 'drawing' ? width : state.strokeWidth,
        eraserWidth: tool === 'eraser' ? width : state.eraserWidth,
      };
      if (readFailed) {
        publish({ ...state, ...choices });
        return;
      }
      await persist({ ...snapshot(state), ...choices });
    },
    async setColor(selectedColor: PaintColor) {
      if (disposed || state.status !== 'ready') return;
      if (!isPaintColor(selectedColor)) throw new Error('Paint color is invalid.');
      const choices = {
        selectedColor,
        customColors: isCustomColor(selectedColor)
          ? rememberColor(state.customColors, selectedColor)
          : state.customColors,
      };
      if (readFailed) {
        publish({ ...state, ...choices });
        return;
      }
      await persist({ ...snapshot(state), ...choices });
    },
    async setAppearance(appearance: AppearancePreference) {
      if (disposed || state.status !== 'ready') return;
      if (!isAppearancePreference(appearance)) throw new Error('Appearance choice is invalid.');
      if (readFailed) {
        publish({ ...state, appearance });
        return;
      }
      await persist({ ...snapshot(state), appearance });
    },
    async retrySave() {
      if (disposed || state.status !== 'ready' || state.saved) return;
      await persist(snapshot(state));
    },
    dispose() {
      disposed = true;
    },
  };
}
