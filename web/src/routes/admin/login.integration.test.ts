// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Drives both real login handlers against the real rateLimit module (its
// shared module-level Map), because the guarantee under test — one throttle
// budget per IP across both front doors — only holds if neither route brings
// its own bucket key.
const { envState } = vi.hoisted(() => ({
  envState: {} as Record<string, string | undefined>,
}));
vi.mock('$env/dynamic/private', () => ({ env: envState }));

// The /admin page module pulls these in for its loader and token actions; the
// login action touches neither, so stubbing them keeps the import off Netlify
// Blobs.
vi.mock('$lib/server/tokens', () => ({
  getTokensStatus: vi.fn(),
  addToken: vi.fn(),
  removeToken: vi.fn(),
}));
vi.mock('$lib/server/usage', () => ({ getUsage: vi.fn() }));

import { POST } from '../api/admin/login/+server';
import { actions } from './+page.server';

const SECRET = 'the-raw-secret';

function jsonDoor(address: string, body: string) {
  const request = new Request('http://localhost/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  return POST({ request, getClientAddress: () => address } as unknown as Parameters<
    typeof POST
  >[0]);
}

function formDoor(address: string, key: string) {
  const body = new FormData();
  body.set('access-key', key);
  const request = new Request('http://localhost/admin?/login', { method: 'POST', body });
  return actions.login({
    request,
    cookies: { set: vi.fn() },
    getClientAddress: () => address,
  } as unknown as Parameters<typeof actions.login>[0]);
}

// Both doors read their credential from a body the other can't parse, so a
// request whose payload is wrong for the door receiving it proves the throttle
// answered before any parsing happened.
const unparseable = (address: string) =>
  actions.login({
    request: new Request('http://localhost/admin?/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }),
    cookies: { set: vi.fn() },
    getClientAddress: () => address,
  } as unknown as Parameters<typeof actions.login>[0]);

beforeEach(() => {
  envState.ADMIN_ACCESS_TOKEN = SECRET;
});

describe('the admin login doors (real rateLimit)', () => {
  it('spends one shared budget per IP, whichever door the attempts came from', async () => {
    const address = '203.0.113.10';

    // Alternate doors across the whole allowance; each wrong guess is answered
    // 403 and costs one hit.
    const wrongGuess = [
      async () => ({ status: (await jsonDoor(address, JSON.stringify({ key: 'wrong' }))).status }),
      async () => await formDoor(address, 'wrong'),
    ];
    for (let i = 0; i < 10; i++) {
      expect(await wrongGuess[i % wrongGuess.length](), `attempt ${i}`).toMatchObject({
        status: 403,
      });
    }

    // The eleventh is throttled at either door — including with the correct
    // secret, so the budget is spent, not merely the guesses.
    const json = await jsonDoor(address, JSON.stringify({ key: SECRET }));
    expect(json.status).toBe(429);
    expect(json.headers.get('Retry-After')).toBeTruthy();
    expect(await formDoor(address, SECRET)).toMatchObject({ status: 429 });
  });

  // Each door gets its own case so one door's regression can't mask the other's.
  it('answers 429 at the JSON endpoint before parsing the body', async () => {
    const address = '203.0.113.11';
    for (let i = 0; i < 10; i++) await jsonDoor(address, JSON.stringify({ key: 'wrong' }));

    // Read first, this body would be a 400 from readJsonBody instead.
    expect((await jsonDoor(address, 'not json at all')).status).toBe(429);
  });

  it('answers 429 at the form action before parsing the form data', async () => {
    const address = '203.0.113.14';
    for (let i = 0; i < 10; i++) await formDoor(address, 'wrong');

    // Read first, this body would make request.formData() throw outright.
    expect(await unparseable(address)).toMatchObject({ status: 429 });
  });

  it('leaves another IP its own full budget', async () => {
    const spent = '203.0.113.12';
    for (let i = 0; i < 11; i++) await jsonDoor(spent, JSON.stringify({ key: 'wrong' }));
    expect((await jsonDoor(spent, JSON.stringify({ key: 'wrong' }))).status).toBe(429);

    expect((await jsonDoor('203.0.113.13', JSON.stringify({ key: 'wrong' }))).status).toBe(403);
  });
});
