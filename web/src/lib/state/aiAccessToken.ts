import { AI_ACCESS_TOKEN_PARAM } from '$lib/inviteLink';
import { clearAccessCode, loadAccessCode, saveAccessCode } from '../secureStorage';
import { requestPersistentStorage } from '../idb';
import { STORAGE_KEYS } from '../storage';
import { settingsState } from './settings.svelte';
import { createSecureCredentialCoordinator } from './secureCredentialCoordinator';

async function persistAiAccessToken(value: string) {
  if (value) await saveAccessCode(value);
  else await clearAccessCode();
}

const aiAccessTokenCoordinator = createSecureCredentialCoordinator(
  { read: () => settingsState.aiAccessToken, write: settingsState.mirrorAiAccessToken },
  persistAiAccessToken
);

export const setAiAccessToken = aiAccessTokenCoordinator.setCredential;

export async function setUserSubmittedAiAccessToken(value: string, ownsRequest?: () => boolean) {
  const persisted = await setAiAccessToken(value, ownsRequest);
  // Best-effort, and only after a successful explicit save: invite-link capture
  // is credential delivery, not the parent's opt-in action (ADR-0127/0128).
  if (persisted && value) void requestPersistentStorage();
  return persisted;
}

export function hydrateAiAccessToken() {
  return aiAccessTokenCoordinator.hydrate({
    load: loadAccessCode,
    legacyKey: STORAGE_KEYS.legacyAiAccessToken,
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
  history.replaceState(history.state, '', url);
}
