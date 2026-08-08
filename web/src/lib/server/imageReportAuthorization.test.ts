// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { isAllowedToken, peekRateLimit, rateLimit, verifyKey } = vi.hoisted(() => ({
  isAllowedToken: vi.fn(),
  peekRateLimit: vi.fn(),
  rateLimit: vi.fn(),
  verifyKey: vi.fn(),
}));

vi.mock('./tokens', () => ({ isAllowedToken }));
vi.mock('./rateLimit', () => ({ peekRateLimit, rateLimit }));
vi.mock('./ai/provider', () => ({ aiProvider: { verifyKey } }));

import { authorizeImageReport } from './imageReportAuthorization';
import {
  reportImageByokBucket,
  reportImageTokenBucket,
  verifyAccessCodeBucket,
} from './rateLimitKeys';
import { rateLimitPolicy } from './rateLimitPolicy';

beforeEach(() => {
  isAllowedToken.mockReset().mockResolvedValue(true);
  peekRateLimit.mockReset().mockReturnValue({ limited: false, retryAfter: 0 });
  rateLimit.mockReset().mockReturnValue({ limited: false, retryAfter: 0 });
  verifyKey.mockReset().mockResolvedValue({ ok: true });
});

describe('authorizeImageReport', () => {
  it('accepts an active managed token and spends only its report bucket', async () => {
    const result = await authorizeImageReport({
      apiKey: null,
      token: 'daycare-club',
      clientAddress: '203.0.113.5',
    });

    expect(result).toEqual({ authorized: true });
    expect(peekRateLimit).toHaveBeenCalledWith(
      verifyAccessCodeBucket('203.0.113.5'),
      rateLimitPolicy.verifyAccessCode
    );
    expect(rateLimit).toHaveBeenCalledOnce();
    expect(rateLimit).toHaveBeenCalledWith(
      reportImageTokenBucket('daycare-club'),
      rateLimitPolicy.reportImageToken
    );
  });

  it('charges an invalid managed token to the shared access-code oracle bucket', async () => {
    isAllowedToken.mockResolvedValue(false);

    const result = await authorizeImageReport({
      apiKey: null,
      token: 'wrong',
      clientAddress: '203.0.113.5',
    });

    expect(result.authorized).toBe(false);
    if (result.authorized) throw new Error('Expected authorization failure');
    expect(result.response.status).toBe(403);
    expect(rateLimit).toHaveBeenCalledWith(
      verifyAccessCodeBucket('203.0.113.5'),
      rateLimitPolicy.verifyAccessCode
    );
  });

  it('verifies a BYO key before accepting its image report', async () => {
    const result = await authorizeImageReport({
      apiKey: '  parent-key  ',
      token: null,
      clientAddress: '198.51.100.8',
    });

    expect(result).toEqual({ authorized: true });
    expect(rateLimit).toHaveBeenCalledWith(
      reportImageByokBucket('198.51.100.8'),
      rateLimitPolicy.reportImageByok
    );
    expect(verifyKey).toHaveBeenCalledWith('parent-key');
    expect(isAllowedToken).not.toHaveBeenCalled();
  });

  it('rejects a BYO key that the provider cannot verify', async () => {
    verifyKey.mockResolvedValue({ ok: false });

    const result = await authorizeImageReport({
      apiKey: 'bad-key',
      token: null,
      clientAddress: '198.51.100.8',
    });

    expect(result.authorized).toBe(false);
    if (result.authorized) throw new Error('Expected authorization failure');
    expect(result.response.status).toBe(403);
  });
});
