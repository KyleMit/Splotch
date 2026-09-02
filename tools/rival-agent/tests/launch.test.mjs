import { describe, expect, it } from 'vitest';
import {
  isRetryableResumeFailure,
  ledgerKeyFor,
  logPathForAttempt,
  parseLaunchArgs,
} from '../launch.mjs';
import { STREAM_FAILURE } from '../stream.mjs';

describe('shared launch arguments', () => {
  it('reviews against main by default and accepts one scope at a time', () => {
    expect(parseLaunchArgs([])).toMatchObject({ scope: { kind: 'base', base: 'main' } });
    expect(parseLaunchArgs(['--pr', '7'])).toMatchObject({ scope: { kind: 'pr', number: 7 } });
    expect(parseLaunchArgs(['--uncommitted'])).toMatchObject({ scope: { kind: 'uncommitted' } });
    expect(parseLaunchArgs(['--commit', 'abc'])).toMatchObject({
      scope: { kind: 'commit', commit: 'abc' },
    });
    expect(() => parseLaunchArgs(['--uncommitted', '--base', 'main'])).toThrow(
      /mutually exclusive/
    );
    expect(() => parseLaunchArgs(['--pr', 'seven'])).toThrow(/--pr/);
    expect(() => parseLaunchArgs(['--effort', 'max'])).toThrow(/effort/);
    expect(() => parseLaunchArgs(['extra'])).toThrow(/positional/);
  });

  it('opts into a fresh reviewer and into ending the session', () => {
    expect(parseLaunchArgs(['--fresh'])).toMatchObject({ fresh: true });
    expect(parseLaunchArgs(['--end-session', '--pr', '7'])).toMatchObject({
      endSession: true,
      scope: { kind: 'pr', number: 7 },
    });
  });

  it('keys the reviewer by PR, by resolved commit, or by branch', () => {
    const repoRoot = '/repo';
    const resolveCommit = (root, ref) =>
      ref === 'HEAD' || ref === 'abc1234' ? 'a'.repeat(40) : ref;
    const pr = ledgerKeyFor({ repoRoot, scope: { kind: 'pr', number: 7 }, branch: 'x' });
    expect(pr).toBe(ledgerKeyFor({ repoRoot, scope: { kind: 'pr', number: 7 }, branch: 'y' }));
    const branch = ledgerKeyFor({ repoRoot, scope: { kind: 'base', base: 'main' }, branch: 'x' });
    expect(branch).toBe(ledgerKeyFor({ repoRoot, scope: { kind: 'uncommitted' }, branch: 'x' }));
    expect(branch).not.toBe(pr);
    const byHead = ledgerKeyFor({
      repoRoot,
      scope: { kind: 'commit', commit: 'HEAD' },
      branch: 'x',
      resolveCommit,
    });
    const byShort = ledgerKeyFor({
      repoRoot,
      scope: { kind: 'commit', commit: 'abc1234' },
      branch: 'x',
      resolveCommit,
    });
    expect(byHead).toBe(byShort);
    expect(byHead).not.toBe(branch);
  });

  it('gives the one retry after a pruned resume its own stream log', () => {
    expect(logPathForAttempt('/s', 1)).toBe('/s/rival.ndjson');
    expect(logPathForAttempt('/s', 2)).toBe('/s/rival-retry.ndjson');
  });

  // Retrying a run the user stopped would spend plan usage they just tried to stop. Only the rival
  // refusing the run earns a fresh attempt.
  it('retries only when the rival itself refused the run', () => {
    expect(isRetryableResumeFailure({ code: STREAM_FAILURE.exited })).toBe(true);
    expect(isRetryableResumeFailure({ code: STREAM_FAILURE.cancelled })).toBe(false);
    expect(isRetryableResumeFailure({ code: STREAM_FAILURE.stalled })).toBe(false);
    expect(isRetryableResumeFailure({ code: STREAM_FAILURE.logFailed })).toBe(false);
    expect(isRetryableResumeFailure(new Error('something else'))).toBe(false);
  });
});
