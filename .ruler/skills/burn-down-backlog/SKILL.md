---
name: burn-down-backlog
description: Pick up the newest open GitHub issue not already being worked, claim it with the in-progress label, and drive it to a committed, pushed change. Use when asked to burn down the backlog, grab the next issue, or work down open issues — especially across several back-to-back sessions that should each pick a different issue.
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
   * `search_issues` with `repo:kylemit/splotch is:issue is:open -label:in-progress -label:wont-do`,
     `sort: created`, `order: desc` — the first result is your pick. (`search_issues` supports the
     negative `-label:` filter directly; `list_issues` doesn't, so prefer search here.)
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
2. **Branch.** From the latest `origin/main`, create a working branch for the issue — e.g.
   `claude/issue-<NN>-<short-slug>` — or reuse the session's designated working branch if one is
   set. Push it with `git push -u origin <branch>`.
3. **Understand → implement.** Read the issue's what / why / where / done-when. Consult the relevant
   skill for the area it touches (`architecture` to place code, `design` for styling, `api` for
   endpoints, `mobile` for native, `testing` for tests) rather than guessing. The issue's
   description is the spec; if it's genuinely ambiguous enough that you'd be guessing at the
   intended behaviour, that's a blocked pickup — see step 6.
4. **Verify — matched to what you touched.**
   * Code or scripts (`.ts`, `.mjs`, config): run `npm run check` plus the tests covering the
     touched files; add or update tests when the issue is a feature or bug fix.
   * Docs / skills / rules / ADRs only: there's nothing to typecheck — re-read the surrounding
     section for consistency and, if you edited a `.ruler/**` source, run `npm run ruler:apply` so
     the generated files stay in sync (ADR-0058).
5. **Commit and push.** One or a few well-described commits that **reference the issue so it closes
   on merge** — put `Fixes #<NN>` in the commit body — then `git push -u origin <branch>`. Leave the
   `in-progress` label on: the issue is still open until the change merges, and the label keeps
   later runs from re-grabbing it.
6. **If you get blocked** — the issue turns out to need a product/user decision, is far larger than
   it reads, or is genuinely ambiguous — **remove the `in-progress` label again** (so it returns to
   the pool for a human or a later run) and comment on the issue with exactly what's blocking it.
   Add `needs-triage` or `needs-scoping` if that fits. Don't leave a claimed-but-abandoned issue
   parked under `in-progress`.

## Completion

Report, in the final response:

* The issue picked (number + title) and why it was next (newest unclaimed).
* What changed, the check/test results, and the branch name (and PR URL if the user asked for one).
* That `in-progress` is applied and will retire when the issue closes on merge.

Then note that running the skill again — in this session or a fresh back-to-back one — will skip
this now-claimed issue and pick up the next-newest, so the user can fan out several sessions to burn
the backlog down in parallel.
