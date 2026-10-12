// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Only the allowlist read is mocked; the real rateLimit module (its shared
// module-level Map) is exercised end-to-end to prove the charging policy.
const { checkAccessToken } = vi.hoisted(() => ({
  checkAccessToken: vi.fn<typeof import('$lib/server/tokens').checkAccessToken>(),
}));
vi.mock('$lib/server/tokens', () => ({ checkAccessToken }));

import { POST } from './+server';
import { peekRateLimit } from '$lib/server/rateLimit';
import { verifyAccessCodeBucket } from '$lib/server/rateLimitKeys';
import { rateLimitPolicy } from '$lib/server/rateLimitPolicy';

function post(address: string, body: unknown) {
  const request = new Request('http://localhost/api/verify-access-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST({ request, getClientAddress: () => address } as unknown as Parameters<
    typeof POST
  >[0]);
}

beforeEach(() => {
  checkAccessToken.mockReset();
});

describe('POST /api/verify-access-code (real rateLimit)', () => {
  it('does not consume the shared budget across a burst of successful verifications', async () => {
    checkAccessToken.mockResolvedValue({ verdict: 'allowed' });
    const address = '198.51.100.77';

    for (let i = 0; i < 20; i++) {
      const response = await post(address, { code: 'sunny-meadow' });
      expect(response.status).toBe(200);
    }

    expect(
      peekRateLimit(verifyAccessCodeBucket(address), rateLimitPolicy.verifyAccessCode)
    ).toEqual({
      limited: false,
      retryAfter: 0,
    });
  });

  // A family retrying through a token-store outage must still have its budget
  // when the store comes back.
  it('does not consume the shared budget while the allowlist cannot be read', async () => {
    checkAccessToken.mockResolvedValue({ verdict: 'unavailable', spendsGuess: false });
    const address = '198.51.100.99';

    for (let i = 0; i < 20; i++) {
      const response = await post(address, { code: 'console-added' });
      expect(response.status).toBe(503);
    }

    expect(
      peekRateLimit(verifyAccessCodeBucket(address), rateLimitPolicy.verifyAccessCode)
    ).toEqual({ limited: false, retryAfter: 0 });
  });

  it('throttles a burst of failed guesses from one IP before touching the allowlist', async () => {
    checkAccessToken.mockResolvedValue({ verdict: 'denied', spendsGuess: true });
    const address = '198.51.100.88';

    for (let i = 0; i < 10; i++) {
      const response = await post(address, { code: 'bad-guess' });
      expect(response.status).toBe(200);
    }

    checkAccessToken.mockClear();
    const response = await post(address, { code: 'bad-guess' });

    expect(response.status).toBe(429);
    expect(checkAccessToken).not.toHaveBeenCalled();
  });
});
