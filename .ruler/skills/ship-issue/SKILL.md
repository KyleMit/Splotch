---
name: ship-issue
description: Take one GitHub issue number or a free-form task all the way to a review-complete pull request — implement it, open the PR, get an independent rival-agent review, address the feedback, and repeat that review round at most twice, driving CI to green and the PR to mergeable. Stops there with the PR open by default; `mode=autonomous` also merges it. Use when asked to ship an issue, take an issue end to end, implement and get a PR reviewed, or drive one task from description to a PR that has survived outside review — and with `mode=autonomous` when asked to ship and merge it unattended.
---

# Ship an issue

One unit of work, from a description to a pull request that has survived an independent review. The
pipeline is fixed:

**intake → implement → PR → rival review → address → (at most one more review + address) →
mergeable + verdict → merge (autonomous mode only)**

The review loop is **bounded at two rounds**. That bound is the point of the skill: it buys the work
an outside opinion and a chance to answer it, then stops, rather than grinding a PR toward an
imaginary zero-findings state. Whatever is still open after round two becomes a reported action
item, not a third round.

## Modes

**Default (interactive).** Invoking this skill is the user's standing approval to **create the
branch, open the PR, and post the rival's review to it**. It is *not* approval to merge the PR, to
open follow-up issues, or to close anything. The run still takes the PR **all the way to mergeable**
— review rounds answered, CI driven to green, conflicts reconciled — and stops with it open, so the
only thing left for the user is the merge click.

**`mode=autonomous`.** Everything above, plus the authority to **merge the PR** once step 5's gate
passes in full. Naming the mode is what grants that — merging is irreversible and outward-facing, so
it is authorized by the invocation or not at all; never infer it from a run that merely looks
unattended. The mode also changes how ordinary ambiguity is handled: instead of stopping to ask,
enumerate the options, pick the best reversible one, proceed, and carry the decision record into the
PR body and the final report. It does **not** authorize the blockers — crossing a security boundary,
weakening a test or a protection to get green, bypassing branch protection, closing anything, or
acting outside the named unit of work. Those still stop the run.

Two things the autonomous mode deliberately does not take over. It does not skip the review loop —
an unattended run needs the outside opinion *more* than a supervised one, and a merge with no
independent review is the one outcome this skill exists to prevent. And it still does not open
follow-up issues (step 4 says where the leftovers go instead).

## 1. Intake — resolve the input to a spec

Two intake paths. Both end with a written done-when you can verify against.

**A GitHub issue number:**

* Read the issue *and its full comment thread* — `pull_request_read`'s issue equivalents, or
  `get_issue` plus `get_issue_comments`. The body is not the spec on its own: a comment can retract
  a figure, narrow the scope, or supply the decision the body left open. Implementing from the body
  alone has shipped the wrong thing here before.
* If the issue belongs to an epic or names sub-issues, run `enumerate-sub-issues` first — an epic's
  prose is not a reliable child list.
* **Clear every stop condition before mutating anything on GitHub.** All three, in this order:
  * **Is it actionable?** An issue labelled `needs-triage`, `needs-scoping`, or `needs-adr` is a
    decision the user owes you. Say what is blocked and stop instead of guessing.
  * **Is it already claimed?** An `in-progress` label or an assignee from another session means
    someone else is on it. Say so and stop rather than racing them; taking a claimed issue is how
    two sessions silently do the same work twice.
  * **Is the tree clean?** Stop if it is not — never fold the user's uncommitted work into this run.
* **Then claim it**: apply the `in-progress` label and assign yourself, still before writing any
  code. This is what keeps a parallel session (or a `burn-down-backlog` run) off the same issue, so
  it happens now rather than at PR time.

  Claiming **after** the stop conditions is the whole point of the ordering. A claim applied first
  and then abandoned leaves `in-progress` on an issue nobody is working, and `burn-down-backlog`
  filters that label out of its pickups — so one aborted run would strand the issue from every
  future automated pickup, with nothing to announce it. Any blocker found *later*, once the claim is
  real, still gets the rollback in step 2.

**A free-form task:** there is no issue to read or claim. Restate the task as a done-when spec in
one or two sentences and carry it into the PR body as the "why" — a PR that closes no issue must
explain itself entirely on its own. Do not open an issue just to have one to close.

Either way — for the free-form path, where there is no issue to check, the clean-tree condition
above still applies. If the spec is ambiguous enough that two readings produce materially different
software, ask the one question that resolves it rather than picking a reading and building it; in
`mode=autonomous` there is nobody to ask, so pick the reading that is easiest to reverse, say so in
the PR body, and treat the other reading as an action item. A spec too ambiguous for even that — one
where the wrong pick ships the wrong software — is a blocked unit in either mode.

## 2. Implement

* **Branch** from the latest `origin/main`, naming it `<runner-prefix>/issue-<NN>-<slug>` — or
  `<runner-prefix>/<task-slug>` for a free-form task. The prefix is the **active runner's** own
  convention, not a fixed string: `claude/` from Claude Code, `codex/` from Codex (which
  `implement-issue-stack` already uses). Take it from the branches the current runner has created in
  this repo rather than assuming, so the branch is attributed to the agent that actually made it.
  Push it early with `git push -u origin <branch>`.
* **Consult the area's skill rather than guessing** — `architecture` to place code, `design` for
  anything with a style or a user-facing string, `api` for endpoints, `mobile` for native, `testing`
  for tests. Reading the skill costs less than a review round spent on a convention you invented.
* **Verify what you touched.** Code: `npm run check` plus the tests covering the edit, with a new or
  updated test whenever the change is a feature or a bug fix. Docs, skills, or rules: re-read the
  surrounding section, and run `npm run ruler:apply` if you edited anything under `.ruler/**`.
* **Commit and push.** Put `Fixes #<NN>` in the commit body when an issue exists, so the merge
  closes it and retires the claim label.

If the work turns out to be far larger than it read, or needs a product decision: for an issue,
remove `in-progress` again and comment on the issue with exactly what blocks it; for a free-form
task, say so. Either way stop here — a blocked unit does not get a PR.

## 3. Open the PR

Base `main`, `Fixes #<NN>` in the body when there is an issue. Follow `pr-screenshots` whenever the
change touches anything visible. The body carries a **full summary**, not a stub: what changed and
why, the notable edits with `file:line` pointers, the approach and the alternatives weighed, the
commands run and their results, and any caveats. Escape bare `#`-numbers that are not deliberate
references, and copy every SHA from command output rather than typing it.

## 4. Review, address, and drive it to mergeable

Run **`drive-pr-to-mergeable`** on the PR. That skill is the single home of the loop this pipeline
used to spell out — the adapted reviewer prompt, the rival review through `run-rival-agent`,
`address-pr-review` in `mode=autonomous`, the two-round bound, CI driven to green with the
pre-existing-versus-introduced split, conflicts reconciled, and the shippable-or-leftovers verdict.
Its default reviewer budget (at most two rounds, round two skipped when round one changed no code)
is exactly this skill's, so invoke it with no overrides.

What this skill adds on top of that loop:

* **Both modes take the PR all the way to mergeable.** The only thing the default mode withholds is
  the merge itself — it does not stop early, hand back a red PR, or leave conflicts for the user. A
  run that ends with "shippable" means the user has nothing left to do but click merge.
* **A substituted reviewer withdraws the merge authority.** If the rival cannot run and the loop
  falls back to a same-runner subagent, `mode=autonomous` may keep going, but the PR finishes as an
  open PR with the verdict, for the user to merge. Downgrading the reviewer and then merging on the
  downgraded review would quietly convert the one guarantee the mode rests on into a formality.
* **Autonomous decisions come home.** Every ordinary ambiguity the loop decided under
  `mode=autonomous` — the inner skill's decision records — belongs in the PR body and the final
  report, not only in a thread.
* **Leftovers are drafted, never filed**, in both modes: the verdict's action items become drafted
  issues the user reviews. In `mode=autonomous` the drafts would otherwise evaporate with the
  branch, so before merging, post them as one comment on the PR so they survive on the merged
  thread, and still hand the user the drafts to file. An unattended run gets to merge its own work;
  it does not get to also decide what enters the backlog.

In the default mode, a shippable verdict is where the run stops: say so plainly, name the PR URL,
and leave the merge to the user. In `mode=autonomous`, a shippable verdict is what unlocks step 5.

## 5. Merge — `mode=autonomous` only

Never in the default mode. Step 4 already drove the PR to mergeable in both modes; this step adds
only the merge. The gate is all-or-nothing: **every** condition below, or the run finishes at step 4
with the PR open and the failed condition named.

* **Step 4 returned shippable** — all four conditions, not a near miss.
* **Re-verify it from live state, at merge time.** Step 4's answer can be minutes old, and a push, a
  new review, or a base that moved invalidates it. Confirm the head you are merging is the head you
  verified, the required checks are green *on that head*, and no thread reopened.
* **A rival review actually ran and posted** at least round one. A skipped, failed, or
  same-vendor-substituted review withdraws the merge authority (step 4).
* **Nothing on the blocker list happened** — no test weakened, no protection bypassed, no decision
  that crossed a security boundary.

Merge with a **merge commit**, matching this repo's trunk (`create-stacked-prs` documents why):

```bash
gh pr merge <n> --merge --delete-branch
```

Never pass a flag that bypasses branch protection, and never merge past a ruleset failure — GitHub
evaluating the rules and refusing is a correct outcome to report, not an obstacle to route around.

**After the merge**, confirm rather than assume: the PR reads merged, `main` carries the commit, the
branch is gone, and — for an issue — `Fixes #<NN>` actually closed it and retired `in-progress`.
Then watch the post-merge-only jobs, because the merge is their first and only chance to run and
their failures land on `main`. If one goes red, say so immediately and offer the revert; do not
start a fix pass under the same authorization, which covered shipping this unit, not repairing
trunk.

Close the report with: the issue or task shipped, the branch and PR URL, what each review round
found and how it was resolved, CI status, the merge commit (copied from command output, never
typed), the post-merge job results, and the action items left for the user to file.
