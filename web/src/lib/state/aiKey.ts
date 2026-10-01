import { STORAGE_KEYS } from '../storage';
import { dev } from '$app/environment';
import { looksLikeRetiredGeminiKey } from '../ai/keyFormat';
import { saveApiKey, loadApiKey, clearApiKey } from '../secureStorage';
import { requestPersistentStorage } from '../idb';
import { settingsState } from './settings.svelte';
import { createSecureCredentialCoordinator } from './secureCredentialCoordinator';

// The parent's own AI provider API key (BYOK). Stored only on this device and sent
// with each AI request so the server bills the parent's own provider account
// instead of ours. Either this OR aiAccessToken being set unlocks the AI features.
// The key is persisted only in secure storage (Keychain/Keystore on native, an
// encrypted IndexedDB payload on the web), never as plaintext.

async function persistAiUserApiKey(v: string) {
  if (v) await saveApiKey(v);
  else await clearApiKey();
}

const aiKeyWriteCoordinator = createSecureCredentialCoordinator(
  { read: () => settingsState.aiUserApiKey, write: settingsState.mirrorAiUserApiKey },
  persistAiUserApiKey
);

export const setAiUserApiKey = aiKeyWriteCoordinator.setCredential;

export async function setUserSubmittedAiUserApiKey(value: string, ownsRequest?: () => boolean) {
  const persisted = await setAiUserApiKey(value, ownsRequest);
  // Best-effort, and only after a successful explicit save: requesting during
  // boot hydration makes Firefox prompt parents who have not touched the feature
  // (ADR-0128).
  if (persisted && value) void requestPersistentStorage();
  return persisted;
}

// Dev-harness scenario for the Settings E2E regression: it reaches the otherwise
// timing-dependent state through the real persistence and coordinator paths.
export async function prepareRefusedAiKeyForget(value: string) {
  if (!dev && !__DEV_HARNESS__) throw new Error('Credential test scenario is unavailable');
  const persisted = await setAiUserApiKey(value);
  if (!persisted) throw new Error('Credential test scenario could not save the key');
  await aiKeyWriteCoordinator
    .runHydration(() => Promise.reject(new Error('forced secure storage failure')))
    .catch(() => undefined);
}

export function hydrateApiKey() {
  return aiKeyWriteCoordinator.hydrate({
    load: loadApiKey,
    legacyKey: STORAGE_KEYS.legacyAiUserApiKey,
    // Deleting is driven by recognising the retired shape, not by failing to
    // recognise the current one: a destructive step keyed off a negation removes
    // anything a future key format is not yet known to be. A key of the retired
    // shape is not a working credential for the provider the app calls
    // (ADR-0113) — restoring it would leave AI switched on and fail every
    // generation with an upstream error the parent cannot act on, while
    // forgetting it puts Settings back into the state that explains what to do.
    isRetired: looksLikeRetiredGeminiKey,
  });
}
