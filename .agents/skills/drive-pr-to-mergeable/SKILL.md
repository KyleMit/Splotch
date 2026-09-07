---
name: drive-pr-to-mergeable
description: Take one open pull request from opened to mergeable — build the reviewer prompt, get an independent rival-agent review, address every thread, repeat that round at most once more, drive CI to green, reconcile conflicts, and return a shippable-or-leftovers verdict. Never merges. Use whenever an open PR needs the repo's standard independent-review and CI loop, standalone or as the current tip of a stack; the skills that open PRs (ship-issue, burn-down-backlog, fix-audits, create-stacked-prs, improve-performance-matrix) delegate here rather than restating the loop.
---

# Drive a PR to mergeable

One open pull request in, one verdict out. The pipeline is fixed:

**review prompt → rival review → address → (at most one more review + address) → CI green →
mergeable → verdict**

This skill is the single home of that loop. A caller that opens PRs names it and adds only its own
deltas — which reviewer budget it wants, what its PR bodies must carry, where it sits in a stack —
instead of restating the steps below.

**Preconditions.** The PR is open, its head is pushed, and its body is already complete (the caller
wrote it — `ship-issue`'s full summary, `burn-down-backlog`'s rich body, or the evidence body a perf
campaign requires). **Not in scope:** opening the PR, merging it, closing anything, or filing
issues. The caller owns every one of those, and a merge in particular is authorized only by the
caller's own invocation (`ship-issue`'s `mode=autonomous`) — nothing here confers it.

## Where the fixes commit

* **A standalone PR:** onto the PR's own branch.
* **A PR in a stack:** only while it is the **current tip with nothing above it** — the
  `create-stacked-prs` review gate runs this skill on each PR before the next layer is cut. Say so
  explicitly when invoking `address-pr-review`: restrict it to this single PR, which is the scoping
  that activates its per-layer exception. A bare mention of the tip PR is not that scoping; inside
  an active stack it triggers the whole-campaign sweep and opens a feedback PR above.
* **A PR that already has a child:** stop. Its fixes belong in `create-stacked-prs`' feedback-PR
  path at the tip, never on the reviewed branch.

## 1. Build the review prompt

Run `create-pr-review-prompt` for this PR — its value here is step 2 of that skill, the extra focus
areas: the judgment calls that could have gone the other way, the assumption never verified
empirically, the diff you trust least. The authoring session is the only one that knows those, and a
review that never hears them spends its independence on the safe parts.

Then **adapt the prompt for a rival agent, which is not a fresh Claude session.** The rival arrives
with its own review contract and findings schema, and the handler posts on its behalf, so strip the
parts that belong to that contract and keep only what steers:

* **Drop the skill invocation and the posting authorization.** The rival does not run
  `leave-pr-review` and must never be told to post — an early version of the pairing that had reach
  to GitHub posted a review to its own PR unasked. Posting is step 2, through the package's own
  publisher, run by you.
* **Drop the PR enumeration and the boundaries paragraph.** `--pr <n>` already pins the scope, and
  the sandbox already enforces read-only.
* **Keep** the focus areas, the adversarial pass on the overall approach, the full-sweep-first
  ordering rule, the empirical-verification scope, and any context the rival cannot infer from the
  repo.

Write the adapted text to an absolute path under the scratchpad — `--prompt-file` requires an
absolute path to a regular file and rejects anything over 256 KB.

## 2. Run the rival review

**The independent reviewer is the rival agent.** One mechanism, in every skill that reaches this
loop: `run-rival-agent`, which launches the *other* vendor's CLI. A same-runner subagent, CI, a
same-session self-review, a skipped automation job, and a rerun of the tests are not reviews and do
not count toward the rounds below.

**Follow the `run-rival-agent` package loaded in this session, verbatim** — its Preflight, Launch,
Serve the broker loop, Post the findings, and Rounds sections, in that order. Do not reproduce its
commands from here or from memory. This skill is generated for both providers, and the two packages
share the concepts and the flag vocabulary while differing completely in what is executed: each
provider's package launches the *other* vendor's CLI, from its own paths, with its own preflight and
its own publisher. A command spelled out here would be the wrong command in half the sessions it
runs in — and the failure is quiet, because asking a vendor to review its own output still produces
a plausible review.

What belongs to this skill is only how the rival is *steered*:

* **Scope it to the PR** — the `--pr <n>` scope, which is what the package's publisher needs.
* **Hand it the adapted prompt** from step 1 as the extra-instructions prompt file, at an absolute
  path.
* **Serve every broker request** until the run reports done or failed, judging each on its own
  merits — a targeted test is routine, a full Playwright suite is host-exclusive and worth
  declining, and a decline is a normal answer the rival records as unverified.
* **Post the findings** through the package's own publisher once the run is done.
* **A later round resumes, never `--fresh`** — a resumed reviewer verifies whether its own earlier
  findings were actually addressed instead of meeting the code cold, which is the whole reason a
  second round is worth paying for. Give it a prompt file carrying only the delta: what changed
  since the last round, and what you rejected. Never spend a `--fresh` reviewer to dodge a finding
  you did not like.

**If the rival cannot run at all** — the package's preflight fails, or its credentials are missing —
do not silently skip the review. Report what the preflight said and let its own remediation stand;
never invent a login step, which is provider-specific and easy to get backwards. Then either stop
until the user fixes it, or substitute a fresh independent subagent in the current runner running
`leave-pr-review` with the PR number and nothing else — no issue, no diff, no reasoning from this
session. That is a **weaker independence guarantee**: name the downgrade in the verdict rather than
papering over it. A substituted review keeps a run moving but **unlocks nothing that rests on
independence** — it withdraws any merge authority the caller holds, and a stacked campaign does not
cut its next layer on top of it; it stops adding layers and reports the blocker.

## 3. Address the feedback

Run `address-pr-review` with `mode=autonomous` against the PR, restricted to this single PR as
"Where the fixes commit" requires. What that flag buys is a triage pass that decides ordinary
product ambiguity instead of parking it — every such decision comes back as a record for the PR body
and the verdict. Its own autonomous contract withholds merging, which is correct here. Its rival
handling is load-bearing: the review posts through your GitHub account, so it looks self-authored,
and the skill identifies it by the `<!-- splotch-rival-review:` marker in the review body.

The findings are an outside opinion, not a verdict. Verify each against the current code, fix the
real ones, and reply-then-resolve the ones that do not hold up with the reasoning. Push the fixes.

## 4. The bound — at most two rounds

Steps 2 and 3 run **twice at most**, and often once:

* **Round one produced no findings, or none that changed code** — skip round two. Nothing changed,
  so a second look at the same commit buys nothing.
* **Round one changed code** — run round two, resumed, so the rival judges the fixes it asked for.
* **After round two, stop.** New findings from round two's own address pass do not earn a round
  three; they become action items in step 6.

The bound is a budget, not a quality target: a loop with no bound optimizes toward a zero-findings
state a non-trivial PR never reaches. A caller may widen it, and says so when it invokes this skill
— `improve-performance-matrix` runs round two unconditionally and allows one verification round
after a material fix, inside the rival's own three-round budget. The default above holds everywhere
else.

## 5. Drive it to mergeable

**Drive CI to green.** Subscribe to the PR's activity and let the events arrive rather than polling
with `sleep`. On a failure, first establish which kind it is:

* **The PR introduced it** — the check passes on `main` and fails here. Diagnose and push a fix,
  iterating until it is green. This is part of the job, not a finding to report.
* **The PR did not** — it reproduces on `main` or predates the branch. Do not absorb it into this
  PR. Say so in the PR thread with the evidence and a link to the run, and carry it into the action
  items in step 6 as a **drafted** issue — the user files it. A pre-existing red does not block the
  verdict, but it must be named, never quietly counted as green.

That is the one CI-failure policy. Fix what the PR broke; name and draft what it did not; file
nothing — an unattended run does not decide what enters the backlog, and the thread comment keeps
the evidence durable until someone does.

Check that the checks are real while you are there: a check *skipped* by a `paths`/`paths-ignore`
filter has not run, and green concluded from an absence of red is not green. Jobs gated on
`github.event_name == 'push' && github.ref == 'refs/heads/main'` are the exception — they cannot run
before a merge and are not a reason to hold anything.

**Make it actually mergeable.** Confirm from live PR state that it has no conflicts with its base,
that nothing is sitting unpushed on the local branch, and that it is not a draft — except where the
caller deliberately keeps its PRs in draft until its own wrap-up (a campaign does), in which case
the verdict says "shippable once readied" and names that. If `main` has moved far enough to conflict
— or far enough to worry about the conflicts a clean merge hides — reconcile it with the
`reconcile-with-main` skill and re-run the affected checks, rather than reporting a PR the user
cannot merge. Inside a stack, "its base" is the branch below, and the mid-stack-red rules in
`create-stacked-prs` decide what a lower PR's red means; this step judges only the PR it was given.

## 6. The verdict

**Shippable** means all four: CI green (with any pre-existing red named), the PR mergeable and
conflict-free, every review thread ended in a fix or a reasoned rebuttal, and no open finding you
would want fixed before merge. Say so plainly and name the PR URL. Merging is the caller's decision
— and, for a human-driven run, the user's.

**Not shippable, or shippable with leftovers:** list every open action item, each with what it is,
why it was not done in this PR (out of scope, needs a decision, larger than it reads), and whether
it looks worth its own issue. For the ones that do, **draft** the issue — title, body, labels — and
show the drafts. **Do not open them.** A caller whose leftovers would otherwise evaporate with the
branch (an unattended run) posts them as one comment on the PR so they survive on the thread, and
still hands the user the drafts to file.

Report, for the caller to fold into its own summary: the PR URL; what each review round found and
how it was resolved, and whether the reviewer was the rival or a named substitute; the CI state with
the run for the exact head SHA; every autonomous decision as question, options, and choice; and the
action items with their drafts.
