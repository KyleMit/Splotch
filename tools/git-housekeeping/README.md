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

Every command is a **dry run by default** and prints one line per item —
`<outcome>  <subject>
<reason>` — so a run that takes a minute shows progress and a cancelled one
still says what it did. Pass `--apply` to act; pass `--json` for machine-readable rows. All four run
on macOS and Linux.

## Worktrees

Both scripts discover worktrees from `git worktree list --porcelain`, never from a directory glob,
and consider only those under a **root**: the main checkout's `.claude/worktrees/`,
`~/.codex/worktrees/`, and `/tmp` by default, or whatever `--root=<dir>` (repeatable) names. The
main checkout, the worktree the command runs from, and anything outside every root are reported as
excluded and never touched. Neither script deletes a branch.

`worktrees:salvage` skips a locked worktree and one some process has as its cwd, exactly as the
prune does, and rechecks both immediately before each move — a plan is minutes old by the time
`--apply` runs, and moving a running capture's output out from under it splits the run. For the rest
it lists the ignored paths (`git status --ignored=matching`) and partitions them by the
`SALVAGE_PREFIXES` allowlist in `lib/agent-worktrees.mjs`: raw performance captures under
`perf-profiles/` and red-team material under `tools/redteam/{decrypted,output}/` and
`web/tests/redteam/{decrypted,output}/` are moved to
`~/Code/splotch-worktree-evidence/<worktree
id>/<path>` (`--dest=<dir>` overrides); everything else
ignored is reported as `leave` for the prune to delete. A destination that already exists is a
`conflict` and is not overwritten. Moves fall back to copy-then-delete across filesystems.

`worktrees:prune` fetches `origin` first (a stale `origin/main` can only keep more, and the script
says so if the fetch fails) and then removes a worktree only when every guard passes, in this order:

| Outcome         | Guard                                                                         |
| --------------- | ----------------------------------------------------------------------------- |
| `prunable`      | Directory already gone; `git worktree prune` cleans the entry under `--apply` |
| `skip (locked)` | `git worktree lock` was set, with its reason                                  |
| `skip (in use)` | A process has its cwd inside (`lsof -d cwd`, or `/proc` on Linux), with pids  |
| `keep`          | Unsalvaged evidence under an allowlisted prefix — run `worktrees:salvage`     |
| `keep`          | `git status --porcelain` is not empty (modified or untracked paths)           |
| `keep`          | `HEAD` is not an ancestor of `origin/main`, with the commit count ahead       |
| `remove`        | Clean, merged, salvaged, unused — `git worktree remove` without `--force`     |

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
a commit it no longer carries. `git branch -d` needs no such guard: it re-derives merged-ness itself
and refuses a branch that moved somewhere unmerged.

`git branch -d` is the safety mechanism and the script never bypasses it for the `delete` tier. It
judges merged-ness against the invoking checkout's `HEAD`, so a checkout behind `origin/main`
refuses a branch the base already contains; the row then reads `kept (git branch -d refused …)` and
`--include-equivalent` — the flag that permits deletion after the script's own proof — is the
documented way past it. `--apply` refuses to run without PR state, because an open PR is in the
never-delete set and cannot be excluded blind; fix `gh auth status` and rerun.

`branches:gather` is the remote half's fact table (ahead, behind, `inbase`, age, tip subject, and a
`*` on the current checkout's branch), oldest first. `inbase=yes` means every commit already has a
patch-equivalent on the base; a squash-merged branch shows `no` and needs the PR check the skill
performs. Like every patch-id here it is whitespace-blind, which is why it feeds a triage the skill
performs rather than a deletion the script performs. It deletes nothing: remote deletion is
outward-facing and stays the user's, via the script the skill hands back.

## Libraries

`lib/git-facts.mjs` owns the worktree and branch-ref parsers, the merged-ness proofs, and the
commit-pinned ref delete; `lib/github-prs.mjs` the one-call PR index (open beats merged beats closed
when a head is reused); `lib/process-cwds.mjs` the live-cwd detection; `lib/agent-worktrees.mjs`
root filtering, the salvage allowlist, and the `worktreeHold` guard both worktree passes share;
`lib/outcome-report.mjs` the per-row output. Entry points take injected proofs and process lists so
every guard is exercised by `tests/` on a throwaway repository with a bare `origin`
(`tests/fixtures/temp-repo.mjs`).

## Failure behavior

A failed fetch or PR lookup is reported and the run continues as a plan. Per-item git failures are
reported on that row (`kept (git … refused: …)`) and the run continues. Unknown flags fail closed so
a misspelled `--apply` cannot fall through to a run that deletes. The scripts never use `--force` on
a worktree, never delete a branch from the worktree scripts, and never push.

Verify with:

```sh
npm run test:tools -- git-housekeeping
```
