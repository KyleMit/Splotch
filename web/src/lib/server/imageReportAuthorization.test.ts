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
// Only the Netlify Blobs environment probe is stubbed, so the free branch runs
// against the real `isInstallationId` rather than a mirrored copy of its pattern.
vi.mock('$app/environment', () => ({ dev: false }));

import { authorizeImageReport } from './imageReportAuthorization';
import {
  reportImageByokBucket,
  reportImageFreeBucket,
  reportImageTokenBucket,
  verifyAccessCodeBucket,
} from './rateLimitKeys';
import { rateLimitPolicy } from './rateLimitPolicy';

const INSTALLATION_ID = 'a'.repeat(64);

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
      installationId: null,
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
      installationId: null,
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
      installationId: null,
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
      installationId: null,
      clientAddress: '198.51.100.8',
    });

    expect(result.authorized).toBe(false);
    if (result.authorized) throw new Error('Expected authorization failure');
    expect(result.response.status).toBe(403);
  });

  it('accepts a free installation id and spends only its own per-IP bucket', async () => {
    const result = await authorizeImageReport({
      apiKey: null,
      token: null,
      installationId: INSTALLATION_ID,
      clientAddress: '192.0.2.9',
    });

    expect(result).toEqual({ authorized: true });
    expect(rateLimit).toHaveBeenCalledOnce();
    expect(rateLimit).toHaveBeenCalledWith(
      reportImageFreeBucket('192.0.2.9'),
      rateLimitPolicy.reportImageFree
    );
    expect(isAllowedToken).not.toHaveBeenCalled();
    expect(verifyKey).not.toHaveBeenCalled();
  });

  // Issue #960: the client sends the empty string, not null, when a free-tier
  // user has never set an access token. Treating that as a managed token is what
  // made every free-tier picture unreportable.
  it('treats an empty access token as the free tier rather than a bad token', async () => {
    const result = await authorizeImageReport({
      apiKey: '',
      token: '',
      installationId: INSTALLATION_ID,
      clientAddress: '192.0.2.9',
    });

    expect(result).toEqual({ authorized: true });
    expect(isAllowedToken).not.toHaveBeenCalled();
  });

  it('rejects a malformed installation id but still charges the free bucket', async () => {
    const result = await authorizeImageReport({
      apiKey: null,
      token: null,
      installationId: 'not-an-installation-id',
      clientAddress: '192.0.2.9',
    });

    expect(result.authorized).toBe(false);
    if (result.authorized) throw new Error('Expected authorization failure');
    expect(result.response.status).toBe(400);
    expect(rateLimit).toHaveBeenCalledWith(
      reportImageFreeBucket('192.0.2.9'),
      rateLimitPolicy.reportImageFree
    );
  });

  it('throttles a free reporter that has spent its bucket', async () => {
    rateLimit.mockReturnValue({ limited: true, retryAfter: 42 });

    const result = await authorizeImageReport({
      apiKey: null,
      token: null,
      installationId: INSTALLATION_ID,
      clientAddress: '192.0.2.9',
    });

    expect(result.authorized).toBe(false);
    if (result.authorized) throw new Error('Expected authorization failure');
    expect(result.response.status).toBe(429);
  });
});
