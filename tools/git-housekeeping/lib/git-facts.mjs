// Git facts the housekeeping scripts share: worktree discovery, branch refs,
// and the three merged-ness proofs (ancestry, patch-id equivalence, squash
// match). Every proof is computed against an explicit base ref so the scripts
// never depend on which branch the invoking checkout happens to have as HEAD.

import { spawnSync } from 'node:child_process';

class GitError extends Error {}

export function git(args, { cwd, input } = {}) {
  const result = spawnSync('git', args, { cwd, input, encoding: 'utf8' });
  if (result.error) throw new GitError(`git ${args.join(' ')}: ${result.error.message}`);
  if (result.status !== 0) {
    throw new GitError(
      `git ${args.join(' ')} exited ${result.status}: ${(result.stderr ?? '').trim()}`
    );
  }
  return (result.stdout ?? '').trim();
}

export function tryGit(args, { cwd, input } = {}) {
  const result = spawnSync('git', args, { cwd, input, encoding: 'utf8' });
  return {
    ok: !result.error && result.status === 0,
    status: result.status,
    stdout: (result.stdout ?? '').trim(),
    stderr: result.error ? result.error.message : (result.stderr ?? '').trim(),
  };
}

export function currentWorktreeOf(cwd) {
  return git(['rev-parse', '--show-toplevel'], { cwd });
}

export function currentBranchOf(cwd) {
  const name = git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
  return name === 'HEAD' ? null : name;
}

// `git worktree list --porcelain` prints one attribute per line and a blank
// line between worktrees; the first block is always the main checkout.
export function parseWorktreeList(porcelain) {
  const worktrees = [];
  let current = null;
  for (const line of porcelain.split('\n')) {
    if (line === '') {
      if (current) worktrees.push(current);
      current = null;
      continue;
    }
    const space = line.indexOf(' ');
    const key = space === -1 ? line : line.slice(0, space);
    const value = space === -1 ? '' : line.slice(space + 1);
    if (key === 'worktree') {
      current = {
        path: value,
        head: null,
        branch: null,
        detached: false,
        bare: false,
        locked: null,
        prunable: null,
      };
      continue;
    }
    if (!current) continue;
    if (key === 'HEAD') current.head = value;
    else if (key === 'branch') current.branch = value.replace(/^refs\/heads\//, '');
    else if (key === 'detached') current.detached = true;
    else if (key === 'bare') current.bare = true;
    else if (key === 'locked') current.locked = value || 'locked';
    else if (key === 'prunable') current.prunable = value || 'prunable';
  }
  if (current) worktrees.push(current);
  return worktrees;
}

export function listWorktrees(cwd) {
  return parseWorktreeList(git(['worktree', 'list', '--porcelain'], { cwd }));
}

const REF_FIELDS = [
  '%(refname:short)',
  '%(objectname)',
  '%(upstream:short)',
  '%(upstream:track)',
  '%(committerdate:unix)',
  '%(committerdate:iso8601)',
  '%(authorname)',
  '%(subject)',
];

// `%(ahead-behind:<base>)` (git 2.41+) answers "commits unique to the branch /
// commits it is missing" for every ref in one walk, instead of two rev-list
// calls per branch.
export function parseBranchRefs(text) {
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, tip, upstream, track, unix, iso, author, subject, aheadBehind] =
        line.split('\t');
      const [ahead, behind] = aheadBehind.split(' ').map(Number);
      return {
        name,
        tip,
        upstream: upstream || null,
        upstreamGone: track === '[gone]',
        committedAt: Number(unix),
        date: iso.slice(0, 10),
        author,
        subject,
        ahead,
        behind,
      };
    });
}

export function listBranchRefs(cwd, { base, namespace }) {
  const format = [...REF_FIELDS, `%(ahead-behind:${base})`].join('%09');
  return parseBranchRefs(git(['for-each-ref', `--format=${format}`, namespace], { cwd }));
}

export function isAncestor(commit, base, cwd) {
  const result = tryGit(['merge-base', '--is-ancestor', commit, base], { cwd });
  if (result.ok) return true;
  if (result.status === 1) return false;
  throw new GitError(result.stderr);
}

// `git cherry` prints `-` for a commit whose patch-id already exists on the
// base and `+` for one that does not. Equivalent means every commit is a `-`:
// the branch was merged by rebase or cherry-pick, so ancestry says no while
// the content is entirely on the base.
export function isPatchEquivalent(base, tip, cwd) {
  const cherry = git(['cherry', base, tip], { cwd });
  if (cherry.length === 0) return false;
  return !cherry.split('\n').some((line) => line.startsWith('+'));
}

function patchIdOf(diff, cwd) {
  if (!diff) return null;
  const out = git(['patch-id', '--stable'], { cwd, input: diff });
  return out ? out.split(' ')[0] : null;
}

// A squash merge leaves no commit of the branch on the base, but the squash
// commit's diff against its parent is the branch's whole diff against the merge
// base. `git patch-id` ignores line numbers and whitespace, so the two match
// whenever the squash was faithful, and differ when conflict resolution or a
// later commit changed what actually landed.
export function squashMatches(base, tip, mergeCommit, cwd) {
  if (!mergeCommit) return false;
  const mergeBase = tryGit(['merge-base', base, tip], { cwd });
  if (!mergeBase.ok) return false;
  const branchDiff = tryGit(['diff', mergeBase.stdout, tip], { cwd });
  const landedDiff = tryGit(['diff', `${mergeCommit}^`, mergeCommit], { cwd });
  if (!branchDiff.ok || !landedDiff.ok) return false;
  const branchId = patchIdOf(branchDiff.stdout, cwd);
  return branchId !== null && branchId === patchIdOf(landedDiff.stdout, cwd);
}

export function fetchBase(cwd, { remote = 'origin', prune = true } = {}) {
  return tryGit(['fetch', remote, ...(prune ? ['--prune'] : [])], { cwd });
}
