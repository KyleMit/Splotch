import { STORAGE_KEYS, readString, removeKey } from '../storage';
import { looksLikeRetiredGeminiKey } from '../ai/keyFormat';
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

  // Hydration lost the race, so it must not act on what it read. `loadApiKey()`
  // above is awaited, and a parent can finish entering a key inside that window;
  // that write goes through the coordinator, which exists so an older write
  // cannot land on a newer one. Everything below is an older write — the delete
  // does not go through that queue at all, and the assignment would put the
  // value that preceded the save back into the live store. Whatever arrived
  // while this was reading is newer than anything read here.
  if (settings.aiUserApiKey) return;

  // Deleting is driven by recognising the retired shape, not by failing to
  // recognise the current one: a destructive step keyed off a negation removes
  // anything a future key format is not yet known to be. A key for the provider
  // the app used to call is not a working credential any more (ADR-0113) —
  // restoring it would leave AI switched on and fail every generation with an
  // upstream error the parent cannot act on, while forgetting it puts Settings
  // back into the state that explains what to do.
  if (key && looksLikeRetiredGeminiKey(key)) {
    await clearApiKey();
    return;
  }

  if (key) settings.aiUserApiKey = key;
}
