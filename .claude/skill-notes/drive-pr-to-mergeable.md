<!-- Source: .ruler/skill-notes/drive-pr-to-mergeable.md.template -->

# drive-pr-to-mergeable — design notes

## Why the skill exists (issue #1539)

By 2026-09-06 the ship-and-review loop — open the PR, get an independent review, address every
thread, drive CI to green, decide what to do with a failure the change did not introduce — was
written out in five skills in different words: `ship-issue` (steps 4–8), `burn-down-backlog` ("Ship
it"), `improve-performance-matrix` ("Stack and review discipline"), `create-stacked-prs` (the review
gate and "Responding to review"), and `fix-audits` (Draft-PR mode, which readied a PR and never
reviewed it at all). Each copy costs three files of diff (ADR-0107), and the copies had diverged on
two real questions: who the independent reviewer is, and what happens to a pre-existing CI failure.

The issue offered three options. Making `create-stacked-prs` the single owner (option 2) lost on the
text: `burn-down-backlog` and `ship-issue` are single-PR pipelines that need the loop *without* the
stack, so the stack skill cannot own it without importing stack concepts into non-stack callers.
Reconciling the divergences in place (option 3) would have left five copies to drift again. The
chosen shape is the hybrid: extract the PR-agnostic core into this skill, keep the stack machinery
in `create-stacked-prs`, and cut every caller to its genuine delta. The owner accepted that
recommendation on 2026-09-06.

## The extraction source is `ship-issue`

`ship-issue`'s steps 4–8 were the most recently written and most heavily reviewed copy (its own
notes record two rival rounds' corrections), so the core is lifted from there nearly verbatim, and
`ship-issue` now delegates to it like every other caller. The alternative — leaving `ship-issue`
whole and pointing the others at it — was rejected because `ship-issue` is not PR-agnostic: it owns
intake, claiming, branching, and the autonomous merge, and a caller that already has an open PR has
no use for any of that. What stays in `ship-issue` is exactly what is not in the core: the two modes
and what each authorizes, the merge gate, and the rule that a substituted reviewer withdraws merge
authority.

## The two reconciliations

**Reviewer independence: the rival agent, everywhere.** `burn-down-backlog` used a same-runner
`general-purpose` subagent given only the PR number as its *primary* reviewer;
`improve-performance-matrix` and `ship-issue` used `run-rival-agent`. The rival wins because the
subagent is a weaker guarantee — same vendor reviewing its own output still produces a plausible
review, and nothing in the log distinguishes the two. The subagent survives only as the fallback for
a failed rival preflight, named as a downgrade in the verdict, and it unlocks nothing that rests on
independence: no merge (`ship-issue`'s existing rule) and no next stack layer
(`improve-performance-matrix`'s "stop adding layers and report the blocker", which is now the same
rule stated once in the core rather than a divergence).

**CI failure the PR did not introduce: name it, draft it, file nothing.** `burn-down-backlog` opened
a GitHub issue for a pre-existing red; `ship-issue` named it in the PR thread with evidence and
carried it into the drafted action items for the user to file. `ship-issue`'s policy wins because it
was the deliberate, owner-specified boundary ("filing issues was explicitly reserved for the user
when the skill was specified" — its notes), and because an unattended run deciding what enters the
backlog is the wider authority. The thread comment keeps the evidence durable in the meantime. This
is the one call in the extraction a reader might reverse: the argument for filing is that a trunk
failure belongs to no PR and an unfiled one is re-diagnosed by every later session. If that argument
wins later, the change is one bullet in step 5 of the core and nowhere else — which is the point of
having a core.

## What is deliberately a caller parameter, not a divergence

The **round budget**. The core's default is `ship-issue`'s two-round bound with the short-circuit
(round one changed no code → skip round two). `improve-performance-matrix` requires round two
unconditionally and allows a verification round after a material fix inside the rival's three-round
budget, because a performance change can preserve behavior and still encode a wrong causal theory.
That is a genuine campaign-specific delta, earned by a 2026-09-04 failure recorded in that skill's
notes, and the issue asked to reconcile reviewer independence and CI policy, not to flatten every
budget. So the core states the default, says a caller may widen it and must say so at invocation,
and names the one caller that does.

**Draft state.** The core checks not-a-draft as part of mergeable, but a campaign keeps its PRs in
draft until its own wrap-up. Rather than have the core ready every PR (which would change the
campaign's flow) or ignore draft state (which would let "shippable" describe an unmergeable PR), the
verdict says "shippable once readied" and names the caller's choice.

## `fix-audits` gained a review it never had

Every other caller already ran some version of the loop; `fix-audits` readied its sweep PR and
stopped. Cutting it "to its delta" therefore *added* a step — run the core after readying the PR —
rather than removing one. That is a behavior change, flagged in the extraction PR, on the grounds
that a sweep PR readied without independent review was the odd one out and the issue's done-when
("the procedure exists in exactly one place; every other skill reaches it by name") has no carve-out
for it. If the owner would rather keep audit sweeps review-free, the step is one bullet to delete.

## Rejected

* **Naming it `ship-reviewed-pr`** (the issue's placeholder). "Ship" in this repo's vocabulary now
  reaches through to the merge (`ship-issue`'s autonomous mode), and this skill never merges; a name
  promising shipping would overstate it. The name states the end state it actually reaches.
* **Moving the PR-body specification into the core.** `burn-down-backlog`'s rich-body section,
  `ship-issue`'s step 3, and the perf campaign's evidence list are all about *opening* the PR, which
  is the caller's job; the core's precondition is simply that the body is already complete.
* **Having the core toggle merge authority itself.** It reports the reviewer downgrade; only
  `ship-issue` holds merge authority, so only `ship-issue` says what the downgrade does to it.

## Unvalidated

The core has not yet been run end to end by a caller other than the session that extracted it (which
ran it on its own extraction PR). The seams worth watching: a stacked caller passing the "restrict
to this single tip PR" scoping through to `address-pr-review` correctly, and a `fix-audits` sweep
whose review findings span several items.
