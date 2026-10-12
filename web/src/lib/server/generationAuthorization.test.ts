// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Typed against the functions they replace, so a changed server result shape
// fails type-check here instead of these tests feeding the module a stale one.
// Inline `import()` types because each stub shares the real function's name.
const { envState, checkAccessToken, peekRateLimit, rateLimit } = vi.hoisted(() => ({
  envState: {} as Record<string, string | undefined>,
  checkAccessToken: vi.fn<typeof import('./tokens').checkAccessToken>(),
  peekRateLimit: vi.fn<typeof import('./rateLimit').peekRateLimit>(),
  rateLimit: vi.fn<typeof import('./rateLimit').rateLimit>(),
}));

vi.mock('$env/dynamic/private', () => ({ env: envState }));
vi.mock('./tokens', () => ({ checkAccessToken }));
vi.mock('./rateLimit', () => ({ peekRateLimit, rateLimit }));

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
  envState.OPENAI_API_KEY = 'managed-key';
  checkAccessToken.mockReset().mockResolvedValue({ verdict: 'allowed' });
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
    expect(checkAccessToken).not.toHaveBeenCalled();
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it('charges only a failed managed guess to the shared verification bucket', async () => {
    checkAccessToken.mockResolvedValue({ verdict: 'denied', spendsGuess: true });

    const result = await authorizeGenerationRequest(managedInput);

    expect(result.authorized).toBe(false);
    if (result.authorized) throw new Error('Expected authorization failure');
    expect(result.response.status).toBe(403);
    expect(await result.response.json()).toEqual({ ok: false, error: 'Invalid access token' });

    expect(peekRateLimit).toHaveBeenCalledWith(
      verifyAccessCodeBucket('203.0.113.5'),
      rateLimitPolicy.verifyAccessCode
    );
    expect(checkAccessToken).toHaveBeenCalledWith('daycare-club');
    expect(rateLimit).toHaveBeenCalledOnce();
    expect(rateLimit).toHaveBeenCalledWith(
      verifyAccessCodeBucket('203.0.113.5'),
      rateLimitPolicy.verifyAccessCode
    );
  });

  // A token store we could not read is our fault, not a revoked code: the 403
  // this used to answer is a dead end the client never retries.
  it('answers an unreadable allowlist with a retryable 503, charging nothing', async () => {
    checkAccessToken.mockResolvedValue({ verdict: 'unavailable', spendsGuess: false });

    const result = await authorizeGenerationRequest(managedInput);

    if (result.authorized) throw new Error('Expected authorization failure');
    expect(result.response.status).toBe(503);
    expect(await result.response.json()).toEqual({
      ok: false,
      error: 'AI creations are not available right now. Please try again later.',
    });
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it('still charges an unavailable answer that depended on the token', async () => {
    checkAccessToken.mockResolvedValue({ verdict: 'unavailable', spendsGuess: true });

    const result = await authorizeGenerationRequest(managedInput);

    if (result.authorized) throw new Error('Expected authorization failure');
    expect(result.response.status).toBe(503);
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
    expect(checkAccessToken).not.toHaveBeenCalled();
    expect(rateLimit).toHaveBeenCalledWith(generateImageByokBucket('198.51.100.8'), {
      limit: 30,
      windowMs: 60_000,
    });
  });

  // A deploy without the project key is a server fault like every other
  // unconfigured condition: a 503 the operator can find in the log, with the
  // variable's name kept out of a body that reaches parent-facing error reports.
  it.each([
    ['managed', managedInput],
    [
      'free',
      { apiKey: null, token: null, installationId: 'a'.repeat(64), clientAddress: '198.51.100.20' },
    ],
  ])('answers a %s request 503 when no server key is configured', async (_label, input) => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    envState.OPENAI_API_KEY = undefined;

    const result = await authorizeGenerationRequest(input);

    expect(result.authorized).toBe(false);
    if (result.authorized) throw new Error('Expected authorization failure');
    expect(result.response.status).toBe(503);
    const body = await result.response.json();
    expect(body).toEqual({
      ok: false,
      error: 'AI creations are not available right now. Please try again later.',
    });
    expect(JSON.stringify(body)).not.toContain('OPENAI_API_KEY');
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('OPENAI_API_KEY is unset'));
    logged.mockRestore();
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
