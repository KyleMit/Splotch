import { STORAGE_KEYS } from '../../../../web/src/lib/storageKeys';

// Older shipping web builds kept AI credentials in plaintext localStorage. The cutover does not
// carry them into the vault (settled data loss), but they must not stay readable by any script on
// the origin, so every launch removes them without reading them (issue 3016).
export const LEGACY_PLAINTEXT_AI_CREDENTIALS = [
  STORAGE_KEYS.legacyAiUserApiKey,
  STORAGE_KEYS.legacyAiAccessToken,
] as const;

export function removeLegacyAiCredentials(storage: Pick<Storage, 'removeItem'> = localStorage) {
  for (const key of LEGACY_PLAINTEXT_AI_CREDENTIALS) {
    try {
      storage.removeItem(key);
    } catch {
      // Storage the browser refuses (a private window, blocked site data) holds nothing to remove.
    }
  }
}
