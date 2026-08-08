// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { isAllowedToken, peekRateLimit, rateLimit } = vi.hoisted(() => ({
  isAllowedToken: vi.fn(),
  peekRateLimit: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock('$lib/server/tokens', () => ({ isAllowedToken }));
vi.mock('$lib/server/rateLimit', () => ({ peekRateLimit, rateLimit }));

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
  isAllowedToken.mockReset().mockResolvedValue(true);
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
    expect(isAllowedToken).not.toHaveBeenCalled();
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it('charges the shared bucket only on a failed verification', async () => {
    isAllowedToken.mockResolvedValue(false);

    const response = await post({ code: 'wrong-guess' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: false,
      error: 'That access code was not recognized.',
    });
    expect(peekRateLimit).toHaveBeenCalledWith(key, rateLimitPolicy.verifyAccessCode);
    expect(isAllowedToken).toHaveBeenCalledWith('wrong-guess');
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
    expect(isAllowedToken).not.toHaveBeenCalled();
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it('returns the malformed JSON explanation in the canonical failure body', async () => {
    const response = await postRaw('not json');

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Expected a JSON body',
    });
    expect(isAllowedToken).not.toHaveBeenCalled();
    expect(rateLimit).not.toHaveBeenCalled();
  });
});
