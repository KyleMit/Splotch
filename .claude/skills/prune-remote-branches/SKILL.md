---
name: prune-remote-branches
description: Triage and delete stale remote branches on origin. Use when asked to clean up, prune, or delete old remote branches — the leftover branches from cloud sessions and merged PRs that never auto-deleted. Kills the obviously-dead ones and reports the ambiguous ones for a keep/kill decision.
---

# Prune Remote Branches

`origin` accumulates branches faster than they get deleted — every cloud session spins one up, and
plenty of merged PRs never had "delete branch on merge" turned on. This skill triages every remote
branch, deletes the ones that are provably dead, and hands back the judgment calls for the user to
decide.

**Scope: remote branches on `origin` only.** This never touches local branches, and it never deletes
anything until the user has seen the plan and approved it.

## Never delete

Exclude these before triaging anything — they are off-limits regardless of what the data says:

* **`main`** (the default branch).
* **The current checkout** — the branch this session is working on. `gather.mjs` marks it with `*`.
* **Any branch with an OPEN pull request.** An open PR is active work; its branch stays.

## Step 1 — Gather the facts

Run the helper. It fetches with `--prune`, then prints one row per remote branch (oldest first) with
the git-derivable facts, so you don't spend a git call per branch:

```
node .claude/skills/prune-remote-branches/gather.mjs
```

Columns: `ahead` (commits unique to the branch), `behind` (commits on main it's missing), `inbase`
(`yes` = every commit already has an equivalent in main — an ordinary merge; **squash merges show
`no`**, so they still need a PR check), `age` (days since the tip commit), `date`, `subject`. Add
`--json` for machine-readable output, `--no-fetch` to skip the network round-trip on a re-run.

## Step 2 — Classify each branch

Sort every branch (minus the "Never delete" set) into one of these buckets:

| Bucket                | Test                                                                                   | Verdict          |
| --------------------- | -------------------------------------------------------------------------------------- | ---------------- |
| **A — nothing new**   | `ahead = 0` or `inbase = yes` — no unique work; already in main                        | Kill             |
| **B — PR resolved**   | `ahead > 0` but its PR is **merged or closed** (catches squash merges `gather` missed) | Kill             |
| **C — stale & moot**  | `ahead > 0`, no open PR, `age > 7d`, and you're confident it's superseded or abandoned | Kill (with note) |
| **D — needs a human** | Anything else — recent, or a real diff with no clear resolution                        | **Report, ask**  |

**Finding the PR for a branch** (needed for B, and to confirm no *open* PR for C/D). Use whichever
is available:

* GitHub MCP: `search_pull_requests` with `repo:<owner>/<repo> head:<branch>` (returns all states),
  or `list_pull_requests` filtered by `head`.
* `gh` CLI (local sessions): `gh pr list --head <branch> --state all --json number,state,title`.

Batch these lookups — you only need PR state for branches with `ahead > 0`.

**Bucket C judgment.** Don't kill on staleness alone. Look at the delta
(`git log --oneline origin/main..origin/<branch>` and
`git diff --stat origin/main...origin/<branch>`) and decide whether the idea already landed some
other way — the same idea is often explored across several branches, and once one lands the siblings
are dead. If you can't tell, it's bucket D, not C.

## Step 3 — Present the plan, then delete

Show the user a single consolidated plan before deleting anything:

1. **Auto-kill list (buckets A, B, C)** — a compact table: branch · age/last-active · one-line
   reason (`no unique commits`, `PR #123 merged`, `superseded by #140`). This is the batch you
   propose to delete.
2. **Decide list (bucket D)** — one row per branch with **branch name · last active date · a short
   summary of the changes**. Default every row to *kill*; ask the user which to **preserve**. Keep
   the summary to a sentence — enough to decide without opening the diff.

Get one explicit approval, then delete. Batch the deletions (a handful per command keeps output
readable and errors attributable):

```
git push origin --delete <branch-1> <branch-2> <branch-3>
```

If a delete is rejected by branch protection, report it and move on — don't fight it.

## Notes

* Deleting a remote branch is outward-facing and effectively irreversible for the user (the ref is
  gone from origin). Always land Step 3's approval first — never delete straight off the gathered
  table.
* A closed-unmerged PR still means the branch is dead (the work was rejected) — bucket B, kill.
* Re-run `gather.mjs --no-fetch` after a pass to confirm the count dropped and nothing unexpected
  survived.
