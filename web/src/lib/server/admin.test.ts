// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';

// admin.ts reads ADMIN_ACCESS_TOKEN from $env/dynamic/private on every call, so
// a mutable mocked env object lets each test set the secret it needs.
const { envState } = vi.hoisted(() => ({
  envState: {} as Record<string, string | undefined>,
}));
vi.mock('$env/dynamic/private', () => ({ env: envState }));

import {
  sessionToken,
  constantTimeEqual,
  verifyAdminSecret,
  verifySessionToken,
  buildInvites,
  beginAdminLogin,
  bearerToken,
  SESSION_LABEL,
} from './admin';

// Mirror of the derivation in admin.ts: the algorithm is pinned here as a
// literal, while the label comes from the exported SESSION_LABEL so a rotation
// bump in source is tracked automatically rather than checked against a stale
// hand-typed copy.
const expectedSession = (secret: string) =>
  createHmac('sha256', secret).update(SESSION_LABEL).digest('hex');

describe('sessionToken', () => {
  beforeEach(() => {
    envState.ADMIN_ACCESS_TOKEN = undefined;
  });

  it('is empty when no secret is configured', () => {
    expect(sessionToken()).toBe('');
  });

  it('derives a deterministic 64-char hex HMAC from the secret', () => {
    envState.ADMIN_ACCESS_TOKEN = 'super-secret';
    const token = sessionToken();
    expect(token).toBe(expectedSession('super-secret'));
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(sessionToken()).toBe(token);
  });

  it('produces a different session for a different secret', () => {
    envState.ADMIN_ACCESS_TOKEN = 'secret-a';
    const a = sessionToken();
    envState.ADMIN_ACCESS_TOKEN = 'secret-b';
    expect(sessionToken()).not.toBe(a);
  });
});

describe('constantTimeEqual', () => {
  it('rejects missing provided or expected values', () => {
    expect(constantTimeEqual(undefined, 'x')).toBe(false);
    expect(constantTimeEqual('x', undefined)).toBe(false);
    expect(constantTimeEqual('', 'x')).toBe(false);
    expect(constantTimeEqual('x', '')).toBe(false);
  });

  it('rejects values of differing length', () => {
    expect(constantTimeEqual('short', 'longer-value')).toBe(false);
  });

  it('rejects same-length but different values', () => {
    expect(constantTimeEqual('aaaa', 'bbbb')).toBe(false);
  });

  it('accepts an exact match', () => {
    expect(constantTimeEqual('matching', 'matching')).toBe(true);
  });
});

describe('verifyAdminSecret', () => {
  beforeEach(() => {
    envState.ADMIN_ACCESS_TOKEN = 'the-raw-secret';
  });

  it('accepts the raw configured secret', () => {
    expect(verifyAdminSecret('the-raw-secret')).toBe(true);
  });

  it('rejects a wrong secret and undefined', () => {
    expect(verifyAdminSecret('nope')).toBe(false);
    expect(verifyAdminSecret(undefined)).toBe(false);
  });
});

describe('verifySessionToken', () => {
  it('accepts the derived session token and rejects anything else', () => {
    envState.ADMIN_ACCESS_TOKEN = 'the-raw-secret';
    expect(verifySessionToken(sessionToken())).toBe(true);
    expect(verifySessionToken('not-the-session')).toBe(false);
    // The raw secret is not itself a valid session token.
    expect(verifySessionToken('the-raw-secret')).toBe(false);
  });

  it('rejects everything when no secret is configured', () => {
    envState.ADMIN_ACCESS_TOKEN = undefined;
    expect(verifySessionToken('')).toBe(false);
    expect(verifySessionToken('anything')).toBe(false);
  });
});

// The limiter keeps state in a module-level Map that persists for the whole
// file, so every case here uses its own IP. That both front doors draw on the
// same bucket is proved end-to-end in routes/admin/login.integration.test.ts —
// these cases cover the sequence itself.
describe('beginAdminLogin', () => {
  beforeEach(() => {
    envState.ADMIN_ACCESS_TOKEN = 'the-raw-secret';
  });

  it('mints the derived session for the raw secret and 403s anything else', () => {
    const attempt = beginAdminLogin('10.0.0.1');
    if (!attempt.ok) throw new Error('expected a first attempt to pass the throttle');
    expect(attempt.verify('the-raw-secret')).toEqual({
      ok: true,
      session: expectedSession('the-raw-secret'),
    });
    expect(attempt.verify('wrong')).toEqual({ ok: false, status: 403 });
  });

  it('spends one hit per call, so a caller that never verifies still exhausts its budget', () => {
    // The throttle is charged up front precisely so each transport can answer
    // 429 before it parses its payload.
    for (let i = 0; i < 10; i++) expect(beginAdminLogin('10.0.0.2').ok).toBe(true);
    const limited = beginAdminLogin('10.0.0.2');
    if (limited.ok) throw new Error('expected the eleventh attempt to be throttled');
    expect(limited.status).toBe(429);
    expect(limited.retryAfter).toBeGreaterThanOrEqual(1);
  });

  it('buckets per IP, so one client cannot lock another out', () => {
    for (let i = 0; i < 11; i++) beginAdminLogin('10.0.0.3');
    expect(beginAdminLogin('10.0.0.4').ok).toBe(true);
  });
});

describe('bearerToken', () => {
  const withAuth = (value: string | undefined) =>
    new Request(
      'https://splotch.art',
      value === undefined ? {} : { headers: { authorization: value } }
    );

  it('is empty when the header is absent', () => {
    expect(bearerToken(withAuth(undefined))).toBe('');
  });

  it('is empty for the wrong scheme or a lowercase "bearer "', () => {
    expect(bearerToken(withAuth('Basic dGVzdA=='))).toBe('');
    expect(bearerToken(withAuth('bearer tok'))).toBe('');
  });

  it('is empty for "Bearer" with no trailing space', () => {
    expect(bearerToken(withAuth('Bearer'))).toBe('');
  });

  it('trims surrounding whitespace from the token', () => {
    expect(bearerToken(withAuth('Bearer  tok  '))).toBe('tok');
  });
});

describe('buildInvites', () => {
  it('pairs each token with a URL-encoded invite link', () => {
    expect(buildInvites(['a b', 'plain'], 'https://splotch.art')).toEqual([
      { token: 'a b', url: 'https://splotch.art/?ai_access_token=a%20b' },
      { token: 'plain', url: 'https://splotch.art/?ai_access_token=plain' },
    ]);
  });
});
