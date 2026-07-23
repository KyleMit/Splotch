import { afterEach, describe, expect, it, vi } from 'vitest';
import { looksLikeApiKey, verifyCredential } from './aiCredential';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(
    async (_url: string, _init: RequestInit) => new Response(JSON.stringify(body), { status })
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('looksLikeApiKey', () => {
  it('is true for a Gemini key prefix', () => {
    expect(looksLikeApiKey('AIzaSyExampleKey1234')).toBe(true);
  });

  it('is false for an access code', () => {
    expect(looksLikeApiKey('sunny-meadow')).toBe(false);
  });

  it('is false for a value that merely contains AIza later on', () => {
    expect(looksLikeApiKey('xAIzaSyKey')).toBe(false);
  });
});

describe('verifyCredential', () => {
  it('routes an API key to /api/verify-key and reports success', async () => {
    const fetchMock = stubFetch(200, { ok: true });

    const result = await verifyCredential('AIzaSyKey');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/verify-key');
    expect(JSON.parse(init.body as string)).toEqual({ apiKey: 'AIzaSyKey' });
    expect(result).toMatchObject({ kind: 'apiKey', ok: true });
  });

  it('routes a non-key value to /api/verify-access-code and returns the access code', async () => {
    const fetchMock = stubFetch(200, { ok: true, accessCode: 'sunny-meadow' });

    const result = await verifyCredential('sunny-meadow');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/verify-access-code');
    expect(JSON.parse(init.body as string)).toEqual({ code: 'sunny-meadow' });
    expect(result).toMatchObject({ kind: 'accessCode', ok: true, accessCode: 'sunny-meadow' });
  });

  it('maps a rejected key to ok:false and surfaces the server error message', async () => {
    stubFetch(400, { ok: false, error: 'Nope.' });

    const result = await verifyCredential('AIzaBad');

    expect(result).toMatchObject({ kind: 'apiKey', ok: false, error: 'Nope.' });
  });

  it('treats a 200 with ok:false as a failure', async () => {
    stubFetch(200, { ok: false });

    const result = await verifyCredential('wrong-code');

    expect(result.ok).toBe(false);
  });

  it('passes the abort signal through to fetch', async () => {
    const fetchMock = stubFetch(200, { ok: true });
    const controller = new AbortController();

    await verifyCredential('AIzaKey', { signal: controller.signal });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });
});
