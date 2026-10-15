import {
  parseSoundSettings,
  SOUND_SETTINGS_VERSION,
  type SoundSettings,
  type SoundSettingsStorage,
} from './soundSettingsCodec';

// Why stored settings could not be used: the store did not answer, the record is not one any build
// wrote, or a newer build wrote it.
export type SettingsReadFailure = 'unavailable' | 'malformed' | 'newer';

// Reading again recovers only a store that did not answer; a record this build cannot use stays
// unusable, so its message asks for nothing a retry could do.
export const UNREAD_SETTINGS_MESSAGES: Record<SettingsReadFailure, string> = {
  unavailable:
    'Drawing settings could not be read. Sound is off. Your choices work for this session. Choose your settings and retry saving.',
  malformed:
    'Saved drawing settings are damaged. Sound is off, protection stays active, and your choices work for this session.',
  newer:
    'A newer version of Splotch saved these settings. Update Splotch to use them. Sound is off, protection stays active, and your choices work for this session.',
};

// Every version's canonical record opens with its integer version (SOUND_SETTINGS_VERSION).
const RECORD_VERSION = /^\{"version":(\d+),/;

// Only a record that parseSoundSettings refused comes here.
function unreadableRecord(snapshot: string): 'malformed' | 'newer' {
  const version = RECORD_VERSION.exec(snapshot)?.[1];
  return version !== undefined && Number(version) > SOUND_SETTINGS_VERSION ? 'newer' : 'malformed';
}

type StoredRead =
  | { kind: 'read'; settings: SoundSettings | null }
  | { kind: 'failed'; failure: SettingsReadFailure };

export async function readStoredSettings(storage: SoundSettingsStorage): Promise<StoredRead> {
  let stored: string | null;
  try {
    stored = await storage.read();
  } catch {
    return { kind: 'failed', failure: 'unavailable' };
  }
  if (stored === null) return { kind: 'read', settings: null };
  try {
    return { kind: 'read', settings: parseSoundSettings(stored) };
  } catch {
    return { kind: 'failed', failure: unreadableRecord(stored) };
  }
}
