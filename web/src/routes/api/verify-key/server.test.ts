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
    expect(rateLimit).toHaveBeenCalledWith(
      verifyKeyBucket(address),
      rateLimitPolicy.verifyKey
    );
    expect(verifyKey).not.toHaveBeenCalled();
  });

  it('returns an ordinary verification failure for a present rejected key', async () => {
    verifyKey.mockResolvedValue({ ok: false, reason: 'invalid key' });

    const response = await post({ apiKey: 'invalid-key' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: false,
      error: 'That key could not authenticate with Gemini.',
    });
  });
});
