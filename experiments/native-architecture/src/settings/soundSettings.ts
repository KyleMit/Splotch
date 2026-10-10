import { DEFAULT_STROKE_WIDTH, isStrokeWidth, type StrokeWidth } from '../drawing/strokeWidth';

export type WidthSettings = Readonly<{ strokeWidth: StrokeWidth; eraserWidth: StrokeWidth }>;
export type SoundSettings = WidthSettings & Readonly<{ version: 2; soundEnabled: boolean }>;
export type SoundSettingsState =
  | (WidthSettings & { status: 'loading'; soundEnabled: false; message: string })
  | (WidthSettings & { status: 'saving'; soundEnabled: boolean; message: string })
  | (WidthSettings & { status: 'ready'; soundEnabled: boolean; saved: boolean; message: string });
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

export function parseSoundSettings(snapshot: string): SoundSettings {
  if (snapshot.length > MAX_SETTINGS_BYTES) throw new Error('Sound settings are too large.');
  const value: unknown = JSON.parse(snapshot);
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('version' in value) ||
    (value.version !== 1 && value.version !== 2) ||
    !('soundEnabled' in value) ||
    typeof value.soundEnabled !== 'boolean'
  )
    throw new Error('Sound settings are invalid.');
  if (value.version === 1) {
    const previous = { version: 1, soundEnabled: value.soundEnabled };
    if (JSON.stringify(previous) !== snapshot)
      throw new Error('Sound settings are not in the saved format.');
    return { version: 2, soundEnabled: value.soundEnabled, ...DEFAULT_WIDTH_SETTINGS };
  }
  if (
    !('strokeWidth' in value) ||
    !isStrokeWidth(value.strokeWidth) ||
    !('eraserWidth' in value) ||
    !isStrokeWidth(value.eraserWidth)
  )
    throw new Error('Drawing widths are invalid.');
  const settings: SoundSettings = {
    version: 2,
    soundEnabled: value.soundEnabled,
    strokeWidth: value.strokeWidth,
    eraserWidth: value.eraserWidth,
  };
  if (JSON.stringify(settings) !== snapshot)
    throw new Error('Sound settings are not in the saved format.');
  return settings;
}

export function createSoundSettings(
  storage: SoundSettingsStorage,
  onChange: (state: SoundSettingsState) => void
) {
  let state: SoundSettingsState = {
    status: 'loading',
    soundEnabled: false,
    ...DEFAULT_WIDTH_SETTINGS,
    message: '',
  };
  let disposed = false;
  function publish(next: SoundSettingsState) {
    if (disposed) return;
    state = next;
    onChange(state);
  }
  async function persist(settings: SoundSettings) {
    const { soundEnabled, strokeWidth, eraserWidth } = settings;
    const choices = { soundEnabled, strokeWidth, eraserWidth };
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
        const snapshot = await storage.read();
        const settings =
          snapshot === null
            ? { version: 2, soundEnabled: DEFAULT_SOUND_ENABLED, ...DEFAULT_WIDTH_SETTINGS }
            : parseSoundSettings(snapshot);
        const { soundEnabled, strokeWidth, eraserWidth } = settings;
        publish({
          status: 'ready',
          soundEnabled,
          strokeWidth,
          eraserWidth,
          saved: true,
          message: '',
        });
      } catch {
        publish({
          status: 'ready',
          soundEnabled: false,
          ...DEFAULT_WIDTH_SETTINGS,
          saved: false,
          message:
            'Drawing settings could not be read. Sound is off and widths use Medium. Choose your settings and retry saving.',
        });
      }
    },
    async setEnabled(soundEnabled: boolean) {
      if (disposed || state.status !== 'ready') return;
      if (typeof soundEnabled !== 'boolean') throw new Error('Sound choice is invalid.');
      await persist({
        version: 2,
        soundEnabled,
        strokeWidth: state.strokeWidth,
        eraserWidth: state.eraserWidth,
      });
    },
    async setWidth(tool: 'drawing' | 'eraser', width: StrokeWidth) {
      if (disposed || state.status !== 'ready') return;
      if ((tool !== 'drawing' && tool !== 'eraser') || !isStrokeWidth(width))
        throw new Error('Drawing width choice is invalid.');
      await persist({
        version: 2,
        soundEnabled: state.soundEnabled,
        strokeWidth: tool === 'drawing' ? width : state.strokeWidth,
        eraserWidth: tool === 'eraser' ? width : state.eraserWidth,
      });
    },
    async retrySave() {
      if (disposed || state.status !== 'ready' || state.saved) return;
      await persist({
        version: 2,
        soundEnabled: state.soundEnabled,
        strokeWidth: state.strokeWidth,
        eraserWidth: state.eraserWidth,
      });
    },
    dispose() {
      disposed = true;
    },
  };
}
