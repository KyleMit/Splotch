// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { envState } = vi.hoisted(() => ({
  envState: {} as Record<string, string | undefined>,
}));
vi.mock('$lib/server/privateEnv', () => ({ env: envState }));

import { MAX_ADMIN_LOGIN_BODY_BYTES, sessionToken } from '../admin';
import { rateLimitPolicy } from '../rateLimitPolicy';
import { POST } from './adminLogin';

const SECRET = 'the-raw-secret';
const { limit } = rateLimitPolicy.adminLogin;

function login(address: string, body: string) {
  const request = new Request('https://splotch.test/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  return POST({ request, url: new URL(request.url), getClientAddress: () => address });
}

beforeEach(() => {
  envState.ADMIN_ACCESS_TOKEN = SECRET;
});

describe('admin login through the real rate limiter', () => {
  it('mints a derived bearer session at the JSON endpoint', async () => {
    const response = await login('203.0.113.15', JSON.stringify({ key: SECRET }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true, session: sessionToken() });
    expect(body.session).toMatch(/^[0-9a-f]{64}$/);
    expect(body.session).not.toBe(SECRET);
  });

  it('answers 429 before parsing the body or accepting a correct secret after the budget is spent', async () => {
    const address = '203.0.113.11';
    for (let index = 0; index < limit; index++)
      expect((await login(address, JSON.stringify({ key: 'wrong' }))).status).toBe(403);

    expect((await login(address, 'not json at all')).status).toBe(429);
    const response = await login(address, JSON.stringify({ key: SECRET }));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toMatch(/^[1-9]\d*$/);
  });

  it('stops reading an oversized JSON login body at the admin cap', async () => {
    const response = await login(
      '203.0.113.16',
      JSON.stringify({ key: 'x'.repeat(MAX_ADMIN_LOGIN_BODY_BYTES) })
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ ok: false, error: 'Request body is too large' });
  });

  it('leaves another IP its own full login budget', async () => {
    const spent = '203.0.113.12';
    for (let index = 0; index <= limit; index++)
      await login(spent, JSON.stringify({ key: 'wrong' }));
    expect((await login(spent, JSON.stringify({ key: 'wrong' }))).status).toBe(429);
    expect((await login('203.0.113.13', JSON.stringify({ key: 'wrong' }))).status).toBe(403);
  });
});
