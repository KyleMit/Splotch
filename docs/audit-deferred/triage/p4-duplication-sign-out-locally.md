# Native page reimplements session-state bookkeeping the cookie flow gets from the server

**Priority/category:** P4 duplication · **Cluster:** C08 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/routes/admin/native/+page.svelte:24-32` (`signOutLocally`) — pinned
at SHA f934d43 **Draft patch:** none

## Verdict

**DROP — not worth doing.** The proposed helper adds indirection without adding enforcement, the one
genuinely drift-prone literal has already been fixed by another landed change, and the residual risk
on this admin-only native page is below the cost of the change plus its full-suite gate.

## Original finding (condensed)

`signOutLocally` imperatively resets five reactive fields (`session`, `authed`, `invites`,
`persistent`, `loginError`) plus the admin-link visibility and secure storage — a hand-maintained
mirror of the initial `$state` declarations and of what the web loader's unauthenticated branch
returns. Adding a sixth session field risks forgetting one of the reset sites. Proposed: one
`signedOutState` literal assigned from both the initial declarations and `signOutLocally`, keeping
the side effects explicit.

## Why it was deferred

Implementation "failed" only procedurally: the `signedOutState()` helper was built exactly per the
brief and passed `npm run check`, eslint, `test:unit` (660), and the full `tests/admin.spec.ts` E2E
gate — but the full `npm test` run had not finished when the driver demanded a response, so the
implementer declined to commit unverified work. No design objection was ever raised.

## Current state of the code

`signOutLocally` is unchanged at HEAD (`web/src/routes/admin/native/+page.svelte:25-33`), still
resetting the five fields imperatively — so the finding technically still holds. But the picture
around it improved since the pin:

* fb2f4c2 introduced the shared `ASSUME_PERSISTENT` constant (`$lib/adminFormat`), now used by
  *both* the initial `$state` declaration (line 19) and the reset (line 29) — and by the web
  loader's unauthenticated branch. That was the one value in the list that could drift silently
  (`true` vs `false` reads plausibly either way); the remaining resets are self-evident zero values
  (`''`, `false`, `[]`, `message`).
* The declarations (lines 16-23) and the reset (lines 25-33) sit ten lines apart in the same small
  file, each with a comment; the "already drifted" example the finding cites (`ready`/`flash` not
  reset) is deliberate, correct behavior the finding itself concedes.

## Options considered

1. **Drop** (winner). See below.
2. **Land the attempted `signedOutState()` helper.** Pro: already written and green through nearly
   every gate; co-locates the "empty session" definition. Con: with five *separate* `$state`
   variables, the helper cannot enforce anything — a sixth `$state` field added tomorrow bypasses it
   exactly as easily as it bypasses today's reset list, so the stated drift protection is mostly
   illusory; it also adds a level of indirection to nine straight-line lines.
3. **Restructure into a single `$state` session object** so one assignment truly resets everything.
   The only variant with real enforcement, but it rewrites every reference in the page and template
   — far too much churn for a P4 on the native admin twin.

## Recommendation

Drop it. The only version of this change that actually delivers the promised guarantee (option 3)
costs more than the page warrants, and the cheap version (option 2) is a cosmetic co-location that
still relies on the same human discipline it claims to remove. Since the pin, the shared
`ASSUME_PERSISTENT` constant already removed the one reset value with a real wrong-guess hazard.
This is a stable, ~185-line, parent-facing admin page whose sign-out path is covered by
`tests/admin.spec.ts`; five adjacent assignment lines are not a maintenance burden worth another
full-suite verification cycle.

## Suggested next step

Dropped — nothing to do. If the page ever grows real session-state complexity (a sixth field with a
non-obvious default), revisit as option 3 (single state object), not the literal-mirroring helper.
