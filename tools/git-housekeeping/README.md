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

`worktrees:salvage` lists each worktree's ignored paths (`git status --ignored=matching`) and
partitions them by the `SALVAGE_PREFIXES` allowlist in `lib/agent-worktrees.mjs`: raw performance
captures under `perf-profiles/` and red-team material under `tools/redteam/{decrypted,output}/` and
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

| Plan row | Proof                                                                                            | On `--apply`                          |
| -------- | ------------------------------------------------------------------------------------------------ | ------------------------------------- |
| `delete` | Tip is an ancestor of `origin/main` (`--merged` semantics; a gone upstream is noted)             | `git branch -d`                       |
| `proven` | Every commit has a patch-id equivalent on the base (rebase-merged), or the branch's diff matches | `git branch -D`, only with            |
|          | its merged PR's squash commit (`git patch-id --stable` on both diffs)                            | `--include-equivalent`; proof printed |
| `keep`   | Unique commits: PR merged but content differs, PR closed unmerged, or no PR at all               | Nothing — the skill's judgment pass   |

`git branch -d` is the safety mechanism and the script never bypasses it for the `delete` tier. It
judges merged-ness against the invoking checkout's `HEAD`, so a checkout behind `origin/main`
refuses a branch the base already contains; the row then reads `kept (git branch -d refused …)` and
`--include-equivalent` — the flag that permits `-D` after the script's own proof — is the documented
way past it. `--apply` refuses to run without PR state, because an open PR is in the never-delete
set and cannot be excluded blind; fix `gh auth status` and rerun.

`branches:gather` is the remote half's fact table (ahead, behind, `inbase`, age, tip subject, and a
`*` on the current checkout's branch), oldest first. `inbase=yes` means every commit already has a
patch-equivalent on the base; a squash-merged branch shows `no` and needs the PR check the skill
performs. It deletes nothing: remote deletion is outward-facing and stays the user's, via the script
the skill hands back.

## Libraries

`lib/git-facts.mjs` owns the worktree and branch-ref parsers and the three merged-ness proofs;
`lib/github-prs.mjs` the one-call PR index (open beats merged beats closed when a head is reused);
`lib/process-cwds.mjs` the live-cwd detection; `lib/agent-worktrees.mjs` root filtering and the
salvage allowlist; `lib/outcome-report.mjs` the per-row output. Entry points take injected proofs
and process lists so every guard is exercised by `tests/` on a throwaway repository with a bare
`origin` (`tests/fixtures/temp-repo.mjs`).

## Failure behavior

A failed fetch or PR lookup is reported and the run continues as a plan. Per-item git failures are
reported on that row (`kept (git … refused: …)`) and the run continues. Unknown flags fail closed so
a misspelled `--apply` cannot fall through to a run that deletes. The scripts never use `--force` on
a worktree, never delete a branch from the worktree scripts, and never push.

Verify with:

```sh
npm run test:tools -- git-housekeeping
```
