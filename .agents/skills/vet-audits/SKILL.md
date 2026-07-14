---
name: vet-audits
description: Adversarially validate each finding in docs/AUDIT.md against the current code — is it real, worth solving, and actionable — enriching the keepers with verification steps and pruning the rest. Use when asked to vet, review, or prune the audit backlog before fixing it. Review only; it does not implement fixes.
---

# Vet Audits

Read `docs/AUDIT.md` and the current codebase, then **adversarially** validate each finding against
the actual code — is the problem real, is it *worth solving*, and does the fix agent have what it
needs to act on it.

**First, check the file exists.** `docs/AUDIT.md` may be absent — `/fix-audits` deletes it once the
backlog is cleared, so a missing (or header-only) file is a normal, expected state, not an error. If
there's no `docs/AUDIT.md`, or it holds only the header with no `###` findings, there's nothing to
vet: report "no audit backlog to vet" and stop cleanly.

## For each finding, decide: keep, enrich, or remove

**Keep and enrich** if the finding is real *and worth acting on* — it improves performance,
readability, maintainability, or architecture by enough to outweigh the cost and risk of the change.
For these findings:

* Confirm the problem still exists in the current code (cite file + line in `#### Problem`).
* Sharpen `#### Proposed solution` if the sketch is wrong, harmful, or has a gotcha (see the
  verification angles below).
* **Fill in `#### Verification`** — the concrete way the fix agent will prove the problem is real
  and confirm the fix resolves it: repro steps, a command or script to paste, a profile to capture,
  the test that should fail before and pass after. This is the highest-value thing you add here;
  leave no kept finding without it whenever a verification is feasible.
* Adjust the priority/order if you find a dependency or sequencing issue.

**Remove** if the finding is:

* Already fixed in the current code.
* A false positive (the "problem" is intentional or harmless in context).
* Superseded by another finding on the list.
* **Not worth solving.** This is an adversarial pass, so judge the payoff, not just the truth of the
  claim. If the problem is an unlikely edge case, or the smallest reasonable fix is disproportionate
  to the harm it prevents — enough that acting on it would create more work or risk than the problem
  warrants — cut it. Weigh likelihood × impact against the realistic fix scope; when it doesn't
  clear that bar, remove it rather than leave the fix agent to burn a cycle rediscovering the same
  thing.

## Output

1. Edit `docs/AUDIT.md` in place — remove the findings that don't hold up, enrich the ones that do.
   Each finding is a `### [Category] …` block with `#### Problem` / `#### Proposed solution` /
   `#### Verification` inside (see `.claude/audit-conventions.md`); preserve each `## Source:`
   section and the file header.
2. Add one row to `docs/AUDIT-LOG.md` for this run per `.claude/audit-conventions.md` §2 (date ·
   `vet-audits` · one-line prune summary — what you kept/enriched vs removed).
3. In your response, print two short lists:
   * **Kept / enriched** — one line each, noting what you sharpened or the verification you added.
   * **Removed** — one line each, with the reason (fixed / false positive / superseded / not worth
     it).

Do not implement any of the changes — this is a review pass only. Implementation happens via
`/fix-audits`.

## Verification angles that catch what a plain re-read misses

Learned from past runs — check each, not just "does the cited code still look like that":

* **Verify the proposed fix, not just the problem.** A finding can be real while its fix sketch is
  wrong or harmful (e.g. a limiter placed where it would throttle legitimate traffic, or a
  build-time flag that breaks the unit-test contract). Enrich the item with the corrected fix rather
  than letting `/fix-audits` implement the flawed one.
* **Verify the trigger scenario.** A race/bug can be real while the finding's named reproduction
  path is implausible; hunt for the *credible* trigger and swap it in — it changes both severity and
  where the fix belongs.
* **Check ADRs and test configs for intentional design** before keeping an architecture item: what
  reads as "missing cleanup" may be a documented singleton (ADR), and what reads as "redundant
  runtime check" may be a deliberate test seam (e.g. `vitest.config.ts` compile-time defines).
* **A finding can be mechanically real yet immaterial to the consumer it feeds.** Don't stop at
  "yes, the code does diverge/duplicate as described" — trace the divergence to whatever *reads* it
  and check it actually changes that outcome. A composite that simulates a retired render path was a
  true divergence, but the only gates it fed sampled pixels the difference never touched (the eye
  gates read un-punched pupil fill; the screen blend whitened chalk pixels regardless of the
  substituted base), so the "scores judge the wrong image" framing collapsed to a one-line DRY nit.
  Remove when the payoff evaporates at the consumer even though the mechanism is exactly as claimed.
* **Price in the prerequisite refactor for an extraction candidate.** An "extract this loop into a
  testable function" item is only worth it if the module can actually be imported and the extracted
  unit carries real logic. If the CLI runs everything at top level with no main-module guard,
  extraction first needs that guard added; and if the loop is just I/O orchestration around pure
  helpers that already live in `lib/` (Gemini calls + file writes), the testability win is small.
  Weigh the guard-plus-thread-a-context cost against that thin payoff before keeping it.
* Findings' line numbers may cite the wrong span even when the claim is right (state declarations vs
  the function body) — re-cite from the current code.
