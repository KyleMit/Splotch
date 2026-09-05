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

**`mode=autonomous`.** Everything above, plus the authority to **merge the PR** once step 9's gate
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
follow-up issues (step 9 says where the leftovers go instead).

## 1. Intake — resolve the input to a spec

Two intake paths. Both end with a written done-when you can verify against.

**A GitHub issue number:**

* Read the issue *and its full comment thread* — `pull_request_read`'s issue equivalents, or
  `get_issue` plus `get_issue_comments`. The body is not the spec on its own: a comment can retract
  a figure, narrow the scope, or supply the decision the body left open. Implementing from the body
  alone has shipped the wrong thing here before.
* If the issue belongs to an epic or names sub-issues, run `enumerate-sub-issues` first — an epic's
  prose is not a reliable child list.
* **Claim it before writing code**: apply the `in-progress` label and assign yourself. This is what
  keeps a parallel session (or a `burn-down-backlog` run) off the same issue, so it happens now, not
  at PR time.
* Skip nothing silently: an issue labelled `needs-triage`, `needs-scoping`, or `needs-adr` is a
  decision the user owes you. Say what is blocked and stop instead of guessing.

**A free-form task:** there is no issue to read or claim. Restate the task as a done-when spec in
one or two sentences and carry it into the PR body as the "why" — a PR that closes no issue must
explain itself entirely on its own. Do not open an issue just to have one to close.

Either way, stop before touching code if the tree is dirty — never fold the user's uncommitted work
into this run. If the spec is ambiguous enough that two readings produce materially different
software, ask the one question that resolves it rather than picking a reading and building it; in
`mode=autonomous` there is nobody to ask, so pick the reading that is easiest to reverse, say so in
the PR body, and treat the other reading as an action item. A spec too ambiguous for even that — one
where the wrong pick ships the wrong software — is a blocked unit in either mode.

## 2. Implement

* **Branch** from the latest `origin/main`: `claude/issue-<NN>-<slug>`, or `claude/<task-slug>` for
  a free-form task. Push it early with `git push -u origin <branch>`.
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

## 4. Build the review prompt

Run `create-pr-review-prompt` to produce the reviewer prompt for this PR — its real value here is
step 2, the extra focus areas: the judgment calls that could have gone the other way, the assumption
never verified empirically, the diff you trust least. You are the only one who knows those, and a
review that never hears them spends its independence on the safe parts.

Then **adapt the prompt for a rival agent, which is not a fresh Claude session.** The rival arrives
with its own review contract and its own findings schema, and the handler posts on its behalf, so
strip the parts that belong to that contract and keep only what steers:

* **Drop the skill invocation and the posting authorization.** The rival does not run
  `leave-pr-review` and must never be told to post — an early version of the pairing that had reach
  to GitHub posted a review to its own PR unasked. Posting is step 6's `post-review.mjs`, run by
  you.
* **Drop the PR enumeration and the boundaries paragraph.** `--pr <n>` already pins the scope, and
  the sandbox already enforces read-only.
* **Keep** the focus areas, the adversarial pass on the overall approach, the full-sweep-first
  ordering rule, the empirical-verification scope, and any context the rival cannot infer from the
  repo.

Write the adapted text to an absolute path under the scratchpad — `--prompt-file` requires an
absolute path to a regular file and rejects anything over 256 KB.

## 5. Run the rival review

Follow `run-rival-agent` — this is its PR-review path, not a summary of it:

```bash
npm run --silent rival:health
```

```bash
npm run --silent rival:launch -- --pr <n> --prompt-file <abs path> > /private/tmp/rival-launch-<unique>.json 2> /private/tmp/rival-launch-<unique>.log
```

Launch it in background mode, note the `session: <dir>` line, then **serve the broker loop** until
it reports `done` or `failed`, judging each request on its own merits — a targeted test is routine,
a full Playwright suite is host-exclusive and worth declining, and a decline is a normal answer that
the rival records as unverified. Post the result:

```bash
node tools/rival-agent/post-review.mjs --pr <n> --session <dir>
```

Round two launches the same way with no `--fresh`: the launcher resumes the reviewer, so it verifies
whether its own round-one findings were actually addressed instead of meeting the code cold. Give
round two a prompt file carrying only the delta — what changed since round one and what you rejected
— and never spend a `--fresh` reviewer to dodge a finding you did not like.

If the rival cannot run at all (`rival:health` fails, no ChatGPT plan login), do not silently skip
the review: say so, and offer either to stop until the user runs `codex login` or to substitute a
fresh `general-purpose` subagent running `leave-pr-review` with the PR number and nothing else. A
same-vendor subagent is a weaker independence guarantee — name that trade-off rather than papering
over it.

In `mode=autonomous` that substitution is allowed to keep the run moving but **withdraws the merge
authority**: a PR whose only review came from the same vendor that wrote it finishes as an open PR
with the verdict, for the user to merge. Downgrading the reviewer and then merging on the downgraded
review would quietly convert the one guarantee the mode rests on into a formality.

## 6. Address the feedback

Run `address-pr-review` with `mode=autonomous` against the PR — in both of this skill's modes, since
what that flag buys is a triage pass that decides ordinary product ambiguity instead of parking it.
Note that `address-pr-review`'s own autonomous contract explicitly withholds merging; the merge
authority here comes from **this** skill being invoked with `mode=autonomous`, and nothing the inner
skill does can confer it. Its rival handling is already load-bearing: the review posts through your
GitHub account, so it looks self-authored, and the skill identifies it by the
`<!-- splotch-rival-review:` marker in the review body. Autonomous mode also means an ordinary
product ambiguity gets decided and recorded rather than parked waiting on the user — that decision
record belongs in your final report.

The findings are an outside opinion, not a verdict. Verify each against the current code, fix the
real ones, and reply-then-resolve the ones that do not hold up with the reasoning. Push the fixes.

## 7. The bound — at most two rounds

Steps 5 and 6 run **twice at most**, and often once:

* **Round one produced no findings, or none that changed code** — skip round two. Nothing changed,
  so a second look at the same commit buys nothing.
* **Round one changed code** — run round two, so the rival judges the fixes it asked for.
* **After round two, stop.** New findings from round two's own address pass do not earn a round
  three; they become action items in step 8.

## 8. Drive it to mergeable, then judge

**Both modes take the PR all the way to mergeable.** The only thing the default mode withholds is
the merge itself — it does not stop early, hand back a red PR, or leave conflicts for the user. A
run that ends with "shippable" means the user has nothing left to do but click merge.

**Drive CI to green.** Subscribe to the PR's activity and let the events arrive rather than polling
with `sleep`. On a failure, first establish which kind it is:

* **The PR introduced it** — the check passes on `main` and fails here. Diagnose and push a fix,
  iterating until it is green. This is part of the job in both modes, not a finding to report.
* **The PR did not** — it reproduces on `main` or predates the branch. Do not absorb it into this
  PR. Say so in the PR thread with the evidence and a link to the run, and carry it into the action
  items as its own follow-up. A pre-existing red does not block the verdict, but it must be named,
  never quietly counted as green.

Check that the checks are real while you are there: a check *skipped* by a `paths`/`paths-ignore`
filter has not run, and green concluded from an absence of red is not green. Jobs gated on
`github.event_name == 'push' && github.ref == 'refs/heads/main'` are the exception — they cannot run
before a merge and are not a reason to hold anything.

**Make it actually mergeable.** Confirm from live PR state that it is not a draft, has no conflicts
with its base, and that nothing is sitting unpushed on the local branch. If `main` has moved far
enough to conflict — or far enough to worry about the conflicts a clean merge hides — reconcile it
with the `reconcile-with-main` skill and re-run the affected checks, rather than reporting a PR the
user cannot merge.

**Shippable** then means all four: CI green (with any pre-existing red named), the PR mergeable and
conflict-free, every review thread ended in a fix or a reasoned rebuttal, and no open finding you
would want fixed before merge. In the default mode, say so plainly, name the PR URL, and stop —
merging is the user's call, and it is the *only* thing left. In `mode=autonomous`, this is what
unlocks step 9.

**Not shippable, or shippable with leftovers:** list every open action item, each with what it is,
why it was not done in this PR (out of scope, needs a decision, larger than it reads), and whether
it looks worth its own issue. For the ones that do, **draft** the issue — title, body, labels — and
show the drafts. **Do not open them.** The user reviews the list first; opening issues is their
call, and a batch of agent-filed issues nobody asked for is backlog noise.

That holds in `mode=autonomous` too, where the drafts would otherwise evaporate with the branch:
before merging, post the action items as one comment on the PR so they survive on the merged thread,
and still hand the user the drafts to file. An unattended run gets to merge its own work; it does
not get to also decide what enters the backlog.

## 9. Merge — `mode=autonomous` only

Never in the default mode. Step 8 already drove the PR to mergeable in both modes; this step adds
only the merge. The gate is all-or-nothing: **every** condition below, or the run finishes at step 8
with the PR open and the failed condition named.

* **Step 8 returned shippable** — all four conditions, not a near miss.
* **Re-verify it from live state, at merge time.** Step 8's answer can be minutes old, and a push, a
  new review, or a base that moved invalidates it. Confirm the head you are merging is the head you
  verified, the required checks are green *on that head*, and no thread reopened.
* **A rival review actually ran and posted** at least round one. A skipped, failed, or
  same-vendor-substituted review withdraws the merge authority (step 5).
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
