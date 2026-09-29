# Git housekeeping

This capability retires what agent sessions leave behind: linked worktrees, the local branches they
were cut on, and the remote branches on `origin` that never got deleted. The `prune-git-workspace`
skill is the procedure that runs these scripts in order and owns the judgment calls they hand back.

## Entry points

| Entry point                     | Public command              | Purpose                                                                 |
| ------------------------------- | --------------------------- | ----------------------------------------------------------------------- |
| `salvage-worktree-evidence.mjs` | `npm run worktrees:salvage` | Move gitignored evidence out of agent worktrees before they are removed |
| `prune-agent-worktrees.mjs`     | `npm run worktrees:prune`   | Remove clean, merged, unused agent worktrees                            |
| `prune-local-branches.mjs`      | `npm run branches:prune`    | Delete provably-dead local branches; report why every other one stays   |
| `gather-remote-branches.mjs`    | `npm run branches:gather`   | One row of facts per `origin` branch for the skill's remote triage      |

`branches:prune` has a second form for the skill's judgment pass — a single approved branch, deleted
only while it still points at the commit that was judged and only while no worktree holds it:

```sh
npm run branches:prune -- --delete-branch=<name> --at=<commit>
```

Every command is a **dry run by default** and prints one line per item —
`<outcome>  <subject> <reason>` — so a run that takes a minute shows progress and a cancelled one
still says what it did. Pass `--apply` to act; pass `--json` for machine-readable rows. All four run
on macOS and Linux.

## Worktrees

Both scripts discover worktrees from `git worktree list --porcelain`, never from a directory glob,
and consider only those under a **root**: the main checkout's `.claude/worktrees/`,
`~/.codex/worktrees/`, and `/tmp` by default, or whatever `--root=<dir>` (repeatable) names. The
main checkout, the worktree the command runs from, and anything outside every root are reported as
excluded and never touched. Neither script deletes a branch.

Both scripts ask the same question before touching a worktree: is a process sitting in it? The
answer comes from a process listing (`lsof -d cwd`, or `/proc` on Linux), and a listing that worked
always names the process that asked for it. One that does not has failed — `lsof` is off `PATH`, or
the shell may not inspect processes — and cannot say that a worktree is unused. Both scripts then
report every unlocked worktree as `skip (use unknown)`, print what the listing needs, and exit 1
under `--apply` having moved and removed nothing from a live worktree. An `lsof` that exits non-zero
still counts, because it does so whenever any process refuses inspection; one killed by a signal or
cut off at the output buffer does not, because it stops at an arbitrary point. A listing that names
this process and hides others still passes; the check catches a listing that failed, not one that
lies.

`worktrees:salvage` skips a locked worktree and one some process has as its cwd, exactly as the
prune does, and rechecks both immediately before each move — a plan is minutes old by the time
`--apply` runs, and moving a running capture's output out from under it splits the run. For the rest
it lists the ignored paths (`git status -z --ignored=matching`; without `-z` git quotes a path that
holds a space or a non-ASCII character, and a quoted path matches no prefix; an entry it cannot read
stops the run) and partitions them by the `SALVAGE_PREFIXES` allowlist in `lib/agent-worktrees.mjs`:
raw performance captures under `perf-profiles/` and red-team material under
`tools/redteam/{decrypted,output}/` and `web/tests/redteam/{decrypted,output}/` are moved to
`~/Code/splotch-worktree-evidence/<worktree id>/<path>` (`--dest=<dir>` overrides); everything else
ignored is reported as `leave` for the prune to delete. A destination that already exists is a
`conflict` and is not overwritten. Moves fall back to copy-then-delete across filesystems.

`worktrees:prune` fetches `origin` first (a stale `origin/main` can only keep more, and the script
says so if the fetch fails) and then removes a worktree only when every guard passes, in this order:

| Outcome              | Guard                                                                        |
| -------------------- | ---------------------------------------------------------------------------- |
| `keep`               | Directory already gone; the entry is left in place (see below)               |
| `skip (locked)`      | `git worktree lock` was set, with its reason                                 |
| `skip (use unknown)` | The process listing failed, so nobody can say the worktree is unused         |
| `skip (in use)`      | A process has its cwd inside (`lsof -d cwd`, or `/proc` on Linux), with pids |
| `keep`               | Unsalvaged evidence under an allowlisted prefix — run `worktrees:salvage`    |
| `keep`               | `git status --porcelain` is not empty (modified or untracked paths)          |
| `keep`               | `HEAD` is not an ancestor of `origin/main`, with the commit count ahead      |
| `remove`             | Clean, merged, salvaged, unused — `git worktree remove` without `--force`    |

A plan is minutes old by the time `--apply` reaches a `remove` row, so every guard above is asked
again of the live entry immediately before the removal, with a fresh process listing. A worktree
that no longer passes, or whose `HEAD` has moved since the plan, is reported `kept` with the reason.

A worktree whose directory is gone has only its admin entry left, which holds that worktree's `HEAD`
and `HEAD` reflog. Either can be the last reference to a commit: a detached commit, one a reset left
only in the reflog, or a branch deleted while still checked out. The script never drops such an
entry, because neither way to drop one is safe unattended. `git worktree prune` takes no path and
drops every prunable entry in the repository, the ones outside every root included.
`git worktree remove <path>` drops one entry, but deletes the directory too if it has come back by
the time the command runs. Once you have checked what the entry holds, `git worktree remove <path>`
drops it; `git gc` also expires such entries after `gc.worktreePruneExpire`.

## Local branches

`branches:prune` fetches with `--prune`, loads every PR's state in one `gh pr list` call, and
classifies each local branch against `origin/main` (`--base=` overrides). The never-delete set is
reported as `skip`: the base branch, the current checkout, any branch checked out in a worktree
(with the path), and any branch with an open PR. The rest sorts into three tiers:

| Plan row | Proof                                                                                           | On `--apply`                        |
| -------- | ----------------------------------------------------------------------------------------------- | ----------------------------------- |
| `delete` | Tip is an ancestor of `origin/main` (`--merged` semantics; a gone upstream is noted)            | `git branch -d`                     |
| `proven` | Every commit has a **verbatim** counterpart on the base, or the branch's whole diff matches its | Deleted at the proven commit id,    |
|          | merged PR's squash commit verbatim                                                              | only with `--include-equivalent`    |
| `keep`   | Unique commits, or a whitespace-blind patch-id match with no verbatim counterpart               | Nothing — the skill's judgment pass |

**Every patch-id git computes ignores whitespace.** `git cherry` and `git patch-id` both strip it
before hashing, so a branch that differs from what landed only in whitespace reads as already merged
— and in a repository where dprint reflows Markdown, a reformat branch differs in nothing else. So
`git cherry` only nominates a branch. `branchLandedVerbatim` is the proof: it redoes that per-commit
search with `--verbatim` patch-ids, comparing each branch commit only against base commits touching
the same files, so the search stays small. A squash merge has no per-commit counterpart to find —
its commits were collapsed into one — so there the verbatim comparison of the whole branch diff
against the squash commit is itself the byte-exact proof.

The proof deliberately asks whether each commit *landed*, not whether the branch's files match the
base's files today. A branch whose work landed and whose files the base then edited twenty more
times is still fully recoverable from the base; demanding present-tense equality would refuse every
real rebase-merge in a repository that keeps moving, which on this checkout was all seven of them.

Forced deletion goes through `git update-ref -d refs/heads/<name> <proven tip>`, never
`git branch -D`. The name would be resolved again at deletion time, so a branch that gained a commit
during the tens of seconds classification takes would be destroyed on the strength of a proof about
a commit it no longer carries. `update-ref` is also lower-level than `git branch -D` and drops that
command's refusal to delete a branch checked out in another worktree, so that check is made
explicitly against a worktree list read at deletion time. `git branch -d` needs neither guard: it
re-derives merged-ness itself and refuses a branch that moved somewhere unmerged.

`git branch -d` is the safety mechanism and the script never bypasses it for the `delete` tier. It
judges merged-ness against the invoking checkout's `HEAD`, so a checkout behind `origin/main`
refuses a branch the base already contains; the row then reads `kept (git branch -d refused …)` and
`--include-equivalent` — the flag that permits deletion after the script's own proof — is the
documented way past it. `--apply` refuses to run without PR state, because an open PR is in the
never-delete set and cannot be excluded blind; fix `gh auth status` and rerun.

`branches:gather` is the remote half's fact table (ahead, behind, `inbase`, age, tip subject, and a
`*` on the current checkout's branch), oldest first. `inbase=yes` means the tip is already on the
base, or every commit has a byte-identical counterpart there — it carries the same verbatim proof
the local pass uses, because the skill kills an `inbase=yes` branch on sight. Only a branch with
`ahead > 0` pays for that proof; on the 2026-09-04 checkout that was 5 of 419. A squash-merged
branch shows `no` and needs the PR check the skill performs. It deletes nothing: remote deletion is
outward-facing and stays the user's, via the script the skill hands back.

## Libraries

`lib/git-facts.mjs` owns the worktree and branch-ref parsers, the merged-ness proofs, and the
commit-pinned ref delete; `lib/github-prs.mjs` the one-call PR index (open beats merged beats closed
when a head is reused); `lib/process-cwds.mjs` the live-cwd detection; `lib/agent-worktrees.mjs`
root filtering, the salvage allowlist, and the `worktreeHold` guard both worktree passes share;
`lib/outcome-report.mjs` the per-row output. Entry points take injected proofs and process listings
so every guard is exercised by `tests/` on a throwaway repository with a bare `origin`
(`tests/fixtures/temp-repo.mjs`).

## Failure behavior

A failed fetch or PR lookup is reported and the run continues as a plan. A failed process listing is
reported, skips every unlocked worktree, and fails an `--apply` run. Per-item git failures are
reported on that row (`kept (git … refused: …)`) and the run continues. Unknown flags fail closed so
a misspelled `--apply` cannot fall through to a run that deletes. The scripts never use `--force` on
a worktree, never delete a branch from the worktree scripts, and never push.

Verify with:

```sh
npm run test:tools -- git-housekeeping
```
