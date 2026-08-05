// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { envState, getTokensStatus, addToken, removeToken } = vi.hoisted(() => ({
  envState: {} as Record<string, string | undefined>,
  getTokensStatus: vi.fn(),
  addToken: vi.fn(),
  removeToken: vi.fn(),
}));

vi.mock('$env/dynamic/private', () => ({ env: envState }));
vi.mock('$lib/server/tokens', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/tokens')>()),
  getTokensStatus,
  addToken,
  removeToken,
}));

import { sessionToken } from '$lib/server/admin';
import { DELETE, GET, POST as mutateTokens } from './tokens/+server';
import { POST as login } from './login/+server';

const SECRET = 'the-raw-secret';
const CONFLICT_ERROR = 'The token list changed while saving — please try again';
const UNAVAILABLE_ERROR =
  'Token storage is unavailable right now — nothing was saved. Please try again.';

function loginRequest(address: string, key: string) {
  const request = new Request('https://splotch.art/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
  return login({ request, getClientAddress: () => address } as unknown as Parameters<
    typeof login
  >[0]);
}

function tokenRequest(method: 'GET' | 'POST' | 'DELETE', token?: string) {
  const request = new Request('https://splotch.art/api/admin/tokens', {
    method,
    headers: {
      Authorization: `Bearer ${sessionToken()}`,
      ...(token === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: token === undefined ? undefined : JSON.stringify({ token }),
  });
  const event = { request, url: new URL(request.url) };
  const handler = method === 'GET' ? GET : method === 'POST' ? mutateTokens : DELETE;
  return handler(event as unknown as Parameters<typeof handler>[0]);
}

beforeEach(() => {
  envState.ADMIN_ACCESS_TOKEN = SECRET;
  getTokensStatus.mockReset();
  addToken.mockReset();
  removeToken.mockReset();
});

describe('native admin API wire responses', () => {
  it('returns the login success body', async () => {
    const response = await loginRequest('203.0.113.21', SECRET);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, session: sessionToken() });
  });

  it('returns the login failure body', async () => {
    const response = await loginRequest('203.0.113.22', 'wrong');

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Incorrect access key.',
    });
  });

  it('returns the token snapshot body', async () => {
    getTokensStatus.mockResolvedValue({ tokens: ['sunny meadow'], persistent: true });

    const response = await tokenRequest('GET');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      tokens: ['sunny meadow'],
      invites: [
        {
          token: 'sunny meadow',
          url: 'https://splotch.art/?ai_access_token=sunny%20meadow',
        },
      ],
      persistent: true,
    });
  });

  it('returns the mutation snapshot body', async () => {
    addToken.mockResolvedValue({ ok: true, tokens: ['existing', 'new-token'] });
    getTokensStatus.mockResolvedValue({ tokens: ['stale'], persistent: true });

    const response = await tokenRequest('POST', 'new-token');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      tokens: ['existing', 'new-token'],
      invites: [
        {
          token: 'existing',
          url: 'https://splotch.art/?ai_access_token=existing',
        },
        {
          token: 'new-token',
          url: 'https://splotch.art/?ai_access_token=new-token',
        },
      ],
      persistent: true,
    });
  });

  it('returns a validation failure without its producer reason', async () => {
    addToken.mockResolvedValue({
      ok: false,
      error: 'Token already exists',
      reason: 'invalid',
    });

    const response = await tokenRequest('POST', 'existing');
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ ok: false, error: 'Token already exists' });
    expect(body).not.toHaveProperty('reason');
  });

  it('returns a conflict failure without its producer reason', async () => {
    removeToken.mockResolvedValue({
      ok: false,
      error: CONFLICT_ERROR,
      reason: 'conflict',
    });

    const response = await tokenRequest('DELETE', 'existing');
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({ ok: false, error: CONFLICT_ERROR });
    expect(body).not.toHaveProperty('reason');
  });

  it('returns an unavailable failure as a 503 without its producer reason', async () => {
    removeToken.mockResolvedValue({
      ok: false,
      error: UNAVAILABLE_ERROR,
      reason: 'unavailable',
    });

    const response = await tokenRequest('DELETE', 'existing');
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ ok: false, error: UNAVAILABLE_ERROR });
    expect(body).not.toHaveProperty('reason');
  });

  it('reports the in-memory token fallback as non-persistent', async () => {
    getTokensStatus.mockResolvedValue({ tokens: [], persistent: false });

    const response = await tokenRequest('GET');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      tokens: [],
      invites: [],
      persistent: false,
    });
  });
});
