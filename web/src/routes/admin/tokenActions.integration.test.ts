// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Drives the real /admin form actions against a stubbed token core, because the
// guarantee under test — the console's status codes match /api/admin/tokens for
// the same underlying failure — lives entirely in the action, not in the core.
const { envState } = vi.hoisted(() => ({
  envState: {} as Record<string, string | undefined>,
}));
vi.mock('$env/dynamic/private', () => ({ env: envState }));

// Only the mutations are stubbed: the action reads the real
// MUTATION_FAILURE_STATUS, which is the shared mapping under test.
vi.mock('$lib/server/tokens', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/tokens')>()),
  getTokensStatus: vi.fn(),
  addToken: vi.fn(),
  removeToken: vi.fn(),
}));
vi.mock('$lib/server/usage', () => ({ readUsageAndPurgeExpired: vi.fn() }));

import { sessionToken } from '$lib/server/admin';
import {
  addToken,
  MAX_TOKEN_MUTATION_BODY_BYTES,
  removeToken,
  type MutationResult,
} from '$lib/server/tokens';
import { actions } from './+page.server';

const SECRET = 'the-raw-secret';

function tokenDoor(action: 'add' | 'remove', token: string | Blob) {
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

const unavailable: MutationResult = {
  ok: false,
  error: 'Token storage is unavailable right now — nothing was saved. Please try again.',
  reason: 'unavailable',
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

  it('answers 503 when the token store is unreachable, like the JSON endpoint', async () => {
    vi.mocked(removeToken).mockResolvedValue(unavailable);
    expect(await tokenDoor('remove', 'mine')).toMatchObject({
      status: 503,
      data: { error: unavailable.error },
    });
  });

  // A caller-fault failure must still be a 400.
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
    vi.mocked(removeToken).mockResolvedValue({
      ok: true,
      tokens: [],
      persistent: true,
      changed: true,
    });
    expect(await tokenDoor('remove', '  spaced  ')).toEqual({
      success: true,
      message: 'Removed “spaced”',
    });
    expect(removeToken).toHaveBeenCalledWith('spaced');
  });

  // An operator revoking a leaked code against a lagging replica, or with a
  // typo, must not read "Removed" while the code stays valid.
  it('says nothing was removed when the removal matched no token', async () => {
    vi.mocked(removeToken).mockResolvedValue({
      ok: true,
      tokens: ['other'],
      persistent: true,
      changed: false,
    });
    expect(await tokenDoor('remove', 'typo')).toEqual({
      success: true,
      message: '“typo” was not in the list — nothing was removed',
    });
  });

  it('answers 413 over the JSON endpoint body cap without mutating anything', async () => {
    expect(await tokenDoor('add', 'x'.repeat(MAX_TOKEN_MUTATION_BODY_BYTES))).toMatchObject({
      status: 413,
      data: { error: 'Request body is too large' },
    });
    expect(addToken).not.toHaveBeenCalled();
  });

  // String() would have handed the core a token spelled "[object Blob]".
  it('reads a token sent as a file as no token at all', async () => {
    vi.mocked(addToken).mockResolvedValue({
      ok: false,
      error: 'Token is required',
      reason: 'invalid',
    });
    await tokenDoor('add', new Blob(['mine']));

    expect(addToken).toHaveBeenCalledWith('');
  });
});
