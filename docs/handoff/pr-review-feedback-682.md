# Handoff — address PR 682 review feedback

> 2026-07-31 · branch `experiment/trusted-ipad-input` · PR
> [#682](https://github.com/KyleMit/Splotch/pull/682) · Triage and resolve every review comment only
> after the performance/report work has reached its final branch state.

## Objective & non-goals

**Objective.** Run the repository’s `address-pr-review` workflow against PR #682, revalidate every
comment against the current code and architecture, implement valid findings, reply to invalid or
stale findings with evidence, and resolve addressed threads.

**Non-goals.** Do not apply old suggestions mechanically, reopen settled architecture without device
evidence, or bundle unrelated cleanup into the performance PR.

## State

The user explicitly requested this as the last task after all current performance work. It has not
been run because the session is handing off before the physical Android matrix, scorer refinement,
final regression, and report refresh. The branch has drifted substantially through `b91fcc08`, so
review comments may refer to superseded code.

## Decisions made (and why)

* Run review triage last. Earlier execution would validate comments against a moving target.
* Use `.agents/skills/address-pr-review/SKILL.md`; it is the repository-specific workflow and
  requires checking code and empirical behavior before replying.
* Preserve one-issue/one-commit provenance for any substantive performance change and include the
  focused before/after result in the GitHub reply.
* A review suggestion that conflicts with ADR-0085–0092 needs architectural evidence, not a terse
  dismissal.

## Unverified assumptions

* The set of unresolved GitHub review threads is unchanged.
* CI and the PR diff will remain reviewable after the final report/skill/handoff commits.
* Existing comments do not require access to the physical iPad after it is disconnected.

## Done & verified

* The branch and PR are identified.
* Major retained decisions are documented in ADRs and the session scratchpad, providing evidence for
  review validation.
* The user’s required ordering is captured durably.

## Risks & next 3 steps

1. Finish or explicitly defer every earlier handoff, ensure the worktree is clean, then read the
   `address-pr-review` skill in full.
2. Fetch all unresolved review threads and validate them one by one against current files, tests,
   ADRs, and device results; implement only valid feedback.
3. Push each fix, reply with the exact solution or rejection rationale, resolve threads, and run the
   PR’s relevant CI/focused performance checks.

The main risk is treating a historically valid comment as currently valid after the implementation
has moved. Always resolve the current line and behavior before deciding.

## Reread first

* `.agents/skills/address-pr-review/SKILL.md`
* `docs/scratchpad/ipad-performance-investigation-2026-07.md`
* `docs/adrs/0085-tiled-live-canvas-for-ipad-webkit.md`
* `docs/adrs/0090-tiered-real-ipad-performance-regression-gates.md`
* `git log --reverse origin/main..HEAD`
