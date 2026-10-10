export type SoundSettings = Readonly<{ version: 1; soundEnabled: boolean }>;
export type SoundSettingsState =
  | { status: 'loading'; soundEnabled: false; message: string }
  | { status: 'saving'; soundEnabled: boolean; message: string }
  | { status: 'ready'; soundEnabled: boolean; saved: boolean; message: string };
export type SoundSettingsStorage = {
  read: () => Promise<string | null>;
  write: (snapshot: string) => Promise<void>;
};
export const MAX_SETTINGS_BYTES = 1024;
const DEFAULT_SOUND_ENABLED = true;

export function parseSoundSettings(snapshot: string): SoundSettings {
  if (snapshot.length > MAX_SETTINGS_BYTES) throw new Error('Sound settings are too large.');
  const value: unknown = JSON.parse(snapshot);
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('version' in value) ||
    value.version !== 1 ||
    !('soundEnabled' in value) ||
    typeof value.soundEnabled !== 'boolean' ||
    Object.keys(value).length !== 2
  )
    throw new Error('Sound settings are invalid.');
  const settings: SoundSettings = { version: 1, soundEnabled: value.soundEnabled };
  if (JSON.stringify(settings) !== snapshot)
    throw new Error('Sound settings are not in the saved format.');
  return settings;
}

export function createSoundSettings(
  storage: SoundSettingsStorage,
  onChange: (state: SoundSettingsState) => void
) {
  let state: SoundSettingsState = { status: 'loading', soundEnabled: false, message: '' };
  let disposed = false;
  function publish(next: SoundSettingsState) {
    if (disposed) return;
    state = next;
    onChange(state);
  }
  async function persist(soundEnabled: boolean) {
    publish({ status: 'saving', soundEnabled, message: '' });
    try {
      await storage.write(JSON.stringify({ version: 1, soundEnabled } satisfies SoundSettings));
      publish({ status: 'ready', soundEnabled, saved: true, message: '' });
    } catch {
      publish({
        status: 'ready',
        soundEnabled,
        saved: false,
        message: 'Your sound choice works for this session, but could not be saved. Please retry.',
      });
    }
  }
  return {
    async load() {
      if (disposed || state.status !== 'loading') return;
      try {
        const snapshot = await storage.read();
        const soundEnabled =
          snapshot === null ? DEFAULT_SOUND_ENABLED : parseSoundSettings(snapshot).soundEnabled;
        publish({ status: 'ready', soundEnabled, saved: true, message: '' });
      } catch {
        publish({
          status: 'ready',
          soundEnabled: false,
          saved: false,
          message:
            'Sound settings could not be read. Sound is off. Choose your setting and retry saving.',
        });
      }
    },
    async setEnabled(soundEnabled: boolean) {
      if (disposed || state.status !== 'ready') return;
      await persist(soundEnabled);
    },
    async retrySave() {
      if (disposed || state.status !== 'ready' || state.saved) return;
      await persist(state.soundEnabled);
    },
    dispose() {
      disposed = true;
    },
  };
}
