import { AI_ACCESS_TOKEN_PARAM } from '$lib/inviteLink';
import { clearAccessCode, loadAccessCode, saveAccessCode } from '../secureStorage';
import { readString, removeKey, STORAGE_KEYS } from '../storage';
import { settings } from './settings.svelte';

async function persistAiAccessToken(value: string) {
  if (value) await saveAccessCode(value);
  else await clearAccessCode();
}

export function createAiAccessTokenCoordinator(
  tokenState: { aiAccessToken: string },
  persistToken: (value: string) => Promise<void>
) {
  let writeVersion = 0;
  let writeQueue = Promise.resolve();

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = writeQueue.then(operation);
    writeQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  function setAiAccessToken(value: string, ownsRequest: () => boolean = () => true) {
    const version = ++writeVersion;
    return enqueue(async () => {
      if (version !== writeVersion || !ownsRequest()) return false;

      await persistToken(value);

      if (version !== writeVersion) return false;
      if (!ownsRequest()) {
        await persistToken(tokenState.aiAccessToken);
        return false;
      }

      tokenState.aiAccessToken = value;
      return true;
    });
  }

  function runHydration(operation: (ownsHydration: () => boolean) => Promise<void>) {
    const version = writeVersion;
    return enqueue(() => operation(() => version === writeVersion));
  }

  return { setAiAccessToken, runHydration };
}

const aiAccessTokenCoordinator = createAiAccessTokenCoordinator(settings, persistAiAccessToken);

export const { setAiAccessToken } = aiAccessTokenCoordinator;

export function hydrateAiAccessToken() {
  return aiAccessTokenCoordinator.runHydration(async (ownsHydration) => {
    let token = await loadAccessCode();
    const legacy = readString(STORAGE_KEYS.legacyAiAccessToken, '');
    if (!ownsHydration()) return;

    if (!token && legacy) {
      await saveAccessCode(legacy);
      token = legacy;
    }

    if (legacy) removeKey(STORAGE_KEYS.legacyAiAccessToken);
    if (ownsHydration() && token) settings.aiAccessToken = token;
  });
}

export async function captureAiAccessTokenFromUrl() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const token = url.searchParams.get(AI_ACCESS_TOKEN_PARAM);
  if (!token) return;

  const persisted = await setAiAccessToken(token);
  if (!persisted) return;
  url.searchParams.delete(AI_ACCESS_TOKEN_PARAM);
  window.history.replaceState({}, '', url);
}
