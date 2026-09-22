import { describe, expect, it } from 'vitest';
import {
  readinessProblems,
  renderReadiness,
  summarizeCheckRuns,
} from '../lib/release-readiness.mjs';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const green = (name) => ({ name, status: 'completed', conclusion: 'success' });

const ready = {
  head: SHA_A,
  upstream: SHA_A,
  branch: 'main',
  checkRuns: [
    green('Quality'),
    green('Unit tests'),
    { name: 'Firefox smoke', status: 'completed', conclusion: 'skipped' },
  ],
};

describe('summarizeCheckRuns', () => {
  it('sorts runs into failing and pending, treating skipped and neutral as passes', () => {
    expect(
      summarizeCheckRuns([
        green('Quality'),
        { name: 'Firefox smoke', status: 'completed', conclusion: 'neutral' },
        { name: 'Tests (1/4)', status: 'in_progress', conclusion: null },
        { name: 'WebKit commit gate (fast)', status: 'completed', conclusion: 'failure' },
      ])
    ).toEqual({
      total: 4,
      failing: ['WebKit commit gate (fast) (failure)'],
      pending: ['Tests (1/4)'],
    });
  });
});

describe('readinessProblems', () => {
  it('is empty when HEAD is the green tip of origin/main', () => {
    expect(readinessProblems(ready)).toEqual([]);
  });

  it('refuses a stale or unpushed HEAD', () => {
    expect(readinessProblems({ ...ready, upstream: SHA_B })).toEqual([
      expect.stringMatching(/is not origin\/main/),
    ]);
  });

  it('refuses a branch other than main and a dirty tree', () => {
    const problems = readinessProblems({
      ...ready,
      branch: 'feat/x',
      dirtyPaths: ['web/src/a.ts'],
    });
    expect(problems).toEqual([
      'on branch feat/x, not main',
      'working tree has 1 uncommitted path(s)',
    ]);
  });

  // A commit pushed seconds ago has no check runs yet; that is not green.
  it('refuses a commit CI has not reported on, or is still running on', () => {
    expect(readinessProblems({ ...ready, checkRuns: [] })).toEqual([
      'no CI check runs reported for HEAD yet',
    ]);
    expect(
      readinessProblems({
        ...ready,
        checkRuns: [{ name: 'Quality', status: 'queued', conclusion: null }],
      })
    ).toEqual(['CI still running: Quality']);
  });

  it('names every failing check', () => {
    const checkRuns = [
      ...ready.checkRuns,
      { name: 'Lint', status: 'completed', conclusion: 'failure' },
      { name: 'Tests (2/4)', status: 'completed', conclusion: 'cancelled' },
    ];
    expect(readinessProblems({ ...ready, checkRuns })).toEqual([
      'CI failed: Lint (failure), Tests (2/4) (cancelled)',
    ]);
  });
});

describe('renderReadiness', () => {
  it('says which gates only the tag will exercise', () => {
    const out = renderReadiness({ head: SHA_A, problems: [], checkRuns: ready.checkRuns });
    expect(out).toContain('✓ HEAD is origin/main and its CI is green');
    expect(out).toContain(
      'not covered until the tag exists: Android Deploy Smoke, iOS Deploy Smoke, WebKit commit gate (full)'
    );
  });
});
