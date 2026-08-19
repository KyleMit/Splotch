import { AI_ACCESS_TOKEN_PARAM } from '$lib/inviteLink';
import { clearAccessCode, loadAccessCode, saveAccessCode } from '../secureStorage';
import { readString, removeKey, STORAGE_KEYS } from '../storage';
import { settings } from './settings.svelte';
import { createSecureCredentialCoordinator } from './secureCredentialCoordinator';

async function persistAiAccessToken(value: string) {
  if (value) await saveAccessCode(value);
  else await clearAccessCode();
}

const aiAccessTokenCoordinator = createSecureCredentialCoordinator(
  settings,
  'aiAccessToken',
  persistAiAccessToken
);

export const setAiAccessToken = aiAccessTokenCoordinator.setCredential;

export function hydrateAiAccessToken() {
  return aiAccessTokenCoordinator.runHydration(async (ownsHydration) => {
    let token = await loadAccessCode();
    const legacy = readString(STORAGE_KEYS.legacyAiAccessToken, '');
    if (!ownsHydration()) return;

    if (!token && legacy && !settings.aiAccessToken) {
      await saveAccessCode(legacy);
      token = legacy;
    }

    if (legacy) removeKey(STORAGE_KEYS.legacyAiAccessToken);
    if (settings.aiAccessToken) return;
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
