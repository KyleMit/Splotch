# Vet Audits

Read `docs/AUDIT.md` and the current codebase, then validate each item against the actual code.

## For each item, decide: keep, enrich, or remove

**Keep and enrich** if the suggestion has genuine value — it improves performance, readability, maintainability, or architecture in a way that outweighs the cost of the change. For these items:
- Confirm the problem still exists in the current code (cite file + line)
- Add a concise implementation note if the fix is non-obvious or has a gotcha
- Adjust the priority/order if you find a dependency or sequencing issue

**Remove** if the item is:
- Already fixed in the current code
- A false positive (the "problem" is intentional or harmless in context)
- Too speculative, risky, or low-value to be worth an AI acting on it
- Superseded by another item on the list

## Output

1. Edit `docs/AUDIT.md` in place — remove the items that don't hold up, enrich the ones that do. Preserve each `## Source:` section and the file header.
2. In your response, print two short lists:
   - **Kept / enriched** — one line each, noting what insight you added (if any)
   - **Removed** — one line each, with the reason

Do not implement any of the changes — this is a review pass only. Implementation happens via `/fix-audits`.

## Verification angles that catch what a plain re-read misses

Learned from past runs — check each, not just "does the cited code still look like that":

- **Verify the proposed fix, not just the problem.** A finding can be real while its fix
  sketch is wrong or harmful (e.g. a limiter placed where it would throttle legitimate
  traffic, or a build-time flag that breaks the unit-test contract). Enrich the item with
  the corrected fix rather than letting `/fix-audits` implement the flawed one.
- **Verify the trigger scenario.** A race/bug can be real while the finding's named
  reproduction path is implausible; hunt for the *credible* trigger and swap it in —
  it changes both severity and where the fix belongs.
- **Check ADRs and test configs for intentional design** before keeping an
  architecture item: what reads as "missing cleanup" may be a documented singleton
  (ADR), and what reads as "redundant runtime check" may be a deliberate test seam
  (e.g. `vitest.config.ts` compile-time defines).
- Findings' line numbers may cite the wrong span even when the claim is right
  (state declarations vs the function body) — re-cite from the current code.
