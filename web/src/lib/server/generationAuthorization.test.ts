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

import {
  authorizeGenerationRequest,
  requireEffectiveGenerationKey,
} from './generationAuthorization';

const managedInput = {
  apiKey: null,
  token: 'daycare-club',
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

    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('12');
    expect(isAllowedToken).not.toHaveBeenCalled();
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it('charges only a failed managed guess to the shared verification bucket', async () => {
    isAllowedToken.mockResolvedValue(false);

    await expect(authorizeGenerationRequest(managedInput)).rejects.toMatchObject({
      status: 403,
      body: { message: 'Invalid access token' },
    });

    expect(peekRateLimit).toHaveBeenCalledWith('verify-access-code:203.0.113.5');
    expect(isAllowedToken).toHaveBeenCalledWith('daycare-club');
    expect(rateLimit).toHaveBeenCalledOnce();
    expect(rateLimit).toHaveBeenCalledWith('verify-access-code:203.0.113.5');
  });

  it('keeps a valid managed token out of the shared verification budget', async () => {
    const result = await authorizeGenerationRequest(managedInput);

    expect(result).toEqual({
      usingByok: false,
      effectiveKey: 'managed-key',
      managedToken: 'daycare-club',
    });
    expect(rateLimit).toHaveBeenCalledOnce();
    expect(rateLimit).toHaveBeenCalledWith('generate-image:daycare-club', {
      limit: 15,
      windowMs: 60_000,
    });
  });

  it('throttles valid managed traffic in its per-token generation bucket', async () => {
    rateLimit.mockReturnValue({ limited: true, retryAfter: 9 });

    const result = await authorizeGenerationRequest(managedInput);

    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('9');
    expect(rateLimit).toHaveBeenCalledWith('generate-image:daycare-club', {
      limit: 15,
      windowMs: 60_000,
    });
  });

  it('throttles BYOK traffic per IP without consulting the managed allowlist', async () => {
    rateLimit.mockReturnValue({ limited: true, retryAfter: 7 });

    const result = await authorizeGenerationRequest({
      apiKey: '  parent-key  ',
      token: null,
      clientAddress: '198.51.100.8',
    });

    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('7');
    expect(peekRateLimit).not.toHaveBeenCalled();
    expect(isAllowedToken).not.toHaveBeenCalled();
    expect(rateLimit).toHaveBeenCalledWith('generate-image-byok:198.51.100.8', {
      limit: 30,
      windowMs: 60_000,
    });
  });
});

describe('requireEffectiveGenerationKey', () => {
  it('rejects a valid managed request when no server key is configured', async () => {
    envState.GEMINI_API_KEY = undefined;
    const authorization = await authorizeGenerationRequest(managedInput);
    if (authorization instanceof Response) throw new Error('Expected an authorization');

    expect(() => requireEffectiveGenerationKey(authorization)).toThrowError(
      expect.objectContaining({
        status: 500,
        body: { message: 'Server is missing GEMINI_API_KEY' },
      })
    );
  });
});
