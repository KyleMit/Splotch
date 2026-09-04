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
compute — every commit patch-equivalent on the base (`git cherry`), or the branch's diff against its
merge base matching the merged PR's squash commit's diff under `git patch-id --stable` — and are
deleted with `-D` only behind `--include-equivalent`, each row printing its proof and PR. The same
flag lets a `-d` refusal from a stale HEAD fall through to `-D`, because ancestry of `origin/main`
is a stronger proof than the one the flag already accepts. The spec invited exactly this kind of
explicit decision ("the local pass may be able to relax that"); the default run still honours the
letter — no `-D` without the flag — and the flag's name says what it relaxes.

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
