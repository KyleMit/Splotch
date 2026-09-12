import { readString, writeString } from '$lib/storage';
import { STORAGE_KEYS } from '$lib/storageKeys';

// Held for the session so a browser that refuses storage keeps one identity instead of deriving
// a fresh one on every page load, which would hand that browser a new free-generation grant each
// time. Its own module so the behaviour has a production caller and a direct test: the only
// exported entry point above it memoises a promise, which would mask whether this held the value
// or the memo above it did.
let unstoredInstallationId: string | null = null;

export function webInstallationId(): string {
  const stored = readString(STORAGE_KEYS.freeGenerationInstallation, null);
  if (stored) return stored;
  if (unstoredInstallationId) return unstoredInstallationId;
  const created = crypto.randomUUID();
  // writeString degrades quietly, so a refused write leaves the value in memory and nothing else
  // changes.
  writeString(STORAGE_KEYS.freeGenerationInstallation, created);
  unstoredInstallationId = created;
  return created;
}
