import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistedStateStatus } from '$lib/boot/persistedStateStatus.svelte';
import { network } from './network.svelte';
import { settings } from './settings.svelte';
import {
  createFreeGenerationGrantRefresher,
  freeGenerations,
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
    const refreshGrant = createFreeGenerationGrantRefresher();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(Response.json({ ok: true, remaining: 7, limit: 10 }, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    persistedStateStatus.hydrated = true;
    refreshGrant();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(freeGenerations.loading).toBe(false));
    expect(freeGenerations).toMatchObject({ available: false, loading: false });

    refreshGrant();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    network.online = false;
    refreshGrant();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    network.online = true;
    refreshGrant();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(freeGenerations.available).toBe(true));
    expect(freeGenerations).toMatchObject({ available: true, loading: false, remaining: 7 });
  });

  it('waits while an eligible grant is offline and marks an ineligible grant unavailable', () => {
    const refreshGrant = createFreeGenerationGrantRefresher();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    persistedStateStatus.hydrated = true;
    network.online = false;
    refreshGrant();
    expect(freeGenerations).toMatchObject({ available: false, loading: true });
    expect(fetchMock).not.toHaveBeenCalled();

    settings.aiUserApiKey = 'parent-key';
    refreshGrant();
    expect(freeGenerations).toMatchObject({ available: false, loading: false });
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

    settings.aiUserApiKey = 'parent-key';
    refreshGrant();
    expect(signal.aborted).toBe(true);
    expect(freeGenerations).toMatchObject({ available: false, loading: false, remaining: 10 });

    const stale = grantResponse(3);
    pending.resolve(stale.response);
    await vi.waitFor(() => expect(stale.json).toHaveBeenCalledOnce());
    expect(freeGenerations).toMatchObject({ available: false, loading: false, remaining: 10 });
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

    network.online = false;
    refreshGrant();
    network.online = true;
    refreshGrant();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(olderSignal.aborted).toBe(true);

    const olderResponse = grantResponse(2);
    older.resolve(olderResponse.response);
    await vi.waitFor(() => expect(olderResponse.json).toHaveBeenCalledOnce());
    expect(freeGenerations).toMatchObject({ available: false, loading: true, remaining: 10 });

    newer.resolve(grantResponse(7).response);
    await vi.waitFor(() => expect(freeGenerations.remaining).toBe(7));
    expect(freeGenerations).toMatchObject({ available: true, loading: false, remaining: 7 });
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

    network.online = false;
    refreshGrant();
    network.online = true;
    refreshGrant();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    newer.resolve(grantResponse(7).response);
    await vi.waitFor(() => expect(freeGenerations.remaining).toBe(7));
    const olderResponse = grantResponse(2);
    older.resolve(olderResponse.response);
    await vi.waitFor(() => expect(olderResponse.json).toHaveBeenCalledOnce());
    expect(freeGenerations).toMatchObject({ available: true, loading: false, remaining: 7 });
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

    network.online = false;
    refreshGrant();
    network.online = true;
    refreshGrant();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    newer.resolve(grantResponse(8).response);
    await vi.waitFor(() => expect(freeGenerations.remaining).toBe(8));
    older.reject(new Error('stale failure'));
    await vi.waitFor(() => expect(freeGenerations.available).toBe(true));
    expect(freeGenerations).toMatchObject({ available: true, loading: false, remaining: 8 });
  });
});
