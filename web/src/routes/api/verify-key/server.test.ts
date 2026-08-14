// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rateLimit, verifyKey } = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  verifyKey: vi.fn(),
}));

vi.mock('$lib/server/rateLimit', () => ({ rateLimit }));
vi.mock('$lib/server/ai/provider', () => ({ aiProvider: { verifyKey } }));

import { rateLimitPolicy } from '$lib/server/rateLimitPolicy';
import { verifyKeyBucket } from '$lib/server/rateLimitKeys';
import { KEY_CHECK_UNAVAILABLE_CODE } from '$lib/ai/keyFormat';
import { POST } from './+server';

const address = '203.0.113.6';

function post(body: unknown) {
  const request = new Request('http://localhost/api/verify-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST({ request, getClientAddress: () => address } as unknown as Parameters<
    typeof POST
  >[0]);
}

beforeEach(() => {
  rateLimit.mockReset().mockReturnValue({ limited: false, retryAfter: 0 });
  verifyKey.mockReset().mockResolvedValue({ ok: true });
});

describe('POST /api/verify-key', () => {
  it('returns a validation error without verifying a blank key', async () => {
    const response = await post({ apiKey: '   ' });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: 'No API key provided' });
    expect(rateLimit).toHaveBeenCalledWith(verifyKeyBucket(address), rateLimitPolicy.verifyKey);
    expect(verifyKey).not.toHaveBeenCalled();
  });

  it('returns an ordinary verification failure for a present rejected key', async () => {
    verifyKey.mockResolvedValue({ ok: false, kind: 'rejected', reason: 'invalid key' });

    const response = await post({ apiKey: 'invalid-key' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: false,
      error: 'That key could not authenticate with OpenAI.',
    });
  });

  it('says the check could not be made when the provider was never reached', async () => {
    // The branch that must never wear the rejected message: only OpenAI can say
    // a key is bad, so a probe that got no answer has to ask the parent to try
    // again rather than send them off to make a second key that behaves the
    // same. The code is what the client keys the retry off, not the prose.
    verifyKey.mockResolvedValue({ ok: false, kind: 'unreachable', reason: 'socket hang up' });

    const response = await post({ apiKey: 'sk-probably-fine' });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      code: KEY_CHECK_UNAVAILABLE_CODE,
      error: "We couldn't check that key just now. Please try again.",
    });
  });
});
