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

// Every patch-id comparison git offers is whitespace-blind: `git cherry` and
// `git patch-id` (with or without `--stable`) strip whitespace before hashing,
// so a branch whose only difference from what landed is `a  b` against `ab`
// reads as already-merged. `--verbatim` is the whitespace-respecting variant,
// and this is a repository where whitespace is content: dprint reflows
// Markdown, and a reformat branch differs from main in nothing else.
//
// So a patch-id match is only ever a *hypothesis* here, and every caller must
// confirm it with `branchLandedVerbatim` before anything is deleted.
export function isPatchEquivalent(base, tip, cwd) {
  const cherry = git(['cherry', base, tip], { cwd });
  if (cherry.length === 0) return false;
  return !cherry.split('\n').some((line) => line.startsWith('+'));
}

function patchIdOf(diff, cwd) {
  if (!diff) return null;
  const out = git(['patch-id', '--verbatim'], { cwd, input: diff });
  return out ? out.split(' ')[0] : null;
}

// The proof that deleting a branch loses nothing: every commit unique to the
// branch has a byte-identical counterpart on the base. `git cherry` answers
// this question already, but whitespace-blindly, so this redoes its work with
// `--verbatim` patch-ids.
//
// Doing that naively would mean hashing every commit on the base the branch is
// behind — thousands, for a branch a year old. Instead each branch commit is
// compared only against base commits touching the same files, which is a
// handful, and the whole check only ever runs on a branch `git cherry` has
// already nominated. Measured on the 2026-09-04 checkout: 0.1s to 8.3s for the
// seven nominated branches, nothing for the other seven hundred.
//
// It deliberately does not compare the branch's files to the base's *current*
// ones. A branch whose work landed and whose files the base then edited twenty
// more times is still fully recovered from the base, and demanding present-tense
// equality would refuse every such branch — which is every real rebase-merge in
// a repository that keeps moving.
export function branchLandedVerbatim(base, tip, cwd) {
  const mergeBase = tryGit(['merge-base', base, tip], { cwd });
  if (!mergeBase.ok) return false;
  const ownCommits = tryGit(['rev-list', `${base}..${tip}`], { cwd });
  if (!ownCommits.ok) return false;
  const commits = ownCommits.stdout.split('\n').filter(Boolean);
  if (commits.length === 0) return false;

  for (const commit of commits) {
    const files = tryGit(['diff', '--name-only', `${commit}^`, commit], { cwd });
    if (!files.ok) return false;
    const paths = files.stdout.split('\n').filter(Boolean);
    if (paths.length === 0) return false;
    const wanted = commitPatchId(commit, cwd);
    if (!wanted) return false;
    const candidates = tryGit(['rev-list', `${mergeBase.stdout}..${base}`, '--', ...paths], {
      cwd,
    });
    if (!candidates.ok) return false;
    const landed = candidates.stdout
      .split('\n')
      .filter(Boolean)
      .some((candidate) => commitPatchId(candidate, cwd) === wanted);
    if (!landed) return false;
  }
  return true;
}

function commitPatchId(commit, cwd) {
  const diff = tryGit(['diff', `${commit}^`, commit], { cwd });
  if (!diff.ok) return null;
  return patchIdOf(diff.stdout, cwd);
}

// A squash merge leaves no commit of the branch on the base, but the squash
// commit's diff against its parent is the branch's whole diff against the merge
// base, so a faithful squash produces the same verbatim patch-id and conflict
// resolution or a later commit produces a different one. Like every patch-id
// test here this is a hypothesis; `branchLandedVerbatim` is the proof.
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

// Delete a ref only while it still points at the commit a proof was computed
// against. `git branch -D` resolves the name at deletion time, so a branch that
// gained a commit between planning and applying — tens of seconds, on a
// checkout with 700 branches and other sessions running — is destroyed on the
// strength of a proof about a commit it no longer carries.
export function deleteRefAtCommit(name, expectedTip, cwd) {
  return tryGit(['update-ref', '-d', `refs/heads/${name}`, expectedTip], { cwd });
}

export function listRemotes(cwd) {
  return git(['remote'], { cwd }).split('\n').filter(Boolean);
}

export function fetchBase(cwd, { remote = 'origin', prune = true } = {}) {
  return tryGit(['fetch', remote, ...(prune ? ['--prune'] : [])], { cwd });
}
