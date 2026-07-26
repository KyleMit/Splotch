import { STORAGE_KEYS, readString, removeKey } from '../storage';
import { saveApiKey, loadApiKey, clearApiKey } from '../secureStorage';
import { requestPersistentStorage } from '../idb';
import { settings } from './settings.svelte';

// The parent's own Gemini API key (BYOK). Stored only on this device and sent
// with each AI request so the server bills the parent's Google account instead
// of ours. Either this OR aiAccessToken being set unlocks the AI features.
// The key itself is no longer kept here in plaintext — it lives in secure
// storage (Keychain/Keystore on native, an encrypted IndexedDB payload on the
// web).

let aiKeyWriteVersion = 0;
// Keep secure writes ordered so an older save already in flight cannot finish
// after a replacement and become the credential restored on the next launch.
let aiKeyWriteQueue = Promise.resolve();

async function persistAiUserApiKey(v: string) {
  if (v) await saveApiKey(v);
  else await clearApiKey();
}

export function setAiUserApiKey(v: string, ownsRequest: () => boolean = () => true) {
  const writeVersion = ++aiKeyWriteVersion;
  const operation = aiKeyWriteQueue.then(async () => {
    if (writeVersion !== aiKeyWriteVersion || !ownsRequest()) return false;

    await persistAiUserApiKey(v);

    if (writeVersion !== aiKeyWriteVersion) return false;
    if (!ownsRequest()) {
      await persistAiUserApiKey(settings.aiUserApiKey);
      return false;
    }

    settings.aiUserApiKey = v;
    return true;
  });
  aiKeyWriteQueue = operation.then(
    () => undefined,
    () => undefined
  );
  return operation;
}

// Pull the saved Gemini key out of secure storage into the live store on boot.
// One-time migration: if an earlier build left a plaintext key in localStorage,
// move it into secure storage and scrub the plaintext copy. Safe to call on the
// web and on native; never throws.
export async function hydrateApiKey() {
  // Best-effort: ask the browser not to evict our encrypted IndexedDB (web only).
  requestPersistentStorage();

  let key = await loadApiKey();
  const legacy = readString(STORAGE_KEYS.legacyAiUserApiKey, '');

  if (!key && legacy) {
    await saveApiKey(legacy);
    key = legacy;
  }

  if (legacy) removeKey(STORAGE_KEYS.legacyAiUserApiKey);
  if (key) settings.aiUserApiKey = key;
}
