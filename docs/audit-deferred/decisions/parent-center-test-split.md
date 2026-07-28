# Single Parent-Center test asserts ~six behaviors — split into focused tests

**Original finding:** [P2][test-quality] — `web/tests/flows.spec.ts:853-914` ('parent center shows
quick toggles on a landscape phone'), pinned at f934d43 — deferred because it failed adversarial
review over exactly where the test boundaries fall. **Verdict:** FIX

## Context

The finding: one 60-line Playwright test verifies six distinct behaviors — (1) the compact class
renders, (2) quick toggles present / hub+sidebar absent, (3) the orientation-lock cell occupies the
last slot, (4) the advanced-controls quick toggle drives its setting, (5) the portrait/landscape
lock selector cycles select→move→release→re-select, and (6) rotating to portrait carries the
settings into the full hub. A failure in any sub-flow reports under the one generic title, and no
concern can run in isolation.

The burndown draft (kept at
`docs/audit-deferred/p2-test-quality-a-single-parent-center-test-asserts-six-distinct-behavio.patch`,
3 commits) split it into four tests plus an `openParentCenterCompact(page)` helper. The reviewer's
unresolved objections, all about boundary carving:

1. The selector-cycle test still rotated to portrait and verified the lock in the full Appearance
   hub, so a rotation-carry failure reported under "the orientation lock selector cycles
   portrait/landscape/off". Rotation belongs in a persistence-titled test.
2. `openParentCenterCompact` asserted the compact class, so a compact-rendering regression failed
   every focused test during setup instead of only the rendering test. The helper must stay limited
   to viewport/navigation/modal setup.
3. The persistence test double-clicked an already-active Portrait control without checking the
   intermediate off state, so a completely broken no-op Portrait click handler still passed.
4. After the round-2 rework, the cycle test ended before re-selecting Portrait while the persistence
   test only exercised Portrait→off→Portrait — the original Portrait→Landscape→off→Portrait sequence
   disappeared, dropping coverage of regressions that depend on the prior landscape state.

The review whipsawed: objection 1 pushed rotation out of the cycle test; complying with it produced
objection 4 (the full cycle got split across tests and partially lost). Objections 2 and 3 were
already resolved in the final draft state. The remaining disagreement is purely about which test
owns which step — finite and resolvable, not open-ended scope creep.

## Current state

Still real at HEAD (verified at 5b16292). `flows.spec.ts` no longer exists — it was split into
`flows-*.spec.ts` files — but the monolithic test moved verbatim to
`web/tests/flows-parent-center.spec.ts:80-141` under the same title, still asserting all six
behaviors in one body. The draft patch applies cleanly to HEAD (`git apply --check` passes), so it
remains usable raw material.

## Options considered

1. **Three focused tests (winner)** — rendering, full selector cycle, and one persistence test
   owning the rotation-carry for *both* settings. Satisfies all four objections; costs two extra
   `gotoApp` + `openParentCenter` setups over the monolith.
2. **The draft's four tests, re-fixed** — same as (1) but with separate persistence tests for the
   advanced-controls toggle and the orientation lock. Rejected: both assert the same behavior
   ("compact quick-toggle state carries into the full portrait shell"), and each pays the expensive
   tail (rotate, navigate hub sections) plus its own setup. The extra test buys no diagnostic
   precision — a failure in either reports as rotation-carry either way — and the original
   monolith's sin was six *unrelated* behaviors, not two instances of one.
3. **Keep the monolith (DROP)** — rejected. The diagnostic problem is genuine, the split is cheap,
   and E2E-runtime cost is small: two added setups of a few seconds each in a suite that runs 4
   parallel workers, in a file that already holds six tests. Not worth an OPTIONS brief.

## Decision / lean

**FIX** — implement exactly this carving in `web/tests/flows-parent-center.spec.ts`, replacing the
test at lines 80-141. No other files change.

**Helper** (objection 2 — no assertions beyond what `openParentCenter` already retries on):

```ts
async function openParentCenterCompact(page: Page) {
  await page.setViewportSize({ width: 852, height: 390 });
  await gotoApp(page);
  return openParentCenter(page);
}
```

**Test 1 — `'landscape phone renders compact quick toggles'`** (behaviors 1-3). Owns: the
`/compact/` class assertion on the modal (moved here from setup), `.hub-list` and `.pc-nav` absent,
`#quickSoundToggle` / `#quickNightToggle` / `#quickAdvancedControlsToggle` visible, the
orientation-lock cell at `.quick-toggles > .setting` slot 3 containing both lock buttons, and the
"Switch to portrait for the full settings" hint. Keep the existing explanatory comment block above
this test.

**Test 2 — `'the orientation lock selector cycles portrait, landscape, and off'`** (behavior 5, full
original sequence — objections 1 and 4). Owns, in order: Portrait starts active (`aria-pressed`
true/false pair), click Landscape → lock moves, click Landscape again → both off (released), click
Portrait → Portrait active again. Ends there — **no rotation, no full-hub assertions**. The
re-select-after-landscape-release step lives here, restoring the Portrait→Landscape→off→Portrait
coverage objection 4 demanded.

**Test 3 — `'quick-toggle changes persist into the full portrait Parent Center'`** (behaviors 4+6 —
objections 1 and 3). Owns: click `#quickAdvancedControlsToggle` → `aria-checked` "false"; then set a
portrait lock *with the intermediate state verified* — Portrait starts active, click it →
`aria-pressed` "false" (proves the handler acts), click it again → "true"; then rotate to 390×852
and assert the full shell took over (`.hub-list` visible, `#quickSoundToggle` count 0), drill into
Controls & Buttons → `#advancedControlsToggle` `aria-checked` "false", Back, Appearance & Display →
`#lockRotationToggle` "true" and `#forceLandscapeToggle` "false".

Verification: `npm run test:e2e -- flows-parent-center --repeat-each=10` green (the testing rules'
flake bar for changed specs), and each new title names exactly the behavior its assertions cover.

## Why the previous attempt failed, and how this path avoids it

* **Objection 1 (cycle test contained rotation):** no test titled "cycles" touches the viewport
  after setup. Rotation-carry assertions exist only in Test 3, whose title says "persist".
* **Objection 2 (helper asserted compact class):** the helper is viewport + `gotoApp` +
  `openParentCenter` only; the class assertion lives solely in Test 1. (The final draft already did
  this — carried forward unchanged.)
* **Objection 3 (no intermediate off-state check):** Test 3 asserts `aria-pressed` "false" between
  the two Portrait clicks, so a no-op click handler fails there.
* **Objection 4 (Portrait→Landscape→off→Portrait sequence lost):** the complete sequence is restored
  as the single body of Test 2. The draft lost it by trying to satisfy objection 1 through
  truncation; this carving satisfies both at once because "re-select after release" is part of the
  *cycle* behavior, while Test 3 only needs *a* portrait lock set (its off→on toggle doubles as the
  objection-3 check). No objection is ruled out of scope — all four are met simultaneously; the
  prior failure was sequencing (each round fixed one boundary and broke another), not an
  impossible-to-satisfy reviewer.

Out of scope, explicitly: further splitting Test 3 per setting (rejected as option 2), and touching
any other test in the file.

## Post-merge addendum (2026-07-28, after PR 583 merged)

PR 583 added an unrelated test to `web/tests/flows-parent-center.spec.ts` ("setting card spacing
only applies to direct section siblings") above the monolith, which is otherwise untouched — the
finding and the 3-test carving above stand as written; only the monolith's line numbers shifted
(~+31). Re-verify `git apply --check` on the draft before reusing it; expect at worst context
offsets, not conflicts.
