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

  it('binds the token to the installation it was minted for', () => {
    const token = issueReportToken(FREE_BINDING);

    expect(verifyReportToken(token, OTHER_FREE_BINDING)).toEqual({ status: 'invalid' });
  });

  it('rejects a token signed with a different secret', () => {
    const token = issueReportToken(FREE_BINDING);
    envState.REPORT_TOKEN_SECRET = 'rotated-secret';

    expect(verifyReportToken(token, FREE_BINDING)).toEqual({ status: 'invalid' });
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

  it('expires a token once its lifetime elapses', () => {
    vi.useFakeTimers();
    try {
      const token = issueReportToken(FREE_BINDING);
      expect(verifyReportToken(token, FREE_BINDING).status).toBe('valid');

      vi.advanceTimersByTime(3 * 60 * 60 * 1000);
      expect(verifyReportToken(token, FREE_BINDING)).toEqual({ status: 'expired' });
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
