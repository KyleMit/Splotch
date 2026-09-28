import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPersistedStateStatus,
  type PersistedStateStatus,
} from '$lib/boot/persistedStateStatus.svelte';
import { createNetwork, type NetworkState } from './network.svelte';
import { createSettings, type SettingsState } from './settings.svelte';
import { createTool } from './tool.svelte';
import { createFreeGenerations, type FreeGenerationsState } from './freeGenerations.svelte';
import { STORAGE_KEYS } from '$lib/storage';

function deferred<T>(): {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T) => void;
} {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

function grantResponse(remaining: number): {
  json: ReturnType<typeof vi.spyOn>;
  response: Response;
} {
  const response = Response.json({ ok: true, remaining, limit: 10 }, { status: 200 });
  return { json: vi.spyOn(response, 'json'), response };
}

function requestSignal(fetchMock: ReturnType<typeof vi.fn>, callIndex: number): AbortSignal {
  const signal = fetchMock.mock.calls[callIndex]?.[1]?.signal;
  if (!(signal instanceof AbortSignal)) throw new Error('Expected grant request abort signal');
  return signal;
}

// Every case gets its own store and dependencies: AI on with no credential, the
// network online, hydration not yet landed, the grant loading with no count.
let persistedStateStatus: PersistedStateStatus;
let networkState: NetworkState;
let settingsState: SettingsState;
let freeGenerationsState: FreeGenerationsState;

beforeEach(() => {
  localStorage.clear();
  persistedStateStatus = createPersistedStateStatus();
  networkState = createNetwork();
  settingsState = createSettings(createTool());
  settingsState.setAiImage(true);
  networkState.setOnline(true);
  freeGenerationsState = createFreeGenerations({
    settings: settingsState,
    network: networkState,
    persistedStateStatus,
  });
  freeGenerationsState.install();
});

afterEach(() => {
  freeGenerationsState.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('free-count display hint', () => {
  it.each([
    [null, 10],
    ['7', 7],
    ['0', 0],
    ['unavailable', null],
    ['invalid', 10],
  ] as const)('reads cached %s as %s before grant hydration', (cached, expected) => {
    freeGenerationsState.dispose();
    if (cached !== null) localStorage.setItem(STORAGE_KEYS.freeGenerationBadgeHint, cached);
    freeGenerationsState = createFreeGenerations({
      settings: settingsState,
      network: networkState,
      persistedStateStatus,
    });

    expect(freeGenerationsState.badgeRemaining).toBe(expected);
    expect(freeGenerationsState).toMatchObject({
      grant: { status: 'loading' },
      lastGrantRemaining: null,
    });
  });

  it('persists grant counts and an unavailable result without changing grant authority', () => {
    expect(freeGenerationsState).toMatchObject({
      badgeRemaining: 10,
      grant: { status: 'loading' },
    });

    freeGenerationsState.setFreeGenerationsRemaining(7);
    expect(freeGenerationsState).toMatchObject({ badgeRemaining: 7, lastGrantRemaining: 7 });
    expect(freeGenerationsState.grant).toEqual({ status: 'available', remaining: 7 });
    expect(localStorage.getItem(STORAGE_KEYS.freeGenerationBadgeHint)).toBe('7');

    freeGenerationsState.setFreeGenerationsUnavailable();
    expect(freeGenerationsState.badgeRemaining).toBeNull();
    expect(freeGenerationsState.grant).toEqual({ status: 'unavailable' });
    expect(localStorage.getItem(STORAGE_KEYS.freeGenerationBadgeHint)).toBe('unavailable');
  });

  it('keeps the last badge hint when AI is disabled', () => {
    freeGenerationsState.setFreeGenerationsRemaining(7);
    persistedStateStatus.markHydrated();
    settingsState.setAiImage(false);
    flushSync();

    expect(freeGenerationsState.badgeRemaining).toBe(7);
    expect(localStorage.getItem(STORAGE_KEYS.freeGenerationBadgeHint)).toBe('7');
  });

  it('hides the free badge on the next startup when a credential is used', () => {
    freeGenerationsState.setFreeGenerationsRemaining(7);
    persistedStateStatus.markHydrated();
    settingsState.mirrorAiUserApiKey('parent-key');
    flushSync();

    expect(freeGenerationsState.badgeRemaining).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.freeGenerationBadgeHint)).toBe('unavailable');
  });
});

describe('grant mode', () => {
  it('starts loading with no count known', () => {
    expect(freeGenerationsState.grant).toEqual({ status: 'loading' });
    expect(freeGenerationsState.lastGrantRemaining).toBeNull();
  });

  it.each([
    [7, 7],
    [12, 10],
    [-3, 0],
    [4.9, 4],
  ])('carries an answered count of %s as %s', (answered, remaining) => {
    freeGenerationsState.setFreeGenerationsRemaining(answered);

    expect(freeGenerationsState.grant).toEqual({ status: 'available', remaining });
    expect(freeGenerationsState.lastGrantRemaining).toBe(remaining);
  });

  it('goes inactive when AI is off with no credential, keeping the last answered count', () => {
    freeGenerationsState.setFreeGenerationsRemaining(7);
    persistedStateStatus.markHydrated();
    settingsState.setAiImage(false);
    flushSync();

    expect(freeGenerationsState.grant).toEqual({ status: 'inactive' });
    expect(freeGenerationsState.lastGrantRemaining).toBe(7);
  });

  it('goes unavailable when a credential is saved, keeping the last answered count', () => {
    freeGenerationsState.setFreeGenerationsRemaining(7);
    persistedStateStatus.markHydrated();
    settingsState.mirrorAiUserApiKey('parent-key');
    flushSync();

    expect(freeGenerationsState.grant).toEqual({ status: 'unavailable' });
    expect(freeGenerationsState.lastGrantRemaining).toBe(7);
  });

  it('stays inactive with no count when AI starts off', () => {
    settingsState.setAiImage(false);
    persistedStateStatus.markHydrated();
    flushSync();

    expect(freeGenerationsState.grant).toEqual({ status: 'inactive' });
    expect(freeGenerationsState.lastGrantRemaining).toBeNull();
  });
});

describe('grantRefreshReady', () => {
  it('waits for credential hydration before allowing the pseudonymous status request', () => {
    expect(freeGenerationsState.grantRefreshReady()).toBe(false);

    persistedStateStatus.markHydrated();
    expect(freeGenerationsState.grantRefreshReady()).toBe(true);
  });

  it('stays false for disabled, BYOK, and managed-access paths', () => {
    persistedStateStatus.markHydrated();

    settingsState.setAiImage(false);
    expect(freeGenerationsState.grantRefreshReady()).toBe(false);

    settingsState.setAiImage(true);
    settingsState.mirrorAiUserApiKey('parent-key');
    expect(freeGenerationsState.grantRefreshReady()).toBe(false);

    settingsState.mirrorAiUserApiKey('');
    settingsState.mirrorAiAccessToken('managed-code');
    expect(freeGenerationsState.grantRefreshReady()).toBe(false);
  });

  it('re-arms a failed status request so a reconnect can recover the free path', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(Response.json({ ok: true, remaining: 7, limit: 10 }, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    persistedStateStatus.markHydrated();
    flushSync();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(freeGenerationsState.grant).toEqual({ status: 'unavailable' }));

    flushSync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    networkState.setOnline(false);
    flushSync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    networkState.setOnline(true);
    flushSync();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(freeGenerationsState.grant).toEqual({ status: 'available', remaining: 7 })
    );
  });

  it('waits while an eligible grant is offline and marks an ineligible grant unavailable', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    persistedStateStatus.markHydrated();
    networkState.setOnline(false);
    flushSync();
    expect(freeGenerationsState.grant).toEqual({ status: 'loading' });
    expect(fetchMock).not.toHaveBeenCalled();

    settingsState.mirrorAiUserApiKey('parent-key');
    flushSync();
    expect(freeGenerationsState.grant).toEqual({ status: 'unavailable' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores an eligible response after the free path becomes ineligible', async () => {
    const pending = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal('fetch', fetchMock);

    persistedStateStatus.markHydrated();
    flushSync();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const signal = requestSignal(fetchMock, 0);

    settingsState.mirrorAiUserApiKey('parent-key');
    flushSync();
    expect(signal.aborted).toBe(true);
    expect(freeGenerationsState).toMatchObject({
      grant: { status: 'unavailable' },
      lastGrantRemaining: null,
    });

    const stale = grantResponse(3);
    pending.resolve(stale.response);
    await vi.waitFor(() => expect(stale.json).toHaveBeenCalledOnce());
    expect(freeGenerationsState).toMatchObject({
      grant: { status: 'unavailable' },
      lastGrantRemaining: null,
    });
  });

  it('does not restart a pending request when refresh state is unchanged', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const pending = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal('fetch', fetchMock);

    persistedStateStatus.markHydrated();
    flushSync();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const signal = requestSignal(fetchMock, 0);

    flushSync();
    freeGenerationsState.retryOnVisibleReturn();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(signal.aborted).toBe(false);

    pending.resolve(grantResponse(6).response);
    await vi.waitFor(() =>
      expect(freeGenerationsState.grant).toEqual({ status: 'available', remaining: 6 })
    );
    freeGenerationsState.retryOnVisibleReturn();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('cancels a request in flight on dispose and asks afresh on reinstall', async () => {
    const pending = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal('fetch', fetchMock);

    persistedStateStatus.markHydrated();
    flushSync();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const signal = requestSignal(fetchMock, 0);

    freeGenerationsState.dispose();
    expect(signal.aborted).toBe(true);

    const stale = grantResponse(4);
    pending.resolve(stale.response);
    await vi.waitFor(() => expect(stale.json).toHaveBeenCalledOnce());
    expect(freeGenerationsState).toMatchObject({
      grant: { status: 'loading' },
      lastGrantRemaining: null,
    });

    freeGenerationsState.install();
    flushSync();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('keeps the reconnect result when the older request settles first', async () => {
    const older = deferred<Response>();
    const newer = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    vi.stubGlobal('fetch', fetchMock);

    persistedStateStatus.markHydrated();
    flushSync();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const olderSignal = requestSignal(fetchMock, 0);

    networkState.setOnline(false);
    flushSync();
    networkState.setOnline(true);
    flushSync();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(olderSignal.aborted).toBe(true);

    const olderResponse = grantResponse(2);
    older.resolve(olderResponse.response);
    await vi.waitFor(() => expect(olderResponse.json).toHaveBeenCalledOnce());
    expect(freeGenerationsState).toMatchObject({
      grant: { status: 'loading' },
      lastGrantRemaining: null,
    });

    newer.resolve(grantResponse(7).response);
    await vi.waitFor(() =>
      expect(freeGenerationsState.grant).toEqual({ status: 'available', remaining: 7 })
    );
  });

  it('keeps the reconnect result when the newer request settles first', async () => {
    const older = deferred<Response>();
    const newer = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    vi.stubGlobal('fetch', fetchMock);

    persistedStateStatus.markHydrated();
    flushSync();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    networkState.setOnline(false);
    flushSync();
    networkState.setOnline(true);
    flushSync();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    newer.resolve(grantResponse(7).response);
    await vi.waitFor(() =>
      expect(freeGenerationsState.grant).toEqual({ status: 'available', remaining: 7 })
    );
    const olderResponse = grantResponse(2);
    older.resolve(olderResponse.response);
    await vi.waitFor(() => expect(olderResponse.json).toHaveBeenCalledOnce());
    expect(freeGenerationsState.grant).toEqual({ status: 'available', remaining: 7 });
  });

  it('ignores an invalidated failure after a newer request succeeds', async () => {
    const older = deferred<Response>();
    const newer = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    vi.stubGlobal('fetch', fetchMock);

    persistedStateStatus.markHydrated();
    flushSync();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    networkState.setOnline(false);
    flushSync();
    networkState.setOnline(true);
    flushSync();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    newer.resolve(grantResponse(8).response);
    await vi.waitFor(() =>
      expect(freeGenerationsState.grant).toEqual({ status: 'available', remaining: 8 })
    );
    older.reject(new Error('stale failure'));
    await vi.waitFor(() =>
      expect(freeGenerationsState.grant).toEqual({ status: 'available', remaining: 8 })
    );
  });

  it('retries a transient status failure while online without waiting for a reconnect', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValue(Response.json({ ok: true, remaining: 7, limit: 10 }, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    persistedStateStatus.markHydrated();
    flushSync();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(freeGenerationsState.grant).toEqual({ status: 'unavailable' }));

    visibility.mockReturnValue('hidden');
    freeGenerationsState.retryOnVisibleReturn();
    expect(fetchMock).toHaveBeenCalledOnce();
    visibility.mockReturnValue('visible');
    freeGenerationsState.retryOnVisibleReturn();

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(freeGenerationsState.grant).toEqual({ status: 'available', remaining: 7 })
    );
  });

  it.each([
    [
      'offline',
      () => {
        networkState.setOnline(false);
      },
    ],
    [
      'AI disabled',
      () => {
        settingsState.setAiImage(false);
      },
    ],
    [
      'a parent key',
      () => {
        settingsState.mirrorAiUserApiKey('parent-key');
      },
    ],
    [
      'a managed code',
      () => {
        settingsState.mirrorAiAccessToken('managed-code');
      },
    ],
  ])('does not retry on visibility return with %s', async (_label, makeIneligible) => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const fetchMock = vi.fn().mockRejectedValue(new Error('connection reset'));
    vi.stubGlobal('fetch', fetchMock);
    persistedStateStatus.markHydrated();
    flushSync();
    await vi.waitFor(() => expect(freeGenerationsState.grant).toEqual({ status: 'unavailable' }));

    makeIneligible();
    freeGenerationsState.retryOnVisibleReturn();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(freeGenerationsState.grant).toEqual({ status: 'unavailable' });
  });

  it('ignores an invalidated malformed response after a newer request succeeds', async () => {
    const older = deferred<Response>();
    const newer = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    vi.stubGlobal('fetch', fetchMock);

    persistedStateStatus.markHydrated();
    flushSync();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    networkState.setOnline(false);
    flushSync();
    networkState.setOnline(true);
    flushSync();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    newer.resolve(grantResponse(8).response);
    await vi.waitFor(() =>
      expect(freeGenerationsState.grant).toEqual({ status: 'available', remaining: 8 })
    );
    const stale = Response.json({ ok: true, remaining: 'seven' });
    const staleJson = vi.spyOn(stale, 'json');
    older.resolve(stale);
    await vi.waitFor(() => expect(staleJson).toHaveBeenCalledOnce());
    expect(freeGenerationsState.grant).toEqual({ status: 'available', remaining: 8 });
  });

  it.each([
    ['no remaining count', { ok: true, limit: 10 }],
    ['a non-numeric remaining count', { ok: true, remaining: 'seven', limit: 10 }],
    ['no ok flag', {}],
    ['a false ok flag', { ok: false, remaining: 7 }],
    ['a truthy non-boolean ok flag', { ok: 'true', remaining: 7 }],
    ['a null body', null],
    ['an array body', []],
  ])('settles a 200 grant response with %s as unavailable', async (_label, body) => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(body, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    persistedStateStatus.markHydrated();
    flushSync();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    await vi.waitFor(() => expect(freeGenerationsState.grant).toEqual({ status: 'unavailable' }));
    expect(freeGenerationsState).toMatchObject({
      grant: { status: 'unavailable' },
      lastGrantRemaining: null,
    });
  });

  it('settles a non-finite remaining count as unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{"ok":true,"remaining":1e400}'))
    );

    persistedStateStatus.markHydrated();
    flushSync();

    await vi.waitFor(() => expect(freeGenerationsState.grant).toEqual({ status: 'unavailable' }));
    expect(freeGenerationsState).toMatchObject({
      grant: { status: 'unavailable' },
      lastGrantRemaining: null,
    });
  });
});
