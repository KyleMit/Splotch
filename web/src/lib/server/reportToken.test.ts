// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { envState } = vi.hoisted(() => ({
  envState: {} as Record<string, string | undefined>,
}));

vi.mock('$env/dynamic/private', () => ({ env: envState }));

import { issueReportToken, verifyReportToken } from './reportToken';

const INSTALLATION_ID = 'a'.repeat(64);
const OTHER_INSTALLATION_ID = 'b'.repeat(64);
const FREE_BINDING = { kind: 'free', credential: INSTALLATION_ID } as const;
const OTHER_FREE_BINDING = { kind: 'free', credential: OTHER_INSTALLATION_ID } as const;
const MANAGED_BINDING = { kind: 'managed', credential: 'daycare-club' } as const;

// free+picture mints the legacy `expiresAt.signature` format; every other
// binding/context pair mints the context-bearing `v2.` format. The two are
// verified by separate code paths, so each adversarial case below runs against
// both — a 2026-08-15 kill-check found the v2 path's signature and expiry
// checks could be deleted outright while a legacy-only suite stayed green.
const TOKEN_FORMATS = [
  { format: 'legacy free-picture', binding: FREE_BINDING, otherBinding: OTHER_FREE_BINDING },
  {
    format: 'v2 context-bearing',
    binding: MANAGED_BINDING,
    otherBinding: { kind: 'managed', credential: 'other-club' } as const,
  },
] as const;

beforeEach(() => {
  envState.REPORT_TOKEN_SECRET = 'unit-test-report-secret';
});

describe('report tokens', () => {
  it('round-trips a token it just issued', () => {
    const token = issueReportToken(FREE_BINDING);

    expect(token).not.toBeNull();
    expect(verifyReportToken(token, FREE_BINDING)).toEqual({
      status: 'valid',
      context: { kind: 'picture' },
    });
  });

  it.each([
    { kind: 'free', credential: INSTALLATION_ID },
    { kind: 'managed', credential: 'daycare-club' },
    { kind: 'byok', credential: 'parent-key' },
  ] as const)('round-trips a signed refusal reason for $kind reporting', (binding) => {
    const token = issueReportToken(binding, {
      kind: 'false-positive-refusal',
      refusalReason: 'Request blocked for IMAGE_SAFETY',
    });

    expect(verifyReportToken(token, binding)).toEqual({
      status: 'valid',
      context: {
        kind: 'false-positive-refusal',
        refusalReason: 'Request blocked for IMAGE_SAFETY',
      },
    });
  });

  it.each(TOKEN_FORMATS)(
    'binds a $format token to the credential it was minted for',
    ({ binding, otherBinding }) => {
      const token = issueReportToken(binding);

      expect(verifyReportToken(token, otherBinding)).toEqual({ status: 'invalid' });
    }
  );

  it.each(TOKEN_FORMATS)(
    'rejects a $format token signed with a different secret',
    ({ binding }) => {
      const token = issueReportToken(binding);
      envState.REPORT_TOKEN_SECRET = 'rotated-secret';

      expect(verifyReportToken(token, binding)).toEqual({ status: 'invalid' });
    }
  );

  // The v2 context is the server-authenticated provider reason — the whole
  // point of signing it is that a client cannot author it. Swapping the context
  // segment while keeping the signature must fail, not deliver attacker words.
  it('rejects a v2 token whose context segment was rewritten after signing', () => {
    const token = issueReportToken(MANAGED_BINDING, {
      kind: 'false-positive-refusal',
      refusalReason: 'Request blocked for IMAGE_SAFETY',
    });
    const [prefix, expiresAt, , signature] = token!.split('.');
    const forgedContext = Buffer.from(
      JSON.stringify({ kind: 'false-positive-refusal', refusalReason: 'attacker-authored' })
    ).toString('base64url');

    expect(
      verifyReportToken([prefix, expiresAt, forgedContext, signature].join('.'), MANAGED_BINDING)
    ).toEqual({ status: 'invalid' });
  });

  it('rejects a v2 token with a missing or extra segment', () => {
    const token = issueReportToken(MANAGED_BINDING)!;
    expect(verifyReportToken(token.slice(0, token.lastIndexOf('.')), MANAGED_BINDING)).toEqual({
      status: 'invalid',
    });
    expect(verifyReportToken(`${token}.extra`, MANAGED_BINDING)).toEqual({ status: 'invalid' });
  });

  it.each([
    ['empty', ''],
    ['no separator', 'deadbeef'],
    ['non-numeric expiry', 'soon.deadbeef'],
    ['missing signature', `${Date.now() + 60_000}.`],
  ])('rejects a malformed token (%s)', (_label, token) => {
    expect(verifyReportToken(token, FREE_BINDING)).toEqual({ status: 'invalid' });
  });

  // A forged token carries an attacker-chosen expiry, so an unauthenticated
  // token must never be reported as merely expired.
  it('calls an unsigned far-future token invalid rather than valid', () => {
    const farFuture = Date.now() + 10 * 365 * 24 * 60 * 60 * 1000;

    expect(verifyReportToken(`${farFuture}.${'0'.repeat(64)}`, FREE_BINDING)).toEqual({
      status: 'invalid',
    });
  });

  it.each(TOKEN_FORMATS)('expires a $format token once its lifetime elapses', ({ binding }) => {
    vi.useFakeTimers();
    try {
      const token = issueReportToken(binding);
      expect(verifyReportToken(token, binding).status).toBe('valid');

      vi.advanceTimersByTime(3 * 60 * 60 * 1000);
      expect(verifyReportToken(token, binding)).toEqual({ status: 'expired' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports an unset secret distinctly from a bad token', () => {
    const token = issueReportToken(FREE_BINDING);
    envState.REPORT_TOKEN_SECRET = undefined;

    expect(issueReportToken(FREE_BINDING)).toBeNull();
    expect(verifyReportToken(token, FREE_BINDING)).toEqual({ status: 'unconfigured' });
  });
});
