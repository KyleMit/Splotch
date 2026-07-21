---
name: vet-audits
description: Adversarially validate each finding in docs/AUDIT.md against the current code — is it real, worth solving, and actionable — then file the survivors as type:audit GitHub issues and drop the rest. Use when asked to vet, review, or prune the audit backlog before fixing it. Review only; it does not implement fixes.
---

# Vet Audits

Read `docs/AUDIT.md` and the current codebase, then **adversarially** validate each finding against
the actual code — is the problem real, is it *worth solving*, and does the fix agent have what it
needs to act on it. Each survivor becomes a **GitHub issue** labeled `type:audit`; the file is
transient staging that this skill drains and deletes (see `.claude/audit-conventions.md`).

**First, check the file exists.** `docs/AUDIT.md` may be absent — this skill deletes it once it has
drained the backlog into issues, so a missing (or header-only) file is a normal, expected state, not
an error. If there's no `docs/AUDIT.md`, or it holds only the header with no `###` findings, there's
nothing to vet: report "no audit backlog to vet" and stop cleanly.

## For each finding, decide: file as an issue, or drop it

**File as a `type:audit` issue** if the finding is real *and worth acting on* — it improves
performance, readability, maintainability, or architecture by enough to outweigh the cost and risk
of the change. First **search open issues to avoid duplicates** (`search_issues` for the same
file/symptom); if one already tracks it, enrich that issue instead of opening a second. Otherwise,
before filing, sharpen the finding so the fix agent can act on it without re-deriving it:

* Confirm the problem still exists in the current code (cite file + line in the issue's problem
  section).
* Sharpen the proposed solution if the sketch is wrong, harmful, or has a gotcha (see the
  verification angles below).
* **Write the verification** — the concrete way the fix agent will prove the problem is real and
  confirm the fix resolves it: repro steps, a command or script to paste, a profile to capture, the
  test that should fail before and pass after. This is the highest-value thing you add; leave no
  filed issue without it whenever a verification is feasible.

Then open the issue (see **Filing the issue** below).

**Drop** (file no issue, just delete the finding from `docs/AUDIT.md`) if the finding is:

* Already fixed in the current code.
* A false positive (the "problem" is intentional or harmless in context).
* Superseded by another finding on the list.
* **Not worth solving.** This is an adversarial pass, so judge the payoff, not just the truth of the
  claim. If the problem is an unlikely edge case, or the smallest reasonable fix is disproportionate
  to the harm it prevents — enough that acting on it would create more work or risk than the problem
  warrants — cut it. Weigh likelihood × impact against the realistic fix scope; when it doesn't
  clear that bar, remove it rather than leave the fix agent to burn a cycle rediscovering the same
  thing.

## Filing the issue

Open one GitHub issue per surviving finding with the GitHub MCP `issue_write` tool (search first
with `search_issues` to avoid duplicates — enrich an existing issue rather than opening a second).

* **Title** — a concise, imperative summary of the fix ("Debounce the canvas resize handler", not
  "Resize is slow").
* **Body** — carry the sharpened finding over in full, keeping the `#### Problem` /
  `#### Proposed solution` / `#### Verification` sections so the fix agent has everything without
  re-deriving it. Note which audit surfaced it (e.g. "Surfaced by `code-audit`."). Escape any bare
  `#`-number that isn't a deliberate issue reference (see `docs/ISSUE-WORKFLOW.md`).
* **Labels** — always `type:audit`. Add the applicable `area:*` and the substantive `type:*`
  (`type:perf`, `type:chore`, …) when they're clear — an audit issue may carry `type:audit` *and* a
  substantive type (this is the one sanctioned exception to "one `type:` per issue"; see
  `docs/ISSUE-WORKFLOW.md`). **When the finding is valid but you can't confidently determine the fix
  approach or its right categorization, also add `needs-triage`** so a human confirms direction
  before `/fix-audits` implements it — file the issue anyway; don't drop a valid finding just
  because the path forward is fuzzy.

`type:audit` and `needs-triage` are declared in `.github/labels.yml`. If a run needs a label that
isn't there yet, add it to that file (the `Label Sync` workflow pushes it to GitHub) as part of the
run.

## Output

1. Drain `docs/AUDIT.md`: remove every finding you dropped **and** every finding you filed as an
   issue (a filed finding now lives in the issue, not the file). Preserve the file header and any
   `## Source:` sections that still hold un-drained findings; delete a `## Source:` section once its
   last finding is gone. **If no findings remain, delete `docs/AUDIT.md` entirely.**
2. Add one row to `docs/AUDIT-LOG.md` for this run per `.claude/audit-conventions.md` §2 (date ·
   `vet-audits` · one-line summary — issues filed with their numbers vs what was dropped).
3. Commit and push the `docs/AUDIT.md` drain + `docs/AUDIT-LOG.md` row.
4. In your response, print two short lists:
   * **Filed** — one line each: the issue number/link, its labels, and what you sharpened or the
     verification you added (flag any `needs-triage` issues).
   * **Dropped** — one line each, with the reason (fixed / false positive / superseded / not worth
     it).

Do not implement any of the findings — this is a review pass only. Implementation happens via
`/fix-audits`, which burns down the open `type:audit` issues you filed.

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
