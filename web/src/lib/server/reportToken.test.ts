// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { envState } = vi.hoisted(() => ({
  envState: {} as Record<string, string | undefined>,
}));

vi.mock('$env/dynamic/private', () => ({ env: envState }));

import { issueReportToken, verifyReportToken } from './reportToken';

const INSTALLATION_ID = 'a'.repeat(64);
const OTHER_INSTALLATION_ID = 'b'.repeat(64);

beforeEach(() => {
  envState.REPORT_TOKEN_SECRET = 'unit-test-report-secret';
});

describe('report tokens', () => {
  it('round-trips a token it just issued', () => {
    const token = issueReportToken(INSTALLATION_ID);

    expect(token).not.toBeNull();
    expect(verifyReportToken(token, INSTALLATION_ID)).toBe('valid');
  });

  it('binds the token to the installation it was minted for', () => {
    const token = issueReportToken(INSTALLATION_ID);

    expect(verifyReportToken(token, OTHER_INSTALLATION_ID)).toBe('invalid');
  });

  it('rejects a token signed with a different secret', () => {
    const token = issueReportToken(INSTALLATION_ID);
    envState.REPORT_TOKEN_SECRET = 'rotated-secret';

    expect(verifyReportToken(token, INSTALLATION_ID)).toBe('invalid');
  });

  it.each([
    ['empty', ''],
    ['no separator', 'deadbeef'],
    ['non-numeric expiry', 'soon.deadbeef'],
    ['missing signature', `${Date.now() + 60_000}.`],
  ])('rejects a malformed token (%s)', (_label, token) => {
    expect(verifyReportToken(token, INSTALLATION_ID)).toBe('invalid');
  });

  // A forged token carries an attacker-chosen expiry, so an unauthenticated
  // token must never be reported as merely expired.
  it('calls an unsigned far-future token invalid rather than valid', () => {
    const farFuture = Date.now() + 10 * 365 * 24 * 60 * 60 * 1000;

    expect(verifyReportToken(`${farFuture}.${'0'.repeat(64)}`, INSTALLATION_ID)).toBe('invalid');
  });

  it('expires a token once its lifetime elapses', () => {
    vi.useFakeTimers();
    try {
      const token = issueReportToken(INSTALLATION_ID);
      expect(verifyReportToken(token, INSTALLATION_ID)).toBe('valid');

      vi.advanceTimersByTime(3 * 60 * 60 * 1000);
      expect(verifyReportToken(token, INSTALLATION_ID)).toBe('expired');
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports an unset secret distinctly from a bad token', () => {
    const token = issueReportToken(INSTALLATION_ID);
    envState.REPORT_TOKEN_SECRET = undefined;

    expect(issueReportToken(INSTALLATION_ID)).toBeNull();
    expect(verifyReportToken(token, INSTALLATION_ID)).toBe('unconfigured');
  });
});
