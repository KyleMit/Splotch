import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_ACCESS_TOKEN_PARAM } from '$lib/inviteLink';

const secureStore = vi.hoisted(() => ({ accessCode: null as string | null }));

vi.mock('../secureStorage', () => ({
  saveAccessCode: vi.fn(async (value: string) => {
    secureStore.accessCode = value;
  }),
  loadAccessCode: vi.fn(async () => secureStore.accessCode),
  clearAccessCode: vi.fn(async () => {
    secureStore.accessCode = null;
  }),
}));

import { loadAccessCode, saveAccessCode } from '../secureStorage';
import { STORAGE_KEYS } from '../storage';
import { aiCredentialKind, settings } from './settings.svelte';
import {
  captureAiAccessTokenFromUrl,
  hydrateAiAccessToken,
  setAiAccessToken,
} from './aiAccessToken';

beforeEach(() => {
  localStorage.clear();
  secureStore.accessCode = null;
  settings.aiAccessToken = '';
  settings.aiUserApiKey = '';
  settings.aiImageEnabled = false;
  vi.mocked(saveAccessCode)
    .mockReset()
    .mockImplementation(async (value: string) => {
      secureStore.accessCode = value;
    });
  vi.mocked(loadAccessCode)
    .mockReset()
    .mockImplementation(async () => secureStore.accessCode);
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('setAiAccessToken', () => {
  it('commits the live code only after secure persistence succeeds', async () => {
    let finishSave!: () => void;
    vi.mocked(saveAccessCode).mockImplementationOnce(
      (value: string) =>
        new Promise<void>((resolve) => {
          finishSave = () => {
            secureStore.accessCode = value;
            resolve();
          };
        })
    );

    const saving = setAiAccessToken('managed-code');
    await vi.waitFor(() => expect(saveAccessCode).toHaveBeenCalledOnce());

    expect(settings.aiAccessToken).toBe('');
    finishSave();
    await saving;

    expect(settings.aiAccessToken).toBe('managed-code');
    expect(secureStore.accessCode).toBe('managed-code');
    expect(localStorage.getItem(STORAGE_KEYS.legacyAiAccessToken)).toBeNull();
  });

  it('keeps the live code empty when secure persistence rejects', async () => {
    vi.mocked(saveAccessCode).mockRejectedValueOnce(new Error('secure storage unavailable'));

    await expect(setAiAccessToken('rejected-code')).rejects.toThrow('secure storage unavailable');

    expect(settings.aiAccessToken).toBe('');
    expect(secureStore.accessCode).toBeNull();
  });
});

describe('hydrateAiAccessToken', () => {
  it('reports no credential until the secure value finishes hydrating', async () => {
    let finishLoad!: (value: string | null) => void;
    vi.mocked(loadAccessCode).mockImplementationOnce(
      () =>
        new Promise<string | null>((resolve) => {
          finishLoad = resolve;
        })
    );

    const hydrating = hydrateAiAccessToken();
    await vi.waitFor(() => expect(loadAccessCode).toHaveBeenCalledOnce());

    expect(aiCredentialKind()).toBe('none');
    finishLoad('stored-code');
    await hydrating;

    expect(aiCredentialKind()).toBe('accessCode');
    expect(settings.aiAccessToken).toBe('stored-code');
  });

  it('migrates a legacy plaintext code and scrubs the plaintext copy', async () => {
    localStorage.setItem(STORAGE_KEYS.legacyAiAccessToken, 'legacy-code');

    await hydrateAiAccessToken();

    expect(settings.aiAccessToken).toBe('legacy-code');
    expect(secureStore.accessCode).toBe('legacy-code');
    expect(localStorage.getItem(STORAGE_KEYS.legacyAiAccessToken)).toBeNull();
  });

  it('preserves the plaintext copy and leaves live state empty when migration fails', async () => {
    localStorage.setItem(STORAGE_KEYS.legacyAiAccessToken, 'retryable-code');
    vi.mocked(saveAccessCode).mockRejectedValueOnce(new Error('secure storage unavailable'));

    await expect(hydrateAiAccessToken()).rejects.toThrow('secure storage unavailable');

    expect(settings.aiAccessToken).toBe('');
    expect(localStorage.getItem(STORAGE_KEYS.legacyAiAccessToken)).toBe('retryable-code');
  });

  it('prefers the secure copy and scrubs a stale plaintext code', async () => {
    secureStore.accessCode = 'secure-code';
    localStorage.setItem(STORAGE_KEYS.legacyAiAccessToken, 'stale-code');

    await hydrateAiAccessToken();

    expect(settings.aiAccessToken).toBe('secure-code');
    expect(secureStore.accessCode).toBe('secure-code');
    expect(localStorage.getItem(STORAGE_KEYS.legacyAiAccessToken)).toBeNull();
  });

  it('keeps a URL-captured code when a later secure read reports no value', async () => {
    localStorage.setItem(STORAGE_KEYS.legacyAiAccessToken, 'old-revoked-code');
    window.history.replaceState({}, '', `/?${AI_ACCESS_TOKEN_PARAM}=fresh-invitation-code`);

    await captureAiAccessTokenFromUrl();
    vi.mocked(loadAccessCode).mockResolvedValueOnce(null);
    await hydrateAiAccessToken();

    expect(settings.aiAccessToken).toBe('fresh-invitation-code');
    expect(secureStore.accessCode).toBe('fresh-invitation-code');
    expect(localStorage.getItem(STORAGE_KEYS.legacyAiAccessToken)).toBeNull();
  });
});

describe('captureAiAccessTokenFromUrl', () => {
  it('scrubs the invitation parameter only after secure persistence succeeds', async () => {
    window.history.replaceState({}, '', `/?${AI_ACCESS_TOKEN_PARAM}=invitation-code&other=1`);

    await captureAiAccessTokenFromUrl();

    expect(settings.aiAccessToken).toBe('invitation-code');
    expect(settings.aiImageEnabled).toBe(true);
    expect(secureStore.accessCode).toBe('invitation-code');
    expect(window.location.search).toBe('?other=1');
  });

  it('keeps the invitation parameter and live state when secure persistence fails', async () => {
    vi.mocked(saveAccessCode).mockRejectedValueOnce(new Error('secure storage unavailable'));
    window.history.replaceState({}, '', `/?${AI_ACCESS_TOKEN_PARAM}=retry-code`);

    await expect(captureAiAccessTokenFromUrl()).rejects.toThrow('secure storage unavailable');

    expect(settings.aiAccessToken).toBe('');
    expect(window.location.search).toContain(`${AI_ACCESS_TOKEN_PARAM}=retry-code`);
  });

  it('keeps the invitation parameter when a newer credential supersedes its write', async () => {
    let finishInvitationSave!: () => void;
    vi.mocked(saveAccessCode).mockImplementationOnce(
      (value: string) =>
        new Promise<void>((resolve) => {
          finishInvitationSave = () => {
            secureStore.accessCode = value;
            resolve();
          };
        })
    );
    window.history.replaceState({}, '', `/?${AI_ACCESS_TOKEN_PARAM}=invitation-code`);

    const capturing = captureAiAccessTokenFromUrl();
    await vi.waitFor(() => expect(saveAccessCode).toHaveBeenCalledOnce());
    const newerWrite = setAiAccessToken('newer-code');
    finishInvitationSave();
    await capturing;
    await newerWrite;

    expect(settings.aiAccessToken).toBe('newer-code');
    expect(secureStore.accessCode).toBe('newer-code');
    expect(window.location.search).toContain(`${AI_ACCESS_TOKEN_PARAM}=invitation-code`);
  });

  it('does nothing when the invitation parameter is absent', async () => {
    window.history.replaceState({}, '', '/?other=1');

    await captureAiAccessTokenFromUrl();

    expect(settings.aiAccessToken).toBe('');
    expect(saveAccessCode).not.toHaveBeenCalled();
  });
});
