// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { checkAccessToken, peekRateLimit, rateLimit } = vi.hoisted(() => ({
  checkAccessToken: vi.fn<typeof import('$lib/server/tokens').checkAccessToken>(),
  peekRateLimit: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock('$lib/server/tokens', () => ({ checkAccessToken }));
vi.mock('$lib/server/rateLimit', () => ({ peekRateLimit, rateLimit }));

import { KEY_CHECK_UNAVAILABLE_CODE } from '$lib/ai/keyFormat';
import { verifyAccessCodeBucket } from '$lib/server/rateLimitKeys';
import { rateLimitPolicy } from '$lib/server/rateLimitPolicy';
import { POST } from './+server';

const address = '203.0.113.5';
const key = verifyAccessCodeBucket(address);

function post(body: unknown) {
  const request = new Request('http://localhost/api/verify-access-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST({ request, getClientAddress: () => address } as unknown as Parameters<
    typeof POST
  >[0]);
}

function postRaw(body: string) {
  const request = new Request('http://localhost/api/verify-access-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  return POST({ request, getClientAddress: () => address } as unknown as Parameters<
    typeof POST
  >[0]);
}

beforeEach(() => {
  checkAccessToken.mockReset().mockResolvedValue({ verdict: 'allowed' });
  peekRateLimit.mockReset().mockReturnValue({ limited: false, retryAfter: 0 });
  rateLimit.mockReset().mockReturnValue({ limited: false, retryAfter: 0 });
});

describe('POST /api/verify-access-code', () => {
  it('peeks the shared bucket on entry and blind-throttles a limited IP without reading the allowlist', async () => {
    peekRateLimit.mockReturnValue({ limited: true, retryAfter: 12 });

    const response = await post({ code: 'sunny-meadow' });

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('12');
    expect(peekRateLimit).toHaveBeenCalledWith(key, rateLimitPolicy.verifyAccessCode);
    expect(checkAccessToken).not.toHaveBeenCalled();
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it('charges the shared bucket only on a failed verification', async () => {
    checkAccessToken.mockResolvedValue({ verdict: 'denied', spendsGuess: true });

    const response = await post({ code: 'wrong-guess' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: false,
      error: 'That access code was not recognized.',
    });
    expect(peekRateLimit).toHaveBeenCalledWith(key, rateLimitPolicy.verifyAccessCode);
    expect(checkAccessToken).toHaveBeenCalledWith('wrong-guess');
    expect(rateLimit).toHaveBeenCalledOnce();
    expect(rateLimit).toHaveBeenCalledWith(key, rateLimitPolicy.verifyAccessCode);
  });

  // The same third answer /api/verify-key gives when its check got no answer,
  // which the client already reads as "try again" for either endpoint.
  it('answers an unreadable allowlist with 503 KEY_CHECK_UNAVAILABLE, charging nothing', async () => {
    checkAccessToken.mockResolvedValue({ verdict: 'unavailable', spendsGuess: false });

    const response = await post({ code: 'console-added' });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      code: KEY_CHECK_UNAVAILABLE_CODE,
      error: "We couldn't check that key just now. Please try again.",
    });
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it('still charges an unavailable answer that depended on the code', async () => {
    checkAccessToken.mockResolvedValue({ verdict: 'unavailable', spendsGuess: true });

    const response = await post({ code: 'console-added' });

    expect(response.status).toBe(503);
    expect(rateLimit).toHaveBeenCalledOnce();
    expect(rateLimit).toHaveBeenCalledWith(key, rateLimitPolicy.verifyAccessCode);
  });

  it('keeps a successful verification out of the shared bucket', async () => {
    const response = await post({ code: 'sunny-meadow' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, accessCode: 'sunny-meadow' });
    expect(peekRateLimit).toHaveBeenCalledWith(key, rateLimitPolicy.verifyAccessCode);
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it('never charges the bucket or reads the allowlist for an empty code', async () => {
    const response = await post({ code: '   ' });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: 'No access code provided' });
    expect(checkAccessToken).not.toHaveBeenCalled();
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it('returns the malformed JSON explanation in the canonical failure body', async () => {
    const response = await postRaw('not json');

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Expected a JSON body',
    });
    expect(checkAccessToken).not.toHaveBeenCalled();
    expect(rateLimit).not.toHaveBeenCalled();
  });
});
