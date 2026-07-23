// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Only the allowlist read is mocked; the real rateLimit module (its shared
// module-level Map) is exercised end-to-end to prove the charging policy.
const { isAllowedToken } = vi.hoisted(() => ({ isAllowedToken: vi.fn() }));
vi.mock('$lib/server/tokens', () => ({ isAllowedToken }));

import { POST } from './+server';
import { peekRateLimit } from '$lib/server/rateLimit';

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
  isAllowedToken.mockReset();
});

describe('POST /api/verify-access-code (real rateLimit)', () => {
  it('does not consume the shared budget across a burst of successful verifications', async () => {
    isAllowedToken.mockResolvedValue(true);
    const address = '198.51.100.77';

    for (let i = 0; i < 20; i++) {
      const response = await post(address, { code: 'sunny-meadow' });
      expect(response.status).toBe(200);
    }

    expect(peekRateLimit(`verify-access-code:${address}`)).toEqual({
      limited: false,
      retryAfter: 0,
    });
  });

  it('throttles a burst of failed guesses from one IP before touching the allowlist', async () => {
    isAllowedToken.mockResolvedValue(false);
    const address = '198.51.100.88';

    for (let i = 0; i < 10; i++) {
      const response = await post(address, { code: 'bad-guess' });
      expect(response.status).toBe(200);
    }

    isAllowedToken.mockClear();
    const response = await post(address, { code: 'bad-guess' });

    expect(response.status).toBe(429);
    expect(isAllowedToken).not.toHaveBeenCalled();
  });
});
