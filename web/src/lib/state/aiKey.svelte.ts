import { readString, removeKey } from '../storage';
import { saveApiKey, loadApiKey, clearApiKey, requestPersistentStorage } from '../secureStorage';
import { settings } from './settings.svelte';

// The parent's own Gemini API key (BYOK). Stored only on this device and sent
// with each AI request so the server bills the parent's Google account instead
// of ours. Either this OR aiAccessToken being set unlocks the AI features.
// The key itself is no longer kept here in plaintext — it lives in secure
// storage (Keychain/Keystore on native, an encrypted IndexedDB payload on the
// web). This constant only names the legacy localStorage slot so hydrateApiKey
// can migrate and scrub any key written by an earlier build.
const AI_USER_API_KEY = 'splotch-ai-user-api-key';

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

  if (!key) {
    const legacy = readString(AI_USER_API_KEY, '');
    if (legacy) {
      await saveApiKey(legacy);
      removeKey(AI_USER_API_KEY); // remove the plaintext copy now that it's secured
      key = legacy;
    }
  }

  if (key) settings.aiUserApiKey = key;
}
