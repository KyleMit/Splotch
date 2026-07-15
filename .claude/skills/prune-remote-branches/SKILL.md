---
name: prune-remote-branches
description: Triage stale remote branches on origin and produce a deletion script for the user to run. Use when asked to clean up, prune, or delete old remote branches — the leftover branches from cloud sessions and merged PRs that never auto-deleted. Flags the obviously-dead ones, reports the ambiguous ones for a keep/kill decision, then hands back an approved script (it never deletes branches itself).
---

# Prune Remote Branches

`origin` accumulates branches faster than they get deleted — every cloud session spins one up, and
plenty of merged PRs never had "delete branch on merge" turned on. This skill triages every remote
branch, sorts the provably-dead ones from the judgment calls, gets the user's approval, and then
produces a deletion script for the user to run.

**Scope: remote branches on `origin` only.** This never touches local branches. It also never
deletes anything itself — deletion is not automatic. After the user approves the plan it emits a
script they run from a local clone (see Step 4 for why).

## Never delete

Exclude these before triaging anything — they are off-limits regardless of what the data says:

* **`main`** (the default branch).
* **The current checkout** — the branch this session is working on. `gather.mjs` marks it with `*`.
* **Any branch with an OPEN pull request.** An open PR is active work; its branch stays.
* **`pr-assets`** — the long-lived orphan branch that stores before/after screenshots and other
  image assets for PRs. It shares no history with `main` and is updated continuously, so it always
  looks like a stale outlier — never propose it for deletion.

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

## Step 3 — Present the plan, then hand off a deletion script

Show the user a single consolidated plan before touching anything:

1. **Auto-kill list (buckets A, B, C)** — a compact table: branch · age/last-active · one-line
   reason (`no unique commits`, `PR #123 merged`, `superseded by #140`). This is the batch you
   propose to delete.
2. **Decide list (bucket D)** — one row per branch with **branch name · last active date · a short
   summary of the changes**. Default every row to *kill*; ask the user which to **preserve**. Keep
   the summary to a sentence — enough to decide without opening the diff.

## Step 4 — Produce the script; the user runs it

**Do NOT delete branches yourself — you can't, and you shouldn't.** This skill never runs
`git push origin --delete`. There are two reasons, and both point to the same workflow:

* **You can't, in a cloud session.** In a Claude Code on the web session the git relay permits
  creating/updating refs but returns `HTTP 403` on ref *deletion*, and the GitHub MCP server has no
  delete-branch tool — so the push fails. The 403 is a policy denial; don't retry it or route around
  it.
* **You shouldn't, regardless.** Deleting ~150 remote branches is outward-facing and effectively
  irreversible (the refs are gone from origin). The user pulls that trigger, not you.

So after the user approves the plan, **write the final kill list to an executable script and hand it
back for them to run from a local clone with push rights.** Emit the script to the scratch dir and
deliver it as a file. Shape:

```bash
#!/usr/bin/env bash
# Delete N stale remote branches on origin (triaged by prune-remote-branches).
# Preserved: main, pr-assets, and any open-PR branch. Run from a local clone with push rights.
set -euo pipefail
branches=(
  <branch-1>
  <branch-2>
  # …
)
for ((i=0; i<${#branches[@]}; i+=40)); do
  git push origin --delete "${branches[@]:i:40}"   # batched so output stays readable
done
git ls-remote --heads origin | wc -l                # remaining count
```

Tell the user they can spare any branch at the last second by deleting its line from the array
before running. If a delete is rejected by branch protection when they run it, that's theirs to
resolve — note it in the script's comments if you know a branch is protected.

## Notes

* **Approval is mandatory and deletion is never automatic** — always land the Step 3 plan, then
  produce the Step 4 script. Never emit a script the user didn't approve the contents of.
* A closed-unmerged PR still means the branch is dead (the work was rejected) — bucket B, kill.
* After the user reports running the script, re-run `gather.mjs` (fetches with `--prune`) to confirm
  the count dropped and nothing unexpected survived.
