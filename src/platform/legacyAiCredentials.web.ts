import { STORAGE_KEYS } from '../lib/storageKeys';

// Older shipping web builds kept AI credentials in plaintext localStorage. The cutover does not
// carry them into the vault (settled data loss), but they must not stay readable by any script on
// the origin, so every launch removes them without reading them (issue 3016).
export const LEGACY_PLAINTEXT_AI_CREDENTIALS = [
  STORAGE_KEYS.legacyAiUserApiKey,
  STORAGE_KEYS.legacyAiAccessToken,
] as const;

// A browser that blocks site data throws on the `localStorage` getter itself; such storage holds
// nothing to remove.
function siteStorage(): Pick<Storage, 'removeItem'> | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function removeLegacyAiCredentials(storage = siteStorage()) {
  if (!storage) return;
  for (const key of LEGACY_PLAINTEXT_AI_CREDENTIALS) {
    try {
      storage.removeItem(key);
    } catch {
      // A refused write leaves the launch running; the next launch tries again.
    }
  }
}
