import { STORAGE_KEYS, readString, removeKey } from '../storage';
import { looksLikeApiKey } from '../ai/keyFormat';
import { saveApiKey, loadApiKey, clearApiKey } from '../secureStorage';
import { requestPersistentStorage } from '../idb';
import { settings } from './settings.svelte';

// The parent's own AI provider API key (BYOK). Stored only on this device and sent
// with each AI request so the server bills the parent's own provider account
// instead of ours. Either this OR aiAccessToken being set unlocks the AI features.
// The key itself is no longer kept here in plaintext — it lives in secure
// storage (Keychain/Keystore on native, an encrypted IndexedDB payload on the
// web).

async function persistAiUserApiKey(v: string) {
  if (v) await saveApiKey(v);
  else await clearApiKey();
}

export function createAiKeyWriteCoordinator(
  aiKeyState: { aiUserApiKey: string },
  persistKey: (value: string) => Promise<void>
) {
  let writeVersion = 0;
  // Keep secure writes ordered so an older save already in flight cannot finish
  // after a replacement and become the credential restored on the next launch.
  let writeQueue = Promise.resolve();

  function setAiUserApiKey(v: string, ownsRequest: () => boolean = () => true) {
    const version = ++writeVersion;
    const operation = writeQueue.then(async () => {
      if (version !== writeVersion || !ownsRequest()) return false;

      await persistKey(v);

      if (version !== writeVersion) return false;
      if (!ownsRequest()) {
        await persistKey(aiKeyState.aiUserApiKey);
        return false;
      }

      aiKeyState.aiUserApiKey = v;
      return true;
    });
    writeQueue = operation.then(
      () => undefined,
      () => undefined
    );
    return operation;
  }

  return { setAiUserApiKey };
}

const aiKeyWriteCoordinator = createAiKeyWriteCoordinator(settings, persistAiUserApiKey);

export const { setAiUserApiKey } = aiKeyWriteCoordinator;

// Pull the saved API key out of secure storage into the live store on boot.
// One-time migration: if an earlier build left a plaintext key in localStorage,
// move it into secure storage and scrub the plaintext copy. Safe to call on the
// web and on native; never throws.
export async function hydrateApiKey() {
  // Best-effort: ask the browser not to evict our encrypted IndexedDB (web only).
  void requestPersistentStorage();

  let key = await loadApiKey();
  const legacy = readString(STORAGE_KEYS.legacyAiUserApiKey, '');

  if (!key && legacy) {
    await saveApiKey(legacy);
    key = legacy;
  }

  if (legacy) removeKey(STORAGE_KEYS.legacyAiUserApiKey);

  // A key for the provider the app used to call is not a working credential any
  // more (ADR-0113). Restoring it would leave AI switched on and fail every
  // generation with an upstream error the parent cannot act on; forgetting it
  // puts Settings back into the state that explains what to do. The stored copy
  // goes too, so this costs one decryption rather than repeating every launch.
  if (key && !looksLikeApiKey(key)) {
    await clearApiKey();
    return;
  }

  if (key) settings.aiUserApiKey = key;
}
