<!-- Source: .ruler/skill-notes/prune-git-workspace.md.template -->

# prune-git-workspace — design notes

Absorbs `prune-remote-branches` (2026-07, the remote half) and issue #1580 (the worktree salvage and
prune scripts), and adds the local-branch pass that had no owner. Issue #1648 is the spec; the
measurements that motivated it were taken on 2026-09-04: 701 local branches, 512 already merged, 417
tracking a deleted remote, 26 live worktrees, several held by concurrent agent sessions.

## Why one skill and one capability folder

The three surfaces were discovered one at a time and had three homes — a skill, a script issue,
nothing. A cleanup session had to remember all three existed, and each had rediscovered the same
hazards (concurrent sessions hold things; squash merges look unmerged; never touch the open-PR set).
Folding them into `tools/git-housekeeping/` puts the merged-ness proofs, the PR index, and the
worktree discovery in one `lib/` that all four entry points share, and the skill becomes the order
in which to run them plus the judgment the scripts hand back.

The old skill's `gather.mjs` moved out of the skill package for the same reason the
`vectorize-image` note gives: once a skill ships a real program, triplicating it through Ruler is
cost without benefit, and the local pass needed the same `ahead`/`inbase` facts anyway.
`%(ahead-
behind:origin/main)` in `for-each-ref` (git 2.41+) replaced the two `rev-list` calls per
branch the old helper made — 709 branches classify in about 27 s on the 2026-09-04 checkout, most of
it the per-branch `cherry` on the unmerged remainder.

## The `-d` / `-D` decision

The spec was firm that the scripted pass must never use `-D`, and equally firm that squash-merged
branches must be classified as dead. Those two pull against each other: `git branch -d` judges
merged-ness by **ancestry against the invoking checkout's HEAD** (with an upstream check that is
trivially satisfied for a branch in sync with its own remote). A rebase-merged or squash-merged
branch is never an ancestor of anything, so `-d` refuses it forever; the only git-native way to
delete one is `-D`. And a checkout that is merely behind `origin/main` makes `-d` refuse branches
the base already contains.

The resolution is the two-tier plan. `delete` rows are ancestors of `origin/main` and go through
`-d`, so git's own check stays as the second opinion. `proven` rows carry a proof git does not
compute, and are deleted only behind `--include-equivalent`, each row printing its proof and PR. The
same flag lets a `-d` refusal from a stale HEAD fall through, because ancestry of `origin/main` is a
stronger proof than the one the flag already accepts. The spec invited exactly this kind of explicit
decision ("the local pass may be able to relax that"); the default run still honours the letter and
the flag's name says what it relaxes.

What that proof consists of, and why the forced deletion names a commit rather than a branch, both
changed in round 1 of the rival review — see below. `git patch-id --stable` and a bare
`git branch -D` are what this section originally described, and neither survived.

Numbers from the first dry run (2026-09-04): 511 `delete`, 7 `proven` (all rebase-merged; this repo
merges PRs with merge commits, so the squash proof had zero hits and is covered only by the fixture
test), 177 `keep` (102 closed-unmerged PRs, 75 with no PR), 14 `skip` (all worktree-held).

## PR state gates `--apply`

An open PR is in the never-delete set and nothing in git knows about it. The one-call `gh pr list`
index costs about five seconds for a thousand PRs, versus one call per branch, and when it is
unavailable the script still plans — the plan is useful — but refuses to apply. The alternative, a
`--without-pr-check` escape hatch, was rejected: the case it serves (a cloud session without `gh`)
is one where local branch deletion is meaningless anyway, because the cloud checkout is fresh.

## Worktree guards, and the two that were wrong on the first run

Ordering is deliberate: `prunable`, `locked`, in-use, unsalvaged evidence, dirty, unmerged, remove.
The cheap and categorical guards run before the two-second `git status`.

**Unsalvaged evidence used `existsSync` first** and produced sixteen false `keep`s on the first real
run: `/private/tmp/splotch-capture-pr1633` has 292 files under `perf-profiles/`, every one of them
**tracked** (the repo commits evidence under `perf-profiles/evidence/` via a negated ignore rule).
Tracked content survives `git worktree remove` in the repository itself; only ignored content is at
risk. The guard now asks git for the ignored paths under the salvage prefixes, and the salvage
script uses the same lister, so the two cannot disagree about what "unsalvaged" means.

**The ignored listing used the default `--ignored` mode first**, which collapses to the highest
directory whose contents are all ignored. In a fixture checkout with nothing else under `tools/`,
`tools/redteam/output/` was reported as `tools/` and matched no prefix. `--ignored=matching` lists
each path that matches an ignore rule instead, and in the real repo — where `/perf-profiles/*` is
the rule — reports the per-run directories the salvage actually moves.

`web/tests/redteam/{decrypted,output}/` joined the allowlist after reading `.gitignore`: the same
red-team material the spec named under `tools/redteam/`, ignored by the same rule shape.

## Test fixture trap: a cherry-pick can reproduce the same SHA

The first fixture cherry-picked a commit straight onto its own parent with a pinned committer
identity, inside the same second. Git produced a byte-identical commit — same tree, parent, message,
author and committer timestamps — so the "rebase-merged" branch was an ancestor of main and the
equivalence proof was never exercised. Every cherry-pick in the tests now lands on a main that has
moved by an unrelated commit first. Worth knowing before adding a scenario.

## What round 1 of the rival review found (2026-09-04)

Four blocking defects, each reproduced on a throwaway repo before it was believed, and all four in
the same family: a *proof* that was weaker than the deletion it authorized.

* **Every patch-id git computes ignores whitespace.** `git cherry` and `git patch-id` — with or
  without `--stable` — strip whitespace before hashing. A branch whose `message.txt` reads `a  b`
  against a base's `ab` produced `-` from `git cherry` and entered the `equivalent` tier. That is
  not academic here: dprint reflows Markdown, so a reformat branch is a branch that differs from
  main in *nothing but* whitespace, and the worked example in the skill (`bump-dprint-markdown`) is
  exactly such a branch. `git cherry` now only nominates; `branchLandedVerbatim` redoes its
  per-commit search with `--verbatim` patch-ids and is the actual proof. A nomination with no
  verbatim counterpart is demoted to `keep` with that reason, which is a more useful row than either
  a silent delete or a bare "unique commits".

  **The first fix for this was wrong in an instructive way, and the real checkout caught it.** It
  compared the branch's touched files to the base's files *as they are now*. That is sound logically
  and useless in practice: main had moved `engine.ts` twenty-five times since the branch landed, so
  every one of the seven genuinely rebase-merged branches was demoted and the `proven` tier silently
  emptied. A tier that never fires is a tier that does not exist, and the dry-run count (`7 proven`
  → `0 proven`) was the only thing that said so — the suite was green either way. The question a
  deletion proof has to ask is whether the work *landed*, not whether the base still looks like the
  branch. `git merge-tree --write-tree` was tried before the per-commit search and rejected: on
  branches this old it reports a conflict rather than an answer, and a conflict does not distinguish
  "work missing" from "base moved on".

  Squash merges take the other path. Their commits were collapsed into one, so no individual commit
  has a counterpart to find and the per-commit proof cannot pass; there the verbatim comparison of
  the whole branch diff against the squash commit is the byte-exact proof on its own.
* **`git branch -D` re-resolves the name at deletion time.** The proof is computed for a commit, so
  a branch that gained a commit between planning and applying — tens of seconds, on a checkout with
  700 branches while other sessions run — was deleted on the strength of a proof about a commit it
  no longer carried. Reproduced by planning at SHA A, committing unique work to reach SHA B, and
  watching `deleteLocalBranch` report `deleted`. Every forced deletion now goes through
  `git update-ref -d refs/heads/<name> <proven tip>`, which fails when the ref moved. `-d` needs no
  guard: it re-derives merged-ness and refuses a branch that moved somewhere unmerged, which is
  precisely the check being raced. The judgment pass in the skill was changed the same way — it is
  the step most likely to sit between reading a delta and deleting.
* **`protectedBranchName` took the last path component.** `--base=origin/release/1.x` protected a
  branch named `1.x` and left `release/1.x` deletable; an end-to-end fixture deleted the base branch
  with `-d`. It now strips only a configured remote's prefix, which also handles a base that is
  already a local name.
* **The salvage pass honoured none of the prune's guards.** It planned a move out of a worktree
  locked as `capture running` with a live `perf-profiles/` directory. Both passes now share
  `worktreeHold`, and both recheck with `stillHeld` immediately before acting, because a plan is
  minutes old by the time `--apply` runs and the salvage's cross-filesystem path deletes the source
  after copying.

The through-line worth keeping: the first three all read as safe because a git command said so, and
in each case the git command was answering a slightly different question than the one being asked.
`git cherry` answers "was this patch applied", not "is this content present"; `git branch -D`
answers "delete this name", not "delete this commit". A proof used to authorize a deletion has to be
read for what it literally establishes.

Two fixture traps surfaced alongside them, both the same SHA-collision shape already noted below: a
control commit made with the fixture's pinned identity, the same tree, parent, and message inside
one second **is** the other commit, so a branch built that way is an ancestor rather than a
patch-equivalent and the test proves nothing. Build equivalence cases by cherry-picking onto a base
that has moved.

## Rejected

* **`git branch --merged` as the classifier.** Same ancestry test as `-d`, misses every rebase and
  squash merge, and would have under-deleted 7 branches here while quietly teaching people to reach
  for `-D` by hand — the exact outcome the spec warned about.
* **Deleting from the worktree scripts.** Removing a worktree and deleting its branch are different
  decisions with different evidence; the branch pass sees the freed branch on its next run.
* **A `tools/worktrees/` capability** (the shape #1580 proposed). Fine for the worktree slice alone;
  once local and remote branches share the proofs, the domain is git housekeeping, not worktrees.
* **Auto-running the remote deletions.** Unchanged from the absorbed skill: a cloud session cannot
  (`HTTP 403` on ref deletion through the relay, no MCP delete tool), and a local session should not
  — deleting a hundred refs on `origin` is outward-facing and irreversible.
* **A `--without-pr-check` flag** — see above.

## Open questions

* The default worktree roots (`.claude/worktrees`, `~/.codex/worktrees`, `/tmp`) are the three
  places worktrees existed on 2026-09-04. Kyle's hand-made checkouts under `~/Code/` are outside
  every root by design; if a runner starts cutting worktrees somewhere new, the default list is the
  only thing that notices, and it notices by silently not considering them.
* The judgment pass's "recoverable from nowhere" row — upstream gone, no PR — is the one step that
  can lose commits. An automatic `refs/archive/<branch>` tag before `-D` was considered and left out
  to keep the ref namespace from growing a second graveyard; revisit if a deletion is ever
  regretted.
* `lsof -d cwd` on a busy host lists several hundred processes and takes a second; `/proc` is the
  Linux fallback. Neither sees a process on another machine holding a network-mounted worktree,
  which does not occur here today.
