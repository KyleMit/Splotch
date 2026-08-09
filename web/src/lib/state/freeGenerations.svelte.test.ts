import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistedStateStatus } from '$lib/boot/persistedStateStatus.svelte';
import { network } from './network.svelte';
import { settings } from './settings.svelte';
import {
  createFreeGenerationGrantRefreshGate,
  freeGenerations,
  grantRefreshReady,
  refreshFreeGenerationGrant,
} from './freeGenerations.svelte';

beforeEach(() => {
  persistedStateStatus.hydrated = false;
  settings.aiImageEnabled = true;
  settings.aiUserApiKey = '';
  settings.aiAccessToken = '';
  network.online = true;
  freeGenerations.remaining = 10;
  freeGenerations.loading = true;
  freeGenerations.available = false;
});

afterEach(() => vi.unstubAllGlobals());

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

  it('re-arms a failed status request so a reconnect can recover the free path', async () => {
    const shouldRefresh = createFreeGenerationGrantRefreshGate();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(Response.json({ ok: true, remaining: 7, limit: 10 }, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    persistedStateStatus.hydrated = true;
    expect(shouldRefresh()).toBe(true);
    await refreshFreeGenerationGrant();
    expect(freeGenerations).toMatchObject({ available: false, loading: false });

    expect(shouldRefresh()).toBe(false);
    network.online = false;
    expect(shouldRefresh()).toBe(false);
    network.online = true;
    expect(shouldRefresh()).toBe(true);

    await refreshFreeGenerationGrant();
    expect(freeGenerations).toMatchObject({ available: true, loading: false, remaining: 7 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
