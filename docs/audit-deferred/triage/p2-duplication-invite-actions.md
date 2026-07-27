# The three per-invite action groups are triplicated markup

**Priority/category:** P2 duplication · **Cluster:** C08 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/lib/components/admin/AdminConsole.svelte:278-304, 306-323, 338-373` —
pinned at SHA f934d43 **Draft patch:**
docs/audit-deferred/p2-duplication-the-three-per-invite-action-groups-are-triplicated-markup.patch

## Verdict

**DROP — overtaken by a landed refactor, and the review history showed the "duplication" is largely
deliberate difference.** The draft no longer applies, the file it targeted has been restructured by
a different audit fix, and three review rounds demonstrated the three surfaces are intentionally
divergent in exactly the ways a shared snippet has to fight.

## Original finding (condensed)

"Copy code / Copy link / Remove" for one invite was written out three times in AdminConsole.svelte
(wide labelled row, narrow "Copy + ⋯" pair, modal sheet), each restating the copy-key construction,
the `class:copied` toggle, and the remove wiring. Adding or renaming an action is a three-place
edit, and the copies had drifted (label "Copy" vs "Copy code"; flash missing from the menu).
Proposed: a child component or `{#snippet}` shared by all three contexts.

## Why it was deferred

Failed adversarial review, five objections over three rounds. Reconstructing against the final patch
state:

* **Addressed by round 2:** the sheet's dead `.more-menu-item.copied` CSS and never-rendering flash
  (dropped; `flashed = !inMenu && copied === key`), and the cross-surface flash leak into the menu
  items (same gate).
* **Addressed by round 3:** the false comment (corrected to say link-copy has no narrow-width
  feedback), and the untested behavior (a narrow-viewport spec driving the ⋯ sheet, with a
  synchronous-snapshot leak guard verified to fail against a reintroduced leak).
* **Still failing in the final patch:** the racy clipboard assertions. The spec still reads the
  clipboard with non-retrying `expect(await page.evaluate(() => navigator.clipboard.readText()))`
  immediately after the sheet item's click (patch lines 211, 220) instead of the requested
  `expect.poll` — `copy()` awaits the clipboard write while `closeMenu()` runs synchronously, so the
  read can land before the write does.

## Current state of the code

The finding's target no longer exists in the form it described. Commit 8a04c0a (PR 545, after the
pin) extracted the entire more-menu sheet into `web/src/lib/components/admin/InviteMenu.svelte`, and
918f2a6 centralized the copy-key construction as the exported `copyKey(token, target)` helper both
files now use. `git apply --check` fails on the draft's AdminConsole hunks.

What remains at HEAD:

* `AdminConsole.svelte:243-288` — full row (3 buttons) and compact row (1 copy button + ⋯ opener).
  The only same-file duplication left is the copy-code button appearing twice, differing in label
  ("Copy code" vs "Copy") by design.
* `InviteMenu.svelte:41-71` — the sheet's three items, now a separate component with genuinely
  different chrome (`more-menu-item` list items vs `btn` pills), different behavior (dismiss on
  click, deliberately no flash — the review proved a sheet flash *cannot* render, since dismissal
  unmounts the item before `copy()` resolves), and its own callback contract.

## Recommendation

Drop it. The economics changed on both sides:

* **The benefit shrank.** The three-places-in-one-file triplication is gone; a fourth action is now
  a two-button edit in AdminConsole plus one list item in InviteMenu, and each site's markup is
  small and honestly different. The "drift" the finding cited (short label, missing menu flash)
  turned out to be intentional design, confirmed empirically during review.
* **The cost proved real.** Three rounds and five objections were spent forcing one snippet to serve
  surfaces that differ in chrome, feedback, and lifecycle — and the final state still failed review.
  Re-doing that across a component boundary (snippet props into InviteMenu, or re-inlining the
  sheet, reversing a landed audit fix) is strictly more churn for a parent-facing, low-traffic admin
  page.

One salvageable asset, independent of the refactor: the round-3 narrow-viewport E2E spec. HEAD still
has no coverage of the ⋯ sheet (`web/tests/admin.spec.ts` never opens it), and the spec — including
its login-budget note — ports to the InviteMenu structure with minor locator tweaks. If adopted, fix
the one open objection by wrapping both clipboard reads in
`expect.poll(() => page.evaluate(() => navigator.clipboard.readText()))`, the idiom flows.spec.ts
already uses.

## Suggested next step

Dropped — nothing to do on the duplication itself. Optionally re-stage a *new, testing-scoped*
finding in docs/AUDIT.md: "the narrow-viewport ⋯ sheet (InviteMenu.svelte) has no E2E coverage",
pointing at the draft patch's spec as a starting point plus the `expect.poll` correction.
