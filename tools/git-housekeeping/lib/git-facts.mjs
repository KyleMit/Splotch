// Git facts the housekeeping scripts share: worktree discovery, branch refs,
// and the three merged-ness proofs (ancestry, patch-id equivalence, squash
// match). Every proof is computed against an explicit base ref so the scripts
// never depend on which branch the invoking checkout happens to have as HEAD.

import { spawnSync } from 'node:child_process';

class GitError extends Error {}

// A refusal quotes what it found; output that holds no terminator at all is the
// whole listing, and an error that long hides its own first line.
const REFUSAL_EXCERPT_CHARS = 80;

// A listing read for its NUL terminators stays untrimmed. `git` and `tryGit` trim,
// which edits the first or the last entry whenever it starts or ends with
// whitespace, and a path, a commit subject, and a lock reason all can.
function gitUntrimmed(args, { cwd, input } = {}) {
  const result = spawnSync('git', args, { cwd, input, encoding: 'utf8' });
  if (result.error) throw new GitError(`git ${args.join(' ')}: ${result.error.message}`);
  if (result.status !== 0) {
    throw new GitError(
      `git ${args.join(' ')} exited ${result.status}: ${(result.stderr ?? '').trim()}`
    );
  }
  return result.stdout ?? '';
}

// What follows the last terminator is nothing, or the newline `for-each-ref`
// prints after each record. Anything else is output that was not NUL-terminated,
// and reading it as an empty listing would tell a caller nothing is there.
function nulTerminatedEntries(text) {
  const entries = text.split('\0');
  const remainder = entries.pop();
  if (remainder !== '' && remainder !== '\n') {
    throw new GitError(
      `expected NUL-terminated git output, found ${JSON.stringify(remainder.slice(0, REFUSAL_EXCERPT_CHARS))} after the last terminator; refusing to guess`
    );
  }
  return entries;
}

export function git(args, options) {
  return gitUntrimmed(args, options).trim();
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

// `git worktree list --porcelain -z` (git 2.36+) ends every attribute with a NUL
// and every worktree with an empty attribute; the first block is always the main
// checkout. Without `-z` the terminator is a newline, which a worktree path can
// hold: the path is then cut short and the rest of it is read as attributes.
export function parseWorktreeList(porcelain) {
  const worktrees = [];
  let current = null;
  for (const line of nulTerminatedEntries(porcelain)) {
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
  return parseWorktreeList(gitUntrimmed(['worktree', 'list', '--porcelain', '-z'], { cwd }));
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
const REF_FIELD_COUNT = REF_FIELDS.length + 1;
const RECORD_NEWLINE = /^\n/;
const OBJECT_ID = /^[0-9a-f]{40,64}$/;
const UNIX_SECONDS = /^\d+$/;
const AHEAD_BEHIND = /^(\d+) (\d+)$/;

function refuseBranchRef(name, field, value) {
  throw new GitError(
    `for-each-ref printed ${JSON.stringify(value)} as ${field} of ${JSON.stringify(name)}; refusing to guess`
  );
}

// `for-each-ref` ends each record with a newline of its own, which lands in
// front of the next record's ref name once the listing is split on NUL. A ref
// name holds no newline, so dropping one there removes nothing of the name.
function parseBranchRef(fields) {
  const [name, tip, upstream, track, unix, iso, author, subject, aheadBehind] = fields;
  const refName = name.replace(RECORD_NEWLINE, '');
  if (!OBJECT_ID.test(tip)) refuseBranchRef(refName, 'the commit id', tip);
  if (!UNIX_SECONDS.test(unix)) refuseBranchRef(refName, 'the commit date', unix);
  const counts = AHEAD_BEHIND.exec(aheadBehind);
  if (!counts) refuseBranchRef(refName, 'the ahead/behind counts', aheadBehind);
  return {
    name: refName,
    tip,
    upstream: upstream || null,
    upstreamGone: track === '[gone]',
    committedAt: Number(unix),
    date: iso.slice(0, 10),
    author,
    subject,
    ahead: Number(counts[1]),
    behind: Number(counts[2]),
  };
}

// Every field ends in a NUL, the one byte git accepts in none of them. An
// author name and a commit subject can hold a tab, and an upstream name read
// from config a tab or a newline, so either as the separator lets the text
// move the counts into another column: a subject of `Add rows<TAB>0 0 …` read
// as zero commits ahead, which is the merged verdict. The strict field checks
// are what turns any remaining surprise into a refusal instead of a default.
//
// `%(ahead-behind:<base>)` (git 2.41+) answers "commits unique to the branch /
// commits it is missing" for every ref in one walk, instead of two rev-list
// calls per branch.
export function parseBranchRefs(text) {
  const fields = nulTerminatedEntries(text);
  if (fields.length % REF_FIELD_COUNT !== 0) {
    throw new GitError(
      `for-each-ref printed ${fields.length} NUL-terminated fields, not whole records of ${REF_FIELD_COUNT}; refusing to guess`
    );
  }
  const refs = [];
  for (let start = 0; start < fields.length; start += REF_FIELD_COUNT) {
    refs.push(parseBranchRef(fields.slice(start, start + REF_FIELD_COUNT)));
  }
  return refs;
}

// `refs/remotes/<remote>/HEAD` is a symbolic ref pointing at the remote's default
// branch, not a branch of its own, and `for-each-ref` over the namespace reports it
// like any other ref — as a branch whose short name is the bare remote name, always
// zero ahead and zero behind because it resolves to the base. It therefore lands in
// every "nothing new here" bucket a caller computes, and a triage pass that feeds
// those buckets to `git push --delete` would target the remote's HEAD pointer.
// Symbolic refs are dropped by name after enumeration rather than by `--exclude`:
// a glob's `*` does not cross the `/` a remote name may contain, and an exact path
// is still a prefix match there, which would also hide a real branch like `HEAD/x`.
const SYMBOLIC_REF_NAME_FORMAT = '%(if)%(symref)%(then)%(refname:short)%(end)';

// The base goes into the format as a commit id, never as the name it was given:
// a ref name may hold `)` and `%(`, and `main)%(symref` would close the atom
// early and count every branch against `main` instead.
export function listBranchRefs(cwd, { base, namespace }) {
  const baseCommit = git(['rev-parse', '--verify', '--end-of-options', `${base}^{commit}`], {
    cwd,
  });
  const format = [...REF_FIELDS, `%(ahead-behind:${baseCommit})`]
    .map((field) => `${field}%00`)
    .join('');
  const symbolic = new Set(
    git(['for-each-ref', `--format=${SYMBOLIC_REF_NAME_FORMAT}`, namespace], { cwd })
      .split('\n')
      .filter(Boolean)
  );
  const refs = parseBranchRefs(
    gitUntrimmed(['for-each-ref', `--format=${format}`, namespace], { cwd })
  );
  return refs.filter((ref) => !symbolic.has(ref.name));
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

// `--verbatim` hashes exactly the bytes it reads, so it is fed git's built-in
// diff, as bytes. A trim would drop the trailing whitespace of the last line, a
// UTF-8 decode would fold every invalid byte into one replacement character, and
// a host's textconv driver can render two different files alike: each lets a
// change that never landed hash the same as one that did. A host's
// `diff.external` or `color.diff=always` leaves nothing `patch-id` can read, so a
// landed change would read as unproven.
function verbatimPatchId(from, to, cwd) {
  const diff = spawnSync(
    'git',
    ['diff', '--no-ext-diff', '--no-textconv', '--no-color', from, to],
    { cwd }
  );
  if (diff.error || diff.status !== 0 || diff.stdout.length === 0) return null;
  const out = git(['patch-id', '--verbatim'], { cwd, input: diff.stdout });
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
    const paths = pathsChangedBy(commit, cwd);
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

// `-z` prints each path as it is stored. Without it git quotes and escapes a
// path holding a non-ASCII byte, a tab, a newline, a quote, or a backslash, and
// the quoted spelling names no file once it is handed back as a pathspec, so a
// commit touching only such paths never finds the counterpart it has. A commit
// whose paths cannot be listed reads as changing none, which proves nothing.
function pathsChangedBy(commit, cwd) {
  try {
    return nulTerminatedEntries(
      gitUntrimmed(['diff', '--name-only', '-z', `${commit}^`, commit], { cwd })
    );
  } catch (error) {
    if (error instanceof GitError) return [];
    throw error;
  }
}

function commitPatchId(commit, cwd) {
  return verbatimPatchId(`${commit}^`, commit, cwd);
}

// A squash merge leaves no commit of the branch on the base, but the squash
// commit's diff against its parent is the branch's whole diff against the merge
// base, so a faithful squash produces the same verbatim patch-id and conflict
// resolution or a later commit produces a different one. With no per-commit
// counterpart for `branchLandedVerbatim` to find, this comparison is the proof
// for a squash-merged branch.
export function squashMatches(base, tip, mergeCommit, cwd) {
  if (!mergeCommit) return false;
  const mergeBase = tryGit(['merge-base', base, tip], { cwd });
  if (!mergeBase.ok) return false;
  const branchId = verbatimPatchId(mergeBase.stdout, tip, cwd);
  return branchId !== null && branchId === commitPatchId(mergeCommit, cwd);
}

// The worktree currently holding a branch, read fresh from git, or null.
export function worktreeHoldingBranch(name, cwd) {
  return listWorktrees(cwd).find((worktree) => worktree.branch === name)?.path ?? null;
}

// Delete a ref only while it still points at the commit a proof was computed
// against. `git branch -D` resolves the name at deletion time, so a branch that
// gained a commit between planning and applying — tens of seconds, on a
// checkout with 700 branches and other sessions running — is destroyed on the
// strength of a proof about a commit it no longer carries.
//
// `update-ref` is the atomic form, but it is also lower-level than
// `git branch -D` and drops that command's refusal to delete a branch checked
// out in another worktree. Deleting one leaves that session's HEAD pointing at
// a ref that no longer exists, so the check `update-ref` does not make is made
// here, against a worktree list read at deletion time rather than planning time.
export function deleteRefAtCommit(name, expectedTip, cwd) {
  const holder = worktreeHoldingBranch(name, cwd);
  if (holder) {
    return { ok: false, status: null, stdout: '', stderr: `checked out in ${holder}` };
  }
  return tryGit(['update-ref', '-d', `refs/heads/${name}`, expectedTip], { cwd });
}

export function listRemotes(cwd) {
  return git(['remote'], { cwd }).split('\n').filter(Boolean);
}

export function fetchBase(cwd, { remote = 'origin', prune = true } = {}) {
  return tryGit(['fetch', remote, ...(prune ? ['--prune'] : [])], { cwd });
}
