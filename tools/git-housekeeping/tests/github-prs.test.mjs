import { describe, expect, it } from 'vitest';
import { indexPullRequestsByHead } from '../lib/github-prs.mjs';

describe('indexPullRequestsByHead', () => {
  it('keeps one entry per head: open beats merged beats closed, newest within a state', () => {
    const index = indexPullRequestsByHead([
      { number: 10, state: 'CLOSED', headRefName: 'reused', mergeCommit: null },
      { number: 12, state: 'MERGED', headRefName: 'reused', mergeCommit: { oid: 'abc' } },
      { number: 11, state: 'CLOSED', headRefName: 'reused', mergeCommit: null },
      { number: 20, state: 'CLOSED', headRefName: 'retried', mergeCommit: null },
      { number: 21, state: 'OPEN', headRefName: 'retried', mergeCommit: null },
      { number: 30, state: 'CLOSED', headRefName: 'twice-closed', mergeCommit: null },
      { number: 31, state: 'CLOSED', headRefName: 'twice-closed', mergeCommit: null },
    ]);

    expect(index.get('reused')).toEqual({ number: 12, state: 'MERGED', mergeCommit: 'abc' });
    expect(index.get('retried')).toEqual({ number: 21, state: 'OPEN', mergeCommit: null });
    expect(index.get('twice-closed')).toEqual({ number: 31, state: 'CLOSED', mergeCommit: null });
    expect(index.has('unknown')).toBe(false);
  });
});
