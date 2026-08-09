// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { envState, isAllowedToken, peekRateLimit, rateLimit } = vi.hoisted(() => ({
  envState: {} as Record<string, string | undefined>,
  isAllowedToken: vi.fn(),
  peekRateLimit: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock('$env/dynamic/private', () => ({ env: envState }));
vi.mock('./tokens', () => ({ isAllowedToken }));
vi.mock('./rateLimit', () => ({ peekRateLimit, rateLimit }));
vi.mock('./freeGenerationGrants', () => ({
  isInstallationId: (value: string | null) => /^[a-f0-9]{64}$/.test(value ?? ''),
}));

import { authorizeGenerationRequest } from './generationAuthorization';
import {
  generateImageBucket,
  generateImageByokBucket,
  generateImageFreeBucket,
  verifyAccessCodeBucket,
} from './rateLimitKeys';
import { rateLimitPolicy } from './rateLimitPolicy';

const managedInput = {
  apiKey: null,
  token: 'daycare-club',
  installationId: null,
  clientAddress: '203.0.113.5',
};

beforeEach(() => {
  envState.GEMINI_API_KEY = 'managed-key';
  isAllowedToken.mockReset().mockResolvedValue(true);
  peekRateLimit.mockReset().mockReturnValue({ limited: false, retryAfter: 0 });
  rateLimit.mockReset().mockReturnValue({ limited: false, retryAfter: 0 });
});

describe('authorizeGenerationRequest', () => {
  it('blindly throttles a limited managed guess without reading the allowlist', async () => {
    peekRateLimit.mockReturnValue({ limited: true, retryAfter: 12 });

    const result = await authorizeGenerationRequest(managedInput);

    expect(result.authorized).toBe(false);
    if (result.authorized) throw new Error('Expected authorization failure');
    const { response } = result;
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('12');
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Too many attempts. Please wait 12s.',
    });
    expect(isAllowedToken).not.toHaveBeenCalled();
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it('charges only a failed managed guess to the shared verification bucket', async () => {
    isAllowedToken.mockResolvedValue(false);

    const result = await authorizeGenerationRequest(managedInput);

    expect(result.authorized).toBe(false);
    if (result.authorized) throw new Error('Expected authorization failure');
    expect(result.response.status).toBe(403);
    expect(await result.response.json()).toEqual({ ok: false, error: 'Invalid access token' });

    expect(peekRateLimit).toHaveBeenCalledWith(
      verifyAccessCodeBucket('203.0.113.5'),
      rateLimitPolicy.verifyAccessCode
    );
    expect(isAllowedToken).toHaveBeenCalledWith('daycare-club');
    expect(rateLimit).toHaveBeenCalledOnce();
    expect(rateLimit).toHaveBeenCalledWith(
      verifyAccessCodeBucket('203.0.113.5'),
      rateLimitPolicy.verifyAccessCode
    );
  });

  it('keeps a valid managed token out of the shared verification budget', async () => {
    const result = await authorizeGenerationRequest(managedInput);

    expect(result).toEqual({
      authorized: true,
      kind: 'managed',
      effectiveKey: 'managed-key',
      managedToken: 'daycare-club',
    });
    expect(rateLimit).toHaveBeenCalledOnce();
    expect(rateLimit).toHaveBeenCalledWith(generateImageBucket('daycare-club'), {
      limit: 15,
      windowMs: 60_000,
    });
  });

  it('throttles valid managed traffic in its per-token generation bucket', async () => {
    rateLimit.mockReturnValue({ limited: true, retryAfter: 9 });

    const result = await authorizeGenerationRequest(managedInput);

    expect(result.authorized).toBe(false);
    if (result.authorized) throw new Error('Expected authorization failure');
    const { response } = result;
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('9');
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Too many attempts. Please wait 9s.',
    });
    expect(rateLimit).toHaveBeenCalledWith(generateImageBucket('daycare-club'), {
      limit: 15,
      windowMs: 60_000,
    });
  });

  it('throttles BYOK traffic per IP without consulting the managed allowlist', async () => {
    rateLimit.mockReturnValue({ limited: true, retryAfter: 7 });

    const result = await authorizeGenerationRequest({
      apiKey: '  parent-key  ',
      token: null,
      installationId: null,
      clientAddress: '198.51.100.8',
    });

    expect(result.authorized).toBe(false);
    if (result.authorized) throw new Error('Expected authorization failure');
    const { response } = result;
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('7');
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Too many attempts. Please wait 7s.',
    });
    expect(peekRateLimit).not.toHaveBeenCalled();
    expect(isAllowedToken).not.toHaveBeenCalled();
    expect(rateLimit).toHaveBeenCalledWith(generateImageByokBucket('198.51.100.8'), {
      limit: 30,
      windowMs: 60_000,
    });
  });

  it('rejects a valid managed request when no server key is configured', async () => {
    envState.GEMINI_API_KEY = undefined;

    const result = await authorizeGenerationRequest(managedInput);

    expect(result.authorized).toBe(false);
    if (result.authorized) throw new Error('Expected authorization failure');
    expect(result.response.status).toBe(500);
    expect(await result.response.json()).toEqual({
      ok: false,
      error: 'Server is missing GEMINI_API_KEY',
    });
  });

  it('authorizes a credential-free installation and rate-limits all of its attempts by IP', async () => {
    const installationId = 'a'.repeat(64);

    await expect(
      authorizeGenerationRequest({
        apiKey: null,
        token: null,
        installationId,
        clientAddress: '198.51.100.20',
      })
    ).resolves.toEqual({
      authorized: true,
      kind: 'free',
      effectiveKey: 'managed-key',
      installationId,
    });
    expect(rateLimit).toHaveBeenCalledWith(generateImageFreeBucket('198.51.100.20'), {
      limit: 15,
      windowMs: 60_000,
    });
  });

  it('throttles a free attempt before it can reach the durable grant', async () => {
    rateLimit.mockReturnValue({ limited: true, retryAfter: 8 });
    const installationId = 'b'.repeat(64);

    const result = await authorizeGenerationRequest({
      apiKey: null,
      token: null,
      installationId,
      clientAddress: '198.51.100.21',
    });

    expect(result.authorized).toBe(false);
    if (result.authorized) throw new Error('Expected authorization failure');
    expect(result.response.status).toBe(429);
  });

  it('rate-limits a malformed credential-free attempt before rejecting its installation ID', async () => {
    const result = await authorizeGenerationRequest({
      apiKey: null,
      token: null,
      installationId: 'not-an-installation-id',
      clientAddress: '198.51.100.22',
    });

    expect(result.authorized).toBe(false);
    if (result.authorized) throw new Error('Expected authorization failure');
    expect(result.response.status).toBe(400);
    expect(rateLimit).toHaveBeenCalledWith(generateImageFreeBucket('198.51.100.22'), {
      limit: 15,
      windowMs: 60_000,
    });
  });
});
