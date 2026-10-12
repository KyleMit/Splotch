import { afterEach, describe, expect, it, vi } from 'vitest';
import { KEY_CHECK_UNAVAILABLE_CODE, looksLikeApiKey } from './keyFormat';
import { verifyCredential } from './verifyCredential';

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

function stubRawFetch(status: number, body: string) {
  const fetchMock = vi.fn(async () => new Response(body, { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('looksLikeApiKey', () => {
  // One prefix covers project, service-account, and legacy user keys.
  it.each(['sk-proj-ExampleKey1234', 'sk-svcacct-ExampleKey1234', 'sk-ExampleKey1234'])(
    'is true for %s',
    (key) => {
      expect(looksLikeApiKey(key)).toBe(true);
    }
  );

  it('is false for an access code', () => {
    expect(looksLikeApiKey('sunny-meadow')).toBe(false);
  });

  it('is false for a value that merely contains the key prefix later on', () => {
    expect(looksLikeApiKey('xsk-Key')).toBe(false);
  });

  it("is false for the retired provider's key shapes", () => {
    expect(looksLikeApiKey('AIzaSyExampleKey1234')).toBe(false);
    expect(looksLikeApiKey('AQ.Ab8ExampleKey1234')).toBe(false);
  });
});

describe('verifyCredential', () => {
  it('recognises a retired provider key locally and never puts it on the wire', async () => {
    const fetchMock = stubFetch(200, { ok: true });
    const result = await verifyCredential('AIzaSyExampleKey1234');
    expect(result).toEqual({ kind: 'retiredGeminiKey', ok: false });
    // The whole point: a credential for a provider we no longer call cannot pass
    // either endpoint, so sending it would leak the parent's key to learn nothing.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('routes an API key to /api/verify-key and reports success', async () => {
    const fetchMock = stubFetch(200, { ok: true });

    const result = await verifyCredential('sk-proj-Key');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/verify-key');
    expect(JSON.parse(init.body as string)).toEqual({ apiKey: 'sk-proj-Key' });
    expect(result).toMatchObject({ kind: 'apiKey', ok: true });
  });

  it('routes a service-account key to /api/verify-key', async () => {
    const fetchMock = stubFetch(200, { ok: true });

    const result = await verifyCredential('sk-svcacct-Key');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/verify-key');
    expect(JSON.parse(init.body as string)).toEqual({ apiKey: 'sk-svcacct-Key' });
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

    const result = await verifyCredential('sk-proj-Bad');

    expect(result).toMatchObject({ kind: 'apiKey', ok: false, error: 'Nope.' });
  });

  it('treats a 200 with ok:false as a failure', async () => {
    stubFetch(200, { ok: false });

    const result = await verifyCredential('wrong-code');

    expect(result.ok).toBe(false);
  });

  it.each(['not json', '"oops"', '123', 'true', 'null', '[]'])(
    'treats malformed response body %s as a failed verification',
    async (body) => {
      stubRawFetch(200, body);

      const result = await verifyCredential('wrong-code');

      expect(result).toEqual({ kind: 'accessCode', ok: false, error: undefined });
    }
  );

  it('reports an unreachable key check as its own kind, keeping the server message', async () => {
    stubFetch(503, { ok: false, code: KEY_CHECK_UNAVAILABLE_CODE, error: 'Try again.' });

    const result = await verifyCredential('sk-proj-Key');

    expect(result).toEqual({ kind: 'checkUnavailable', ok: false, error: 'Try again.' });
  });

  // A success the endpoint's contract forbids fails verification rather than
  // storing the value the parent typed in place of the server's access code.
  it.each([{ ok: true }, { ok: true, accessCode: '' }, { ok: true, accessCode: 42 }])(
    'treats an access-code success without a string access code (%o) as a failure',
    async (body) => {
      stubFetch(200, body);

      const result = await verifyCredential('sunny-meadow');

      expect(result).toEqual({ kind: 'accessCode', ok: false, error: undefined });
    }
  );

  it('drops a non-string error field instead of showing it', async () => {
    stubFetch(400, { ok: false, error: { message: 'Nope.' } });

    const result = await verifyCredential('sk-proj-Bad');

    expect(result).toEqual({ kind: 'apiKey', ok: false, error: undefined });
  });

  it('passes the abort signal through to fetch', async () => {
    const fetchMock = stubFetch(200, { ok: true });
    const controller = new AbortController();

    await verifyCredential('sk-proj-Key', { signal: controller.signal });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });
});
