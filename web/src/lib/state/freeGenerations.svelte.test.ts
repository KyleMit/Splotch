import { beforeEach, describe, expect, it } from 'vitest';
import { persistedStateStatus } from '$lib/boot/persistedStateStatus.svelte';
import { settings } from './settings.svelte';
import { grantRefreshReady } from './freeGenerations.svelte';

beforeEach(() => {
  persistedStateStatus.hydrated = false;
  settings.aiImageEnabled = true;
  settings.aiUserApiKey = '';
  settings.aiAccessToken = '';
});

describe('grantRefreshReady', () => {
  it('waits for credential hydration before allowing the pseudonymous status request', () => {
    expect(grantRefreshReady()).toBe(false);

    persistedStateStatus.hydrated = true;
    expect(grantRefreshReady()).toBe(true);
  });

  it('stays false for disabled, BYOK, and managed-access paths', () => {
    persistedStateStatus.hydrated = true;

    settings.aiImageEnabled = false;
    expect(grantRefreshReady()).toBe(false);

    settings.aiImageEnabled = true;
    settings.aiUserApiKey = 'parent-key';
    expect(grantRefreshReady()).toBe(false);

    settings.aiUserApiKey = '';
    settings.aiAccessToken = 'managed-code';
    expect(grantRefreshReady()).toBe(false);
  });
});
