// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseSnapshot } from './snapshot';

const INVITE = { token: 'crayon', url: 'https://splotch.art/?code=crayon' };
const SNAPSHOT = { ok: true, tokens: ['crayon'], invites: [INVITE], persistent: true };
const DEFAULT_ERROR = 'Something went wrong. Please try again.';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe('parseSnapshot', () => {
  it('reports an expired session on 401', async () => {
    expect(await parseSnapshot(jsonResponse({ ok: false, error: 'nope' }, 401))).toEqual({
      ok: false,
      expired: true,
    });
  });

  it('returns the invites and persistence flag from a valid snapshot', async () => {
    expect(await parseSnapshot(jsonResponse(SNAPSHOT))).toEqual({
      ok: true,
      invites: [INVITE],
      persistent: true,
    });
  });

  it('rejects a 200 whose body is not a snapshot', async () => {
    expect(await parseSnapshot(jsonResponse({ ok: true, tokens: ['crayon'] }))).toEqual({
      ok: false,
      expired: false,
      error: DEFAULT_ERROR,
    });
  });

  it('surfaces the error field of a non-401 failure', async () => {
    expect(
      await parseSnapshot(jsonResponse({ ok: false, error: 'Token already exists.' }, 409))
    ).toEqual({
      ok: false,
      expired: false,
      error: 'Token already exists.',
    });
  });

  it('falls back to the default message when the body is not JSON', async () => {
    expect(
      await parseSnapshot(new Response('<html>gateway timeout</html>', { status: 504 }))
    ).toEqual({
      ok: false,
      expired: false,
      error: DEFAULT_ERROR,
    });
  });
});
