// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { envState, isAllowedToken, peekRateLimit, rateLimit, verifyKey } = vi.hoisted(() => ({
  envState: {} as Record<string, string | undefined>,
  isAllowedToken: vi.fn(),
  peekRateLimit: vi.fn(),
  rateLimit: vi.fn(),
  verifyKey: vi.fn(),
}));

vi.mock('$env/dynamic/private', () => ({ env: envState }));
vi.mock('./tokens', () => ({ isAllowedToken }));
vi.mock('./rateLimit', () => ({ peekRateLimit, rateLimit }));
vi.mock('./ai/provider', () => ({ aiProvider: { verifyKey } }));
// Only the Netlify Blobs environment probe is stubbed, so the free branch runs
// against the real `isInstallationId` and the real token signing/verification
// rather than mirrored copies of either.
vi.mock('$app/environment', () => ({ dev: false }));

import { authorizeImageReport } from './imageReportAuthorization';
import {
  reportImageByokBucket,
  reportImageFreeBucket,
  reportImageTokenBucket,
  verifyAccessCodeBucket,
} from './rateLimitKeys';
import { rateLimitPolicy } from './rateLimitPolicy';
import { issueReportToken } from './reportToken';

const INSTALLATION_ID = 'a'.repeat(64);
const FREE_BINDING = { kind: 'free', credential: INSTALLATION_ID } as const;

beforeEach(() => {
  envState.REPORT_TOKEN_SECRET = 'unit-test-report-secret';
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
      reportToken: null,
      clientAddress: '203.0.113.5',
    });

    expect(result).toEqual({ authorized: true, reportContext: null });
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

  it('verifies the server-authenticated refusal reason for a managed report', async () => {
    const binding = { kind: 'managed', credential: 'daycare-club' } as const;
    const result = await authorizeImageReport({
      apiKey: null,
      token: binding.credential,
      installationId: null,
      reportToken: issueReportToken(binding, {
        kind: 'false-positive-refusal',
        refusalReason: 'IMAGE_SAFETY',
      }),
      clientAddress: '203.0.113.5',
    });

    expect(result).toEqual({
      authorized: true,
      reportContext: {
        kind: 'false-positive-refusal',
        refusalReason: 'IMAGE_SAFETY',
      },
    });
  });

  it('charges an invalid managed token to the shared access-code oracle bucket', async () => {
    isAllowedToken.mockResolvedValue(false);

    const result = await authorizeImageReport({
      apiKey: null,
      token: 'wrong',
      installationId: null,
      reportToken: null,
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
      reportToken: null,
      clientAddress: '198.51.100.8',
    });

    expect(result).toEqual({ authorized: true, reportContext: null });
    expect(rateLimit).toHaveBeenCalledWith(
      reportImageByokBucket('198.51.100.8'),
      rateLimitPolicy.reportImageByok
    );
    expect(verifyKey).toHaveBeenCalledWith('parent-key');
    expect(isAllowedToken).not.toHaveBeenCalled();
  });

  it('rejects a refusal context token bound to a different BYO key', async () => {
    const result = await authorizeImageReport({
      apiKey: 'parent-key',
      token: null,
      installationId: null,
      reportToken: issueReportToken(
        { kind: 'byok', credential: 'different-key' },
        { kind: 'false-positive-refusal', refusalReason: 'IMAGE_SAFETY' }
      ),
      clientAddress: '198.51.100.8',
    });

    expect(result.authorized).toBe(false);
    if (result.authorized) throw new Error('Expected authorization failure');
    expect(result.response.status).toBe(403);
  });

  it('rejects a BYO key that the provider cannot verify', async () => {
    verifyKey.mockResolvedValue({ ok: false });

    const result = await authorizeImageReport({
      apiKey: 'bad-key',
      token: null,
      installationId: null,
      reportToken: null,
      clientAddress: '198.51.100.8',
    });

    expect(result.authorized).toBe(false);
    if (result.authorized) throw new Error('Expected authorization failure');
    expect(result.response.status).toBe(403);
  });

  const freeReport = (overrides: Partial<Parameters<typeof authorizeImageReport>[0]> = {}) =>
    authorizeImageReport({
      apiKey: null,
      token: null,
      installationId: INSTALLATION_ID,
      reportToken: issueReportToken(FREE_BINDING),
      clientAddress: '192.0.2.9',
      ...overrides,
    });

  it('accepts a signed free report token and spends only its own per-IP bucket', async () => {
    const result = await freeReport();

    expect(result).toEqual({
      authorized: true,
      reportContext: { kind: 'picture' },
    });
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
    const result = await freeReport({ apiKey: '', token: '' });

    expect(result).toEqual({
      authorized: true,
      reportContext: { kind: 'picture' },
    });
    expect(isAllowedToken).not.toHaveBeenCalled();
  });

  // The installation id is a client-generated 64-hex string, so on its own it
  // authorizes nothing — this is the whole point of the token.
  it('rejects a well-formed installation id carrying no report token', async () => {
    const result = await freeReport({ reportToken: null });

    expect(result.authorized).toBe(false);
    if (result.authorized) throw new Error('Expected authorization failure');
    expect(result.response.status).toBe(403);
  });

  it('rejects a report token minted for a different installation', async () => {
    const result = await freeReport({
      reportToken: issueReportToken({ kind: 'free', credential: 'b'.repeat(64) }),
    });

    expect(result.authorized).toBe(false);
    if (result.authorized) throw new Error('Expected authorization failure');
    expect(result.response.status).toBe(403);
  });

  it('rejects a report token whose signature was forged against a different secret', async () => {
    envState.REPORT_TOKEN_SECRET = 'a-different-secret';
    const forged = issueReportToken(FREE_BINDING);
    envState.REPORT_TOKEN_SECRET = 'unit-test-report-secret';

    const result = await freeReport({ reportToken: forged });

    expect(result.authorized).toBe(false);
    if (result.authorized) throw new Error('Expected authorization failure');
    expect(result.response.status).toBe(403);
  });

  it('rejects an expired report token', async () => {
    vi.useFakeTimers();
    try {
      const token = issueReportToken(FREE_BINDING);
      vi.advanceTimersByTime(3 * 60 * 60 * 1000);
      const result = await freeReport({ reportToken: token });

      expect(result.authorized).toBe(false);
      if (result.authorized) throw new Error('Expected authorization failure');
      expect(result.response.status).toBe(403);
    } finally {
      vi.useRealTimers();
    }
  });

  // A deploy missing the signing secret is a server fault, not a bad credential,
  // and the other two credentials keep working.
  it('answers 503 rather than 403 when the signing secret is unset', async () => {
    const token = issueReportToken(FREE_BINDING);
    envState.REPORT_TOKEN_SECRET = undefined;

    const result = await freeReport({ reportToken: token });

    expect(result.authorized).toBe(false);
    if (result.authorized) throw new Error('Expected authorization failure');
    expect(result.response.status).toBe(503);
  });

  it('rejects a malformed installation id but still charges the free bucket', async () => {
    const result = await freeReport({ installationId: 'not-an-installation-id' });

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

    const result = await freeReport();

    expect(result.authorized).toBe(false);
    if (result.authorized) throw new Error('Expected authorization failure');
    expect(result.response.status).toBe(429);
  });
});
