---
name: prune-git-workspace
description: Clean up the git workspace in one pass — salvage evidence from and prune stale agent worktrees, delete provably-dead local branches by script, run a judgment pass over the unmerged remainder that makes any finding durable before its branch goes, and triage stale remote branches on origin into a deletion script for the user to run. Use when asked to clean up, prune, or delete old branches or worktrees, when a checkout has hundreds of stale local branches, or after a run of agent sessions has left worktrees behind.
---

# Prune git workspace

Agent sessions leave three kinds of debris: linked worktrees, the local branches they were cut on,
and remote branches on `origin` that never got deleted. They are one chore with one hazard set —
concurrent sessions hold some of each, "merged" has more than one meaning, and an unmerged branch
sometimes holds a finding worth more than its code — so this skill handles all three in order.

**Order matters.** A worktree holds its branch, so worktrees go first; local branches second; remote
branches last, because deleting a remote branch turns its local twin into a `gone` upstream the
local pass then catches on a rerun.

Every script below is a **dry run by default** and prints one `<outcome>  <subject>  <reason>` line
per item. Read the plan, then rerun with `-- --apply`. `tools/git-housekeeping/README.md` documents
every guard and outcome word.

## Never touch

The scripts enforce this set and the judgment pass must too:

* `main`, and the branch of the current checkout.
* Any branch checked out in a worktree — including other agents' sessions running right now. Git
  refuses these anyway; the scripts say *which* worktree holds it instead of failing opaquely.
* Any branch with an **open** pull request.
* The main checkout, the worktree you are in, a worktree some process has as its cwd, and a locked
  worktree.
* On `origin`: `pr-assets`, the orphan branch of PR screenshots that always looks like a stale
  outlier.

## Part 1 — Worktrees

`git worktree remove` deletes ignored paths silently, and a clean, merged worktree can still be a
live session's cwd. Salvage first, then prune.

1. `npm run worktrees:salvage` — lists each agent worktree's ignored paths and plans the allowlisted
   evidence (`perf-profiles/`, red-team `decrypted/` and `output/`) out to
   `~/Code/splotch-worktree-evidence/<worktree id>/`, reporting the rest as `leave`. A locked or
   in-use worktree is skipped with its reason and rechecked again at move time, so a capture that
   starts between the plan and the apply keeps its output. Skim the `salvage` rows, then
   `npm run worktrees:salvage -- --apply`. Anything worth more than a stash belongs in
   `docs/scratchpad/` or the scrapbook afterwards, not in that directory forever.
2. `npm run worktrees:prune` — one row per agent worktree under `.claude/worktrees/`,
   `~/.codex/worktrees/`, and `/tmp` (`--root=<dir>` to add or replace). `remove` rows are clean,
   merged into `origin/main`, salvaged, and nobody's cwd. Every `keep` and `skip (in use)` row says
   why; a `keep (uncommitted changes)` is usually another session mid-work — leave it. Then
   `npm run worktrees:prune -- --apply`.

Removing a worktree frees its branch for Part 2, so run Part 1 to completion before planning
branches.

## Part 2 — Local branches

### Scripted pass (no judgment)

`npm run branches:prune` fetches with `--prune`, loads every PR's state through `gh`, and classifies
each local branch:

| Row      | Meaning                                                                         | `--apply` does                                    |
| -------- | ------------------------------------------------------------------------------- | ------------------------------------------------- |
| `delete` | Tip is an ancestor of `origin/main`                                             | `git branch -d` — the safety valve stays in place |
| `proven` | Every commit has a **verbatim** counterpart on main, or a verbatim squash match | Nothing, until `--include-equivalent`             |
| `keep`   | Unique commits, or a patch-id match with no verbatim counterpart                | Nothing — the judgment pass below                 |
| `skip`   | The never-touch set, with the worktree path or PR number                        | Nothing                                           |

A plain patch-id match proves nothing here: every patch-id git computes ignores whitespace, and this
repository reformats Markdown, so a reformat branch can match a main it genuinely differs from. The
`proven` rows are re-proved with `--verbatim` patch-ids, and a branch that matches
whitespace-blindly but has no byte-identical counterpart is demoted to `keep` with that reason —
read those rows, they are the interesting ones.

Run `npm run branches:prune -- --apply` for the `delete` tier. Glance at the `proven` rows — each
carries its proof and PR — then `npm run branches:prune -- --apply --include-equivalent`. That flag
is the one place the scripted pass deletes a branch git itself would refuse, and only behind the
script's own two-part proof; it is also the way past a `kept (git branch -d refused …)` row, which
means the current checkout's `HEAD` is behind `origin/main`, not that the branch is unmerged. Those
deletions name the proven commit id, so a branch another session pushed to since the plan was made
is reported as `kept` rather than destroyed. Without PR state the script plans but refuses to apply
— an open PR is in the never-touch set and cannot be excluded blind.

### Judgment pass (agent)

Everything left is a `keep` row with its reason: `PR #N closed unmerged`, `N unique commits, no
PR`,
or `PR #N merged but the branch carries changes its merge commit does not`. Group them by reason,
then for each branch:

1. **Look at the delta**, not the age: `git log --oneline origin/main..<branch>` and
   `git diff --stat origin/main...<branch>`. Decide whether the idea landed some other way (the same
   idea is often explored across several branches and once one lands the siblings are dead), was
   rejected, was abandoned, or is still wanted.
2. **Ask what outlives the code.** This is the point of the pass, not a footnote. A rejected branch
   often holds a finding, a decision, or a measurement — *why* it was rejected, what a reproduction
   looked like, a number nobody wrote down. The worked example: `bump-dprint-markdown-0.23.2`
   carried a rejected 248-file reformat and was deletable only because the reason — dprint 0.23
   wraps inside inline code spans and breaks 670 grep-able command literals — had first been written
   into issue #1634 with a reproduction. Without that, deleting the branch discards the whole
   investigation and the next attempt re-derives it.
3. **Give the finding its durable home first** — an issue or issue comment, an ADR via `create-adr`,
   a `docs/scratchpad/` note, a doc, a code comment; the `self-heal` skill's judgment about which
   home applies. Only then is the branch proposed for deletion.
4. **Present a decide table** — one row per branch: branch · last active · PR state · one-sentence
   summary of the change · durable home written (or "none needed") · recoverable from (`origin`, the
   PR, or **nowhere**) · proposed action. Default to delete; ask the user which to preserve.
5. After approval, delete each with
   `git update-ref -d refs/heads/<name> <the sha you read in step
   1>`, not
   `git branch -D <name>`. The named form resolves the branch again at deletion time, so a commit
   pushed onto it while you were writing the table is destroyed without a word; the ref form fails
   instead, which is the answer you want. A branch recoverable from nowhere — upstream gone, no PR —
   gets an explicit per-branch confirmation, since this is the only step in the skill that can lose
   commits.

## Part 3 — Remote branches on `origin`

`npm run branches:gather` prints one row per remote branch, oldest first: `ahead`, `behind`,
`inbase` (`yes` = every commit has a patch-equivalent on main; **squash merges show `no`** and need
the PR check), `age`, `date`, `subject`, and `*` on the current checkout. Add `--json` for
machine-readable rows, `--no-fetch` to skip the round-trip on a rerun.

Sort every branch (minus the never-touch set) into a bucket:

| Bucket                | Test                                                                   | Verdict          |
| --------------------- | ---------------------------------------------------------------------- | ---------------- |
| **A — nothing new**   | `ahead = 0` or `inbase = yes`                                          | Kill             |
| **B — PR resolved**   | `ahead > 0` and its PR is **merged or closed** (catches squash merges) | Kill             |
| **C — stale & moot**  | `ahead > 0`, no open PR, `age > 7d`, and you are confident it landed   | Kill (with note) |
| **D — needs a human** | Anything else — recent, or a real diff with no clear resolution        | **Report, ask**  |

Find PR state in one batch — `gh pr list --state all --json number,state,headRefName` locally, or
the GitHub MCP `search_pull_requests` with `repo:<owner>/<repo> head:<branch>` in a cloud session.
Bucket C follows the same delta reading as the judgment pass above, including the durable-home
question; if you cannot tell, it is bucket D.

Present one consolidated plan: the auto-kill table (A, B, C — branch · age · one-line reason) and
the decide list (D — branch · last active · one-sentence summary, defaulting to kill). Then **hand
back a script; never run the deletion yourself.** A cloud session's git relay returns `HTTP 403` on
ref deletion and the GitHub MCP has no delete-branch tool — that is policy, not a retry — and
deleting a hundred remote refs is outward-facing and irreversible regardless. Write the approved
list to an executable script in the scratch dir and deliver it as a file:

```bash
#!/usr/bin/env bash
# Delete N stale remote branches on origin (triaged by prune-git-workspace).
# Preserved: main, pr-assets, and any open-PR branch. Run from a local clone with push rights.
set -euo pipefail
branches=(
  <branch-1>
  <branch-2>
)
for ((i=0; i<${#branches[@]}; i+=40)); do
  git push origin --delete "${branches[@]:i:40}"   # batched so output stays readable
done
git ls-remote --heads origin | wc -l                # remaining count
```

Tell the user they can spare a branch by deleting its line before running, and that a branch
protection rejection is theirs to resolve. Never emit a script whose contents the user did not
approve.

## Closing the loop

* After the user runs the remote script, `npm run branches:prune` again: the deleted remotes are now
  `gone` upstreams and their merged local twins join the `delete` tier.
* Report the before/after counts for all three surfaces (`git branch | wc -l`,
  `git worktree list | wc -l`, `git ls-remote --heads origin | wc -l`) and every row that was kept
  for a reason the user may want to act on — an in-use worktree belonging to a finished session, a
  `keep` branch that got a durable home but no decision.
