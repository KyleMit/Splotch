// Pull-request state for branch triage, fetched once for the whole repository
// so classifying 700 branches costs one `gh` call rather than 700.

import { hasCommand, tryCapture } from '../../lib/proc.mjs';

// gh paginates internally; the ceiling only needs to exceed the repo's PR count.
const PR_LIST_LIMIT = 5000;

const STATE_PRIORITY = { OPEN: 0, MERGED: 1, CLOSED: 2 };

// A head branch can be reused across several PRs (closed, reopened as a new
// number, merged). The one that decides the branch's fate is any open PR, then
// a merged one, then the most recent closed one.
export function indexPullRequestsByHead(pullRequests) {
  const byHead = new Map();
  for (const pr of pullRequests) {
    const entry = {
      number: pr.number,
      state: pr.state,
      mergeCommit: pr.mergeCommit?.oid ?? null,
    };
    const existing = byHead.get(pr.headRefName);
    if (
      !existing ||
      STATE_PRIORITY[entry.state] < STATE_PRIORITY[existing.state] ||
      (entry.state === existing.state && entry.number > existing.number)
    ) {
      byHead.set(pr.headRefName, entry);
    }
  }
  return byHead;
}

export function fetchPullRequestIndex({ cwd } = {}) {
  if (!hasCommand('gh')) {
    return { ok: false, index: new Map(), error: 'gh is not installed' };
  }
  const result = tryCapture(
    'gh',
    [
      'pr',
      'list',
      '--state',
      'all',
      '--limit',
      String(PR_LIST_LIMIT),
      '--json',
      'number,state,headRefName,mergeCommit',
    ],
    { cwd }
  );
  if (!result.ok) {
    return { ok: false, index: new Map(), error: result.stderr.trim() || 'gh pr list failed' };
  }
  return { ok: true, index: indexPullRequestsByHead(JSON.parse(result.stdout)), error: null };
}
