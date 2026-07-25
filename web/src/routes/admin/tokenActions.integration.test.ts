// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Drives the real /admin form actions against a stubbed token core, because the
// guarantee under test — the console's status codes match /api/admin/tokens for
// the same underlying failure — lives entirely in the action, not in the core.
const { envState } = vi.hoisted(() => ({
  envState: {} as Record<string, string | undefined>,
}));
vi.mock('$env/dynamic/private', () => ({ env: envState }));

vi.mock('$lib/server/tokens', () => ({
  getTokensStatus: vi.fn(),
  addToken: vi.fn(),
  removeToken: vi.fn(),
}));
vi.mock('$lib/server/usage', () => ({ getUsage: vi.fn() }));

import { sessionToken } from '$lib/server/admin';
import { addToken, removeToken, type MutationResult } from '$lib/server/tokens';
import { actions } from './+page.server';

const SECRET = 'the-raw-secret';

function tokenDoor(action: 'add' | 'remove', token: string) {
  const body = new FormData();
  body.set('token', token);
  const request = new Request(`http://localhost/admin?/${action}`, { method: 'POST', body });
  return actions[action]({
    request,
    cookies: { get: () => sessionToken(), set: vi.fn() },
  } as unknown as Parameters<typeof actions.add>[0]);
}

const conflict: MutationResult = {
  ok: false,
  error: 'The token list changed while saving — please try again',
  reason: 'conflict',
};

beforeEach(() => {
  envState.ADMIN_ACCESS_TOKEN = SECRET;
  vi.mocked(addToken).mockReset();
  vi.mocked(removeToken).mockReset();
});

describe('the /admin token form actions', () => {
  it('answers 409 when an add loses the CAS race, like the JSON endpoint', async () => {
    vi.mocked(addToken).mockResolvedValue(conflict);
    expect(await tokenDoor('add', 'mine')).toMatchObject({
      status: 409,
      data: { error: conflict.error },
    });
  });

  it('answers 409 when a remove loses the CAS race', async () => {
    vi.mocked(removeToken).mockResolvedValue(conflict);
    expect(await tokenDoor('remove', 'mine')).toMatchObject({
      status: 409,
      data: { error: conflict.error },
    });
  });

  // The conflict status is the only thing that moved — a caller-fault failure
  // must still be a 400.
  it('keeps a validation failure at 400', async () => {
    vi.mocked(addToken).mockResolvedValue({
      ok: false,
      error: 'Token already exists',
      reason: 'invalid',
    });
    expect(await tokenDoor('add', 'existing')).toMatchObject({
      status: 400,
      data: { error: 'Token already exists' },
    });
  });

  it('reports the mutated token on success', async () => {
    vi.mocked(removeToken).mockResolvedValue({ ok: true, tokens: [] });
    expect(await tokenDoor('remove', '  spaced  ')).toEqual({
      success: true,
      message: 'Removed “spaced”',
    });
    expect(removeToken).toHaveBeenCalledWith('spaced');
  });
});
