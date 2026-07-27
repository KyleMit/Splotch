# Decision-doc template

Every triage decision doc in this directory follows this structure. Keep sections in this order;
omit a section only when it is genuinely empty.

```markdown
# <original finding title>

**Priority/category:** P?[category] · **Cluster:** <cluster id> · **Triaged:** <date> at <HEAD sha>
**Original file(s):** <paths + lines, pinned SHA from the finding> **Draft patch:**
docs/audit-deferred/<name>.patch — or "none"

## Verdict

One of:

* **FIX — clear winner.** A single ideal solution exists; described below.
* **OPTIONS — real tradeoffs.** No single winner; ranked options with a stated lean.
* **DROP — <reason>.** Already resolved elsewhere / not worth doing / invalid; rationale below.

## Original finding (condensed)

2-5 sentences restating the problem. The full text lives in git history of docs/AUDIT-DEFERRED.md.

## Why it was deferred

What the burndown recorded: implementation failed / failed adversarial review (and the reviewer's
unresolved objections, condensed) / verifier gave no brief.

## Current state of the code

What the code looks like *today* (verify at HEAD, not the pinned SHA): does the finding still hold,
has it been partially/fully fixed, have the files moved.

## Options considered

For each option: description, pros, cons. Rank them. (For FIX verdicts this can be short — say why
the winner beats the runner-up. For DROP verdicts, omit.)

## Recommendation

The chosen path (or the lean + the tradeoffs the maintainer must weigh). If a draft patch exists,
state exactly what must change about it to pass the review objections that killed it. Include an
illustrative code sketch when it clarifies the shape — not a complete implementation.

## Suggested next step

Concrete: "re-stage in docs/AUDIT.md as-is", "apply the patch then make fix X", "file as a
type:audit issue", or "dropped — nothing to do".
```
