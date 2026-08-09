# Deferred-audit triage — decision records

> Triage pass over the 15 findings in `docs/AUDIT-DEFERRED.md` as of 2026-07-28 (repo HEAD
> 63a7aa49ed34b6116c357de5ca3a850677cfbed9). Every finding here failed the scripted burndown's
> multi-round review; each decision doc settles what to do with it so implementation can proceed
> with confidence. Once a finding's decision doc lands, its entry is drained from
> `docs/AUDIT-DEFERRED.md` (full original text stays in git history).

## Verdicts

* **FIX** — a single clear winning approach exists; the doc specifies it concretely enough to
  implement without re-litigating the failed review.
* **OPTIONS** — real tradeoffs remain; the doc ranks the candidates with pros/cons and states the
  lean.
* **DROP** — no longer worth doing (already resolved elsewhere, cost exceeds value, or the premise
  no longer holds); the doc explains why.

## Status

| #  | Finding                                                       | Priority | Decision doc                                             | Verdict |
| -- | ------------------------------------------------------------- | -------- | -------------------------------------------------------- | ------- |
| 15 | `--experimental-strip-types` flag pair repeated 10× and stale | P2       | [strip-types-flags.md](strip-types-flags.md)             | FIX     |
| —  | Personal device identifiers hard-coded into committed scripts | P3       | [personal-device-scripts.md](personal-device-scripts.md) | DROP    |

Findings 1–14 from this pass are dispatched. Each decision doc was deleted by the commit that
resolved it, so the doc and its implementation sit in the same changeset — recover any of them with:

```sh
git log --diff-filter=D --oneline -- docs/audit-deferred/decisions/
```

## Decision-doc template

Each doc is self-contained (no need to consult `docs/AUDIT-DEFERRED.md` history) and follows:

```markdown
# <Finding title>

**Original finding:** [P#][category] — <files> — deferred because <reason> **Verdict:** FIX |
OPTIONS | DROP

## Context

What the finding claimed and why the burndown attempt failed review (the unresolved objections).

## Current state

What the code looks like at HEAD now — is the problem still real? (Verified, not assumed.)

## Options considered

Each candidate with pros/cons, ranked. (A FIX doc may collapse this to the single winner and the
rejected alternatives; a DROP doc explains why no option clears the bar.)

## Decision / lean

The verdict, the reasoning, and — for OPTIONS — where the doc's author leans and which tradeoffs the
implementer/owner must weigh.

## Why the previous attempt failed, and how this path avoids it

Map each reviewer objection to how the chosen path resolves it — or an explicit, argued call that
the objection was scope creep and is out of scope.

## Implementation sketch (optional)

Illustrative code/fences only — enough to make the shape concrete, not a complete change.
```
