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

| #  | Finding                                                        | Priority | Decision doc                                                       | Verdict |
| -- | -------------------------------------------------------------- | -------- | ------------------------------------------------------------------ | ------- |
| 1  | `--check` flag parsing ad hoc in every gate script             | P4       | [check-flag-parsing.md](check-flag-parsing.md)                     | FIX     |
| 2  | Copy-pasted CLI `flag()` parser in every perf entry script     | P1       | [perf-flag-parser.md](perf-flag-parser.md)                         | pending |
| 3  | `bumpAndroidGradle`/`bumpIosPbxproj` unanchored global regexes | P2       | [native-version-regexes.md](native-version-regexes.md)             | FIX     |
| 4  | `scripts/lib/utils.mjs` grab-bag of unrelated concerns         | P2       | [utils-grab-bag.md](utils-grab-bag.md)                             | pending |
| 5  | `/dev/engine` readiness `beforeEach` duplicated across specs   | P2       | [engine-readiness-duplication.md](engine-readiness-duplication.md) | FIX     |
| 6  | Crayon tests re-derive point generators/samplers inline        | P2       | [crayon-test-helpers.md](crayon-test-helpers.md)                   | pending |
| 7  | Single Parent-Center test asserts ~six behaviors               | P2       | [parent-center-test-split.md](parent-center-test-split.md)         | FIX     |
| 8  | Browser floor duplicated: `vite.config.ts` vs `browserslist`   | P1       | [browser-floor-duplication.md](browser-floor-duplication.md)       | pending |
| 9  | Git version derivation embedded untestable in `vite.config.ts` | P3       | [git-version-derivation.md](git-version-derivation.md)             | FIX     |
| 10 | `CAPACITOR` single signal re-derived in every config           | P3       | [capacitor-single-signal.md](capacitor-single-signal.md)           | DROP    |
| 11 | `android:allowBackup="true"` unexplained for a kids app        | P4       | [android-allowbackup.md](android-allowbackup.md)                   | pending |
| 12 | npm@11 pin rationale copy-pasted across four shell files       | P2       | [npm11-pin-rationale.md](npm11-pin-rationale.md)                   | FIX     |
| 13 | Android emulator API level second source of truth              | P3       | [android-emulator-api-level.md](android-emulator-api-level.md)     | pending |
| 14 | Proof-sheet hub tab UI lacks ARIA tab semantics                | P4       | [proof-sheet-tab-aria.md](proof-sheet-tab-aria.md)                 | pending |
| 15 | `--experimental-strip-types` flag pair repeated 10× and stale  | P2       | [strip-types-flags.md](strip-types-flags.md)                       | pending |

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
