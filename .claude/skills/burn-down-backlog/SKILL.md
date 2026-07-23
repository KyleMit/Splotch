---
name: burn-down-backlog
description: Pick up the newest open GitHub issue not already being worked, claim it with the in-progress label, implement it, open a PR with a rich summary, get an independent review from a fresh subagent and address it, then drive CI to green. Use when asked to burn down the backlog, grab the next issue, or work down open issues — especially across several back-to-back sessions that should each pick a different issue.
---

# Burn down backlog

Grab the **single newest** open GitHub issue that no other session has claimed, mark it claimed, and
work it end to end. The claim is a label — `in-progress` — so that running this skill in several
back-to-back sessions makes each session pick up a **different** issue instead of colliding on the
same one.

The mechanism is deliberately simple:

* **Newest-first** — pick the most recently *created* open issue, so freshly filed work leads.
* **Claim before you work** — apply `in-progress` as the very first action, before touching code, to
  shrink the window where two sessions could grab the same issue.
* **Skip the claimed** — every run filters out `in-progress` issues, so a claim made by an earlier
  session (or still-open past work) is invisible to later runs.

`in-progress` is declared in [`.github/labels.yml`](../../../.github/labels.yml) and synced to
GitHub by the Label Sync workflow. It stays on the issue while the work is in flight and until the
issue closes (a merged PR that references it closes it, which also retires the label) — that's what
keeps it out of later pickups.

## Setup (once per run)

1. **Confirm the claim label exists.** The skill depends on `in-progress` existing on the repo. It's
   declared in `.github/labels.yml`; if the Label Sync workflow hasn't run since it was added, the
   very first pickup can't apply it — check with the GitHub MCP `get_label` tool and, if it's
   missing, tell the user to merge the labels change (or create the label) before running. In normal
   operation the label already exists and this is a no-op.
2. **Find the newest unclaimed issue.** Query with the GitHub MCP tools for open issues, newest
   first, excluding anything already claimed:
   * Fetch candidates with `list_issues` (`state: OPEN`, `orderBy: CREATED_AT`, `direction: DESC`,
     paginate as needed), then filter **client-side** — `list_issues` returns each issue's labels,
     so drop anything carrying `in-progress` or `wont-do`; the newest survivor is your pick.
     (`list_issues` doesn't accept a negative `-label:` filter, but filtering the returned labels
     yourself is just as effective and doesn't depend on the search index.)
   * In cloud/MCP sessions `search_issues` may return 0 even when open issues exist (the search
     index isn't always available); never conclude the backlog is empty from an empty
     `search_issues` — confirm with `list_issues` first. `search_issues`
     (`repo:kylemit/splotch is:issue is:open
     -label:in-progress -label:wont-do`,
     `sort: created`, `order: desc`) is a convenience when it works, but `list_issues` is the source
     of truth.
   * Also skip an issue you can't act on without a decision — one labelled `needs-triage`,
     `needs-scoping`, or `needs-adr` — and move to the next-newest. If the only candidates are
     blocked like that, say so and stop rather than forcing shaky work.
   * If there are **no** eligible issues, report "no unclaimed open issues" and stop cleanly — don't
     create a branch.
3. **Ensure the working tree is clean.** If it isn't, stop and tell the user — never fold their
   uncommitted work into this run.

## Claim, then work the issue

1. **Claim it first.** Before any code: add the `in-progress` label (GitHub MCP `issue_write`), and
   assign the issue to yourself if you have an identity to assign. This is what makes back-to-back
   sessions pick distinct issues, so it happens *before* implementation, not after.
2. **Name the session.** Rename the session to `#<NN> <short summary>` — the issue number followed
   by a 3–4 word summary of the fix or area (e.g. `#123 fix undo button`) — so a fan-out of parallel
   sessions is scannable at a glance. In a cloud session use the `/rename` slash command with the
   name as its argument: `/rename #<NN> <short summary>` (the argument form needs Claude Code
   v2.1.205+). Skip silently if `/rename` isn't available.
3. **Branch.** From the latest `origin/main`, create a working branch for the issue — e.g.
   `claude/issue-<NN>-<short-slug>` — or reuse the session's designated working branch if one is
   set. Push it with `git push -u origin <branch>`.
4. **Understand → implement.** Read the issue's what / why / where / done-when. Consult the relevant
   skill for the area it touches (`architecture` to place code, `design` for styling, `api` for
   endpoints, `mobile` for native, `testing` for tests) rather than guessing. The issue's
   description is the spec; if it's genuinely ambiguous enough that you'd be guessing at the
   intended behaviour, that's a blocked pickup — see step 7.
5. **Verify — matched to what you touched.**
   * Code or scripts (`.ts`, `.mjs`, config): run `npm run check` plus the tests covering the
     touched files; add or update tests when the issue is a feature or bug fix.
   * Docs / skills / rules / ADRs only: there's nothing to typecheck — re-read the surrounding
     section for consistency and, if you edited a `.ruler/**` source, run `npm run ruler:apply` so
     the generated files stay in sync (ADR-0058).
6. **Commit and push.** One or a few well-described commits that **reference the issue so it closes
   on merge** — put `Fixes #<NN>` in the commit body — then `git push -u origin <branch>`. Leave the
   `in-progress` label on: the issue is still open until the change merges, and the label keeps
   later runs from re-grabbing it.
7. **If you get blocked** — the issue turns out to need a product/user decision, is far larger than
   it reads, or is genuinely ambiguous — **remove the `in-progress` label again** (so it returns to
   the pool for a human or a later run) and comment on the issue with exactly what's blocking it.
   Add `needs-triage` or `needs-scoping` if that fits. Don't leave a claimed-but-abandoned issue
   parked under `in-progress`. A blocked pickup skips the rest of this skill — go straight to
   Completion.

## Ship it — PR, independent review, address, CI

Runs only when the issue was actually completed (step 6 above), not when it was blocked. **Invoking
this skill is the user's standing approval to open the PR** — don't pause to ask.

1. **Open the PR.** Create a pull request from the working branch into `main`, with `Fixes #<NN>` in
   the body so the issue closes on merge. Follow the `pr-screenshots` skill if the change touches
   anything visible in the UI. The body must be a **rich summary** — as complete as a full session
   summary (see "PR body" below), never a one-liner.

2. **Independent review — fresh subagent, PR number only.** Spawn a `general-purpose` subagent and
   have it run the `leave-pr-review` skill. It must start with **no context from this conversation**
   — pass it *only* the PR number and repo, not the issue, your diff, or your reasoning, so its
   review is genuinely independent. Its whole instruction is essentially:

   > Run the `leave-pr-review` skill on PR #`<N>` in `kylemit/splotch`. Finish by posting your
   > findings as an inline review on the PR.

   `leave-pr-review` normally holds a hard gate — it posts only after a typed human go-ahead. Here
   that go-ahead is **pre-granted**: instruct the subagent that it **must always finish by leaving
   its comments on the PR** (a single pending review submitted with `add_comment_to_pending_review`
   * submit), and must never end by asking whether to post or by leaving the review only in chat.
     Wait for the subagent to finish before continuing — its comments are the input to the next
     step.

3. **Address the review — back on the main thread.** Now run the `address-pr-review` skill against
   the same PR: triage every comment the subagent left, fix the valid ones and reply with the fix,
   and reply-then-resolve the ones that don't hold up with the rationale.

4. **Push, then watch CI.** Push the review-fix commits. Subscribe to the PR's activity with
   `subscribe_pr_activity` and let CI events arrive — **don't poll with `sleep`**. On a CI failure:
   * **The PR introduced it** — the check passes on `main` but fails on this branch: diagnose and
     push a fix, iterating until CI is green.
   * **The PR didn't introduce it** — the failure reproduces on `main` / predates this branch: don't
     try to fix it inside this PR. **Open a GitHub issue** capturing the observation — the failing
     check, the evidence that it's pre-existing (e.g. it's red on `main` too), and a link to the run
     — so it lands in the backlog, and note in the PR thread that the failure is pre-existing and
     now tracked separately.

   Keep the subscription until CI is green (or every failure is either fixed or filed as a
   pre-existing issue), then hand back to the user.

### PR body

Give the PR the same richness a good end-of-session summary has, not a stub:

* **Summary** — what the change does and the issue it closes (`Fixes #<NN>` — a deliberate
  reference, so it stays unescaped; escape any *other* bare `#`-number per the root `CLAUDE.md`).
* **Why** — the problem/motivation from the issue.
* **What changed** — the notable edits, grouped by area, with `file:line`-level pointers for the
  substantive ones.
* **Approach & decisions** — why this way, alternatives weighed, anything a reviewer would ask
  about.
* **Testing** — commands run (`npm run check`, the relevant tests) and their results; screenshots /
  before-after / gifs when the change is visible (`pr-screenshots`).
* **Follow-ups / caveats** — known gaps, deferred work, or risks.

## Completion

Report, in the final response:

* The issue picked (number + title) and why it was next (newest unclaimed).
* What changed, the check/test results, the branch name, and the **PR URL**.
* The independent review outcome — how many findings the subagent posted, and how each was addressed
  (fixed or rebutted).
* CI status — green, or which failures were fixed here vs. filed as pre-existing issues (with
  links).
* That `in-progress` is applied and will retire when the issue closes on merge.

Then note that running the skill again — in this session or a fresh back-to-back one — will skip
this now-claimed issue and pick up the next-newest, so the user can fan out several sessions to burn
the backlog down in parallel.
