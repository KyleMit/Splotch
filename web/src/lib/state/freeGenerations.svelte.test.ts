import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistedStateStatus } from '$lib/boot/persistedStateStatus.svelte';
import { networkState } from './network.svelte';
import { settingsState } from './settings.svelte';
import {
  createFreeGenerationGrantRefresher,
  freeGenerationsState,
  grantRefreshReady,
} from './freeGenerations.svelte';

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

beforeEach(() => {
  persistedStateStatus.hydrated = false;
  settingsState.aiImageEnabled = true;
  settingsState.aiUserApiKey = '';
  settingsState.aiAccessToken = '';
  networkState.online = true;
  freeGenerationsState.remaining = 10;
  freeGenerationsState.loading = true;
  freeGenerationsState.available = false;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('grantRefreshReady', () => {
  it('waits for credential hydration before allowing the pseudonymous status request', () => {
    expect(grantRefreshReady()).toBe(false);

    persistedStateStatus.hydrated = true;
    expect(grantRefreshReady()).toBe(true);
  });

  it('stays false for disabled, BYOK, and managed-access paths', () => {
    persistedStateStatus.hydrated = true;

    settingsState.aiImageEnabled = false;
    expect(grantRefreshReady()).toBe(false);

    settingsState.aiImageEnabled = true;
    settingsState.aiUserApiKey = 'parent-key';
    expect(grantRefreshReady()).toBe(false);

    settingsState.aiUserApiKey = '';
    settingsState.aiAccessToken = 'managed-code';
    expect(grantRefreshReady()).toBe(false);
  });

  it('re-arms a failed status request so a reconnect can recover the free path', async () => {
    const refreshGrant = createFreeGenerationGrantRefresher();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(Response.json({ ok: true, remaining: 7, limit: 10 }, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    persistedStateStatus.hydrated = true;
    refreshGrant();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(freeGenerationsState.loading).toBe(false));
    expect(freeGenerationsState).toMatchObject({ available: false, loading: false });

    refreshGrant();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    networkState.online = false;
    refreshGrant();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    networkState.online = true;
    refreshGrant();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(freeGenerationsState.available).toBe(true));
    expect(freeGenerationsState).toMatchObject({ available: true, loading: false, remaining: 7 });
  });

  it('waits while an eligible grant is offline and marks an ineligible grant unavailable', () => {
    const refreshGrant = createFreeGenerationGrantRefresher();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    persistedStateStatus.hydrated = true;
    networkState.online = false;
    refreshGrant();
    expect(freeGenerationsState).toMatchObject({ available: false, loading: true });
    expect(fetchMock).not.toHaveBeenCalled();

    settingsState.aiUserApiKey = 'parent-key';
    refreshGrant();
    expect(freeGenerationsState).toMatchObject({ available: false, loading: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores an eligible response after the free path becomes ineligible', async () => {
    const refreshGrant = createFreeGenerationGrantRefresher();
    const pending = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal('fetch', fetchMock);

    persistedStateStatus.hydrated = true;
    refreshGrant();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const signal = requestSignal(fetchMock, 0);

    settingsState.aiUserApiKey = 'parent-key';
    refreshGrant();
    expect(signal.aborted).toBe(true);
    expect(freeGenerationsState).toMatchObject({ available: false, loading: false, remaining: 10 });

    const stale = grantResponse(3);
    pending.resolve(stale.response);
    await vi.waitFor(() => expect(stale.json).toHaveBeenCalledOnce());
    expect(freeGenerationsState).toMatchObject({ available: false, loading: false, remaining: 10 });
  });

  it('does not restart a pending request when refresh state is unchanged', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const refreshGrant = createFreeGenerationGrantRefresher();
    const pending = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal('fetch', fetchMock);

    persistedStateStatus.hydrated = true;
    refreshGrant();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const signal = requestSignal(fetchMock, 0);

    refreshGrant();
    refreshGrant(new Event('visibilitychange'));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(signal.aborted).toBe(false);

    pending.resolve(grantResponse(6).response);
    await vi.waitFor(() => expect(freeGenerationsState.remaining).toBe(6));
    refreshGrant(new Event('visibilitychange'));
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('lets a new refresher invalidate a request owned by an old instance', async () => {
    const oldRefreshGrant = createFreeGenerationGrantRefresher();
    const pending = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal('fetch', fetchMock);

    persistedStateStatus.hydrated = true;
    oldRefreshGrant();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const signal = requestSignal(fetchMock, 0);

    const newRefreshGrant = createFreeGenerationGrantRefresher();
    settingsState.aiUserApiKey = 'parent-key';
    newRefreshGrant();
    expect(signal.aborted).toBe(true);

    const stale = grantResponse(4);
    pending.resolve(stale.response);
    await vi.waitFor(() => expect(stale.json).toHaveBeenCalledOnce());
    expect(freeGenerationsState).toMatchObject({ available: false, loading: false, remaining: 10 });
  });

  it('keeps the reconnect result when the older request settles first', async () => {
    const refreshGrant = createFreeGenerationGrantRefresher();
    const older = deferred<Response>();
    const newer = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    vi.stubGlobal('fetch', fetchMock);

    persistedStateStatus.hydrated = true;
    refreshGrant();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const olderSignal = requestSignal(fetchMock, 0);

    networkState.online = false;
    refreshGrant();
    networkState.online = true;
    refreshGrant();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(olderSignal.aborted).toBe(true);

    const olderResponse = grantResponse(2);
    older.resolve(olderResponse.response);
    await vi.waitFor(() => expect(olderResponse.json).toHaveBeenCalledOnce());
    expect(freeGenerationsState).toMatchObject({ available: false, loading: true, remaining: 10 });

    newer.resolve(grantResponse(7).response);
    await vi.waitFor(() => expect(freeGenerationsState.remaining).toBe(7));
    expect(freeGenerationsState).toMatchObject({ available: true, loading: false, remaining: 7 });
  });

  it('keeps the reconnect result when the newer request settles first', async () => {
    const refreshGrant = createFreeGenerationGrantRefresher();
    const older = deferred<Response>();
    const newer = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    vi.stubGlobal('fetch', fetchMock);

    persistedStateStatus.hydrated = true;
    refreshGrant();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    networkState.online = false;
    refreshGrant();
    networkState.online = true;
    refreshGrant();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    newer.resolve(grantResponse(7).response);
    await vi.waitFor(() => expect(freeGenerationsState.remaining).toBe(7));
    const olderResponse = grantResponse(2);
    older.resolve(olderResponse.response);
    await vi.waitFor(() => expect(olderResponse.json).toHaveBeenCalledOnce());
    expect(freeGenerationsState).toMatchObject({ available: true, loading: false, remaining: 7 });
  });

  it('ignores an invalidated failure after a newer request succeeds', async () => {
    const refreshGrant = createFreeGenerationGrantRefresher();
    const older = deferred<Response>();
    const newer = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    vi.stubGlobal('fetch', fetchMock);

    persistedStateStatus.hydrated = true;
    refreshGrant();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    networkState.online = false;
    refreshGrant();
    networkState.online = true;
    refreshGrant();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    newer.resolve(grantResponse(8).response);
    await vi.waitFor(() => expect(freeGenerationsState.remaining).toBe(8));
    older.reject(new Error('stale failure'));
    await vi.waitFor(() => expect(freeGenerationsState.available).toBe(true));
    expect(freeGenerationsState).toMatchObject({ available: true, loading: false, remaining: 8 });
  });

  it('retries a transient status failure while online without waiting for a reconnect', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const refreshGrant = createFreeGenerationGrantRefresher();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValue(Response.json({ ok: true, remaining: 7, limit: 10 }, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    persistedStateStatus.hydrated = true;
    refreshGrant();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(freeGenerationsState.loading).toBe(false));

    visibility.mockReturnValue('hidden');
    refreshGrant(new Event('visibilitychange'));
    expect(fetchMock).toHaveBeenCalledOnce();
    visibility.mockReturnValue('visible');
    refreshGrant(new Event('visibilitychange'));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(freeGenerationsState.available).toBe(true));
    expect(freeGenerationsState).toMatchObject({ available: true, loading: false, remaining: 7 });
  });

  it.each([
    [
      'offline',
      () => {
        networkState.online = false;
      },
    ],
    [
      'AI disabled',
      () => {
        settingsState.aiImageEnabled = false;
      },
    ],
    [
      'a parent key',
      () => {
        settingsState.aiUserApiKey = 'parent-key';
      },
    ],
    [
      'a managed code',
      () => {
        settingsState.aiAccessToken = 'managed-code';
      },
    ],
  ])('does not retry on visibility return with %s', async (_label, makeIneligible) => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const refreshGrant = createFreeGenerationGrantRefresher();
    const fetchMock = vi.fn().mockRejectedValue(new Error('connection reset'));
    vi.stubGlobal('fetch', fetchMock);
    persistedStateStatus.hydrated = true;
    refreshGrant();
    await vi.waitFor(() => expect(freeGenerationsState.loading).toBe(false));

    makeIneligible();
    refreshGrant(new Event('visibilitychange'));

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(freeGenerationsState).toMatchObject({ available: false, loading: false });
  });

  it('ignores an invalidated malformed response after a newer request succeeds', async () => {
    const refreshGrant = createFreeGenerationGrantRefresher();
    const older = deferred<Response>();
    const newer = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    vi.stubGlobal('fetch', fetchMock);

    persistedStateStatus.hydrated = true;
    refreshGrant();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    networkState.online = false;
    refreshGrant();
    networkState.online = true;
    refreshGrant();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    newer.resolve(grantResponse(8).response);
    await vi.waitFor(() => expect(freeGenerationsState.remaining).toBe(8));
    const stale = Response.json({ ok: true, remaining: 'seven' });
    const staleJson = vi.spyOn(stale, 'json');
    older.resolve(stale);
    await vi.waitFor(() => expect(staleJson).toHaveBeenCalledOnce());
    expect(freeGenerationsState).toMatchObject({ available: true, loading: false, remaining: 8 });
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
    const refreshGrant = createFreeGenerationGrantRefresher();
    const fetchMock = vi.fn().mockResolvedValue(Response.json(body, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    persistedStateStatus.hydrated = true;
    refreshGrant();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    await vi.waitFor(() => expect(freeGenerationsState.loading).toBe(false));
    expect(freeGenerationsState).toMatchObject({ available: false, loading: false, remaining: 10 });
  });

  it('settles a non-finite remaining count as unavailable', async () => {
    const refreshGrant = createFreeGenerationGrantRefresher();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{"ok":true,"remaining":1e400}'))
    );

    persistedStateStatus.hydrated = true;
    refreshGrant();

    await vi.waitFor(() => expect(freeGenerationsState.loading).toBe(false));
    expect(freeGenerationsState).toMatchObject({ available: false, loading: false, remaining: 10 });
  });
});
