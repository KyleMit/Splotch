import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCESS_TOKEN_HEADER, API_KEY_HEADER, INSTALLATION_ID_HEADER } from '$lib/apiHeaders';

const INSTALLATION_ID = vi.hoisted(() => 'a'.repeat(64));

vi.mock('$lib/state/freeGenerations.svelte', () => ({
  installationId: vi.fn(async () => INSTALLATION_ID),
}));

import { installationId } from '$lib/state/freeGenerations.svelte';
import { settingsState } from '$lib/state/settings.svelte';
import { aiCredentialHeaders } from './credentials';

const API_KEY = 'sk-proj-parent-key';
const ACCESS_TOKEN = 'sunny-meadow';

const HEADERS_BY_KIND = {
  apiKey: { [API_KEY_HEADER]: API_KEY },
  accessCode: { [ACCESS_TOKEN_HEADER]: ACCESS_TOKEN },
  none: { [INSTALLATION_ID_HEADER]: INSTALLATION_ID },
} satisfies Record<ReturnType<typeof settingsState.aiCredentialKind>, Record<string, string>>;

beforeEach(() => {
  vi.mocked(installationId).mockClear();
});

afterEach(() => {
  settingsState.mirrorAiUserApiKey('');
  settingsState.mirrorAiAccessToken('');
});

describe('aiCredentialHeaders', () => {
  // Every presence combination, so the request credential and the one Settings
  // reports as active cannot drift apart (issue #960 was the two disagreeing).
  it.each([
    { apiKey: API_KEY, accessToken: ACCESS_TOKEN, kind: 'apiKey' },
    { apiKey: API_KEY, accessToken: '', kind: 'apiKey' },
    { apiKey: '', accessToken: ACCESS_TOKEN, kind: 'accessCode' },
    { apiKey: '', accessToken: '', kind: 'none' },
  ] as const)(
    'sends the $kind credential when key is "$apiKey" and token is "$accessToken"',
    async ({ apiKey, accessToken, kind }) => {
      settingsState.mirrorAiUserApiKey(apiKey);
      settingsState.mirrorAiAccessToken(accessToken);

      expect(settingsState.aiCredentialKind()).toBe(kind);
      expect(await aiCredentialHeaders()).toEqual(HEADERS_BY_KIND[kind]);
    }
  );

  it('mints the installation id only for the free tier', async () => {
    settingsState.mirrorAiAccessToken(ACCESS_TOKEN);
    await aiCredentialHeaders();
    expect(installationId).not.toHaveBeenCalled();

    settingsState.mirrorAiAccessToken('');
    await aiCredentialHeaders();
    expect(installationId).toHaveBeenCalledOnce();
  });
});
