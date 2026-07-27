# Spacing and font sizes are raw px while colors/radii/durations use tokens

**Priority/category:** P2[design-tokens] · **Cluster:** C14 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):**
`web/src/lib/components/ColoringBook.svelte:190,194-198,206-228,254-269,341-372` — pinned at SHA
f934d43 **Draft patch:**
`docs/audit-deferred/p2-design-tokens-spacing-and-font-sizes-are-raw-px-while-colors-radii-du.patch`

## Verdict

**OPTIONS — real tradeoffs.** The exact-match token swaps are a free, zero-visual-change win the
draft already contains. But the residue that killed the draft (24px h2, 28/18/6px paddings, the 36px
button) genuinely divides into "should snap to the scale, accepting a small visual shift" and
"functional one-offs that skill rule 2 licenses as commented literals" — and choosing between
pixel-identical and on-scale is a design-authority call, not a triage call. Lean: scoped per-value
reconciliation of this one file (option 1), not a repo-wide sweep.

## Original finding (condensed)

`ColoringBook.svelte` tokenizes color, radius, and motion but hardcodes every spacing and type value
(32/20/12/8px, `font-size: 24px`) even though `--space-1…8` and `--font-size-xs…3xl` exist — and the
same stylesheet already uses `--font-size-md` for the tile label, proving the tokens are in scope.
Proposed mapping each raw value to the nearest token, treating missing exact matches as a signal to
reconcile with the scale rather than invent px values.

## Why it was deferred

Implementer failed to deliver a fix round. The reviewer's unresolved objection: the draft swapped
only the *exact* scale matches and deliberately preserved `font-size: 24px` plus the raw `28px`,
`18px`, and `6px` paddings to stay pixel-identical — "leaving values without exact matches as
literals does not resolve the original finding." The deadlock is real: the reviewer demanded
reconciliation with the scale (visual changes); the implementer refused visual changes.

## Current state of the code

The finding fully holds at HEAD — none of the values were touched (lines shifted by unrelated state
refactors): `padding: 32px` (`:186`), h2 `margin: 0 0 20px 0; font-size: 24px` (`:191-192`), header
`gap: 12px; margin-bottom: 20px` (`:205-206`), back button `36px`/`padding: 8px` (`:214-223`), grid
`gap: 12px` (`:252`), img `padding: 8px` (`:310`, `:321`), book-tile img `padding: 8px 8px 28px 8px`
(`:327`), mobile `padding: 24px 18px` (`:340`), label `padding: 6px 8px` (`:357`). The scale at
HEAD: `--space-1…8` = 4/8/12/16/20/24/32/40px, `--font-size-2xl` = 22px, `--font-size-3xl` = 28px —
so 32→space-7 (the finding's "space-8" is off by one against today's ramp) and 24px type has no
token.

Two facts discovered at HEAD reframe the finding's "inconsistency" premise:

* **Raw spacing px is the repo norm, not a ColoringBook anomaly.** Only three non-design components
  use `--space-*` at all (ColorPicker, FullscreenToggle, ParentHelpButton); AdminConsole has 27 raw
  spacing declarations, ParentCenter 21, ColoringBook 11. Tokenizing this one file advances it ahead
  of most of the app rather than restoring consistency.
* The design skill's "Migration status" section says the legacy migration is done ("every raw value
  … that mapped to a token was swapped") — which the spacing evidence contradicts. The migration
  commits (e.g. 475's same-value swaps) covered colors/easing/type-family; spacing was never swept.
  Whatever option is chosen, that skill claim needs a truth-up (edit
  `.ruler/skills/design/SKILL.md`, `npm run ruler:apply`).

## Options considered

1. **Scoped per-value reconciliation of ColoringBook (lean).** Start from the draft's exact-match
   swaps (8→`--space-2`, 12→`--space-3`, 20→`--space-5`, 24→`--space-6`, 32→`--space-7`; all
   zero-visual). Then judge each off-scale value on its merits instead of blanket-keeping them:
   * h2 `24px` → `--font-size-2xl` (22px): a genuine snap — the heading sits off the type ramp for
     no documented reason and −2px on a modal heading is near-invisible.
   * `18px` (mobile padding) → `--space-4` (16px): same, minor.
   * `6px` (label padding) → `--space-1` or `--space-2`: pick by screenshot; 4px thins the caption
     band, 8px thickens it.
   * `28px` bottom padding on `.coloring-book-tile img`: **keep as a commented one-off** — it
     reserves the height of the overlaid `.coloring-book-label`; snapping to 24px risks the caption
     overlapping the cover art, 32px opens a gap. Functional, not scale-drift.
   * `36px` back-button width/height: **keep raw** — control sizing, not spacing; the repo has no
     size ramp (the 44px modal close disc and 48px corner buttons in `app.css` are raw too). Pros:
     resolves the finding, small diff, each residual literal carries the WHY comment that skill rule
     2 requires. Cons: introduces deliberate (if tiny) visual shifts needing owner sign-off and
     before/after screenshots in both themes (`pr-screenshots`, `/dev/design`).
2. **Repo-wide spacing/type sweep.** Tokenize all ~14 components with raw spacing, then add a
   spacing ratchet like the raw-hex one in `scripts/lint-token-styles.mjs`. Pros: actual
   consistency; makes the skill's "migration done" claim true. Cons: large churn with visual risk
   across every component for zero user-visible value; far beyond this finding's scope; if wanted,
   it should be its own planned effort, seeded by option 1 as the pattern-setter.
3. **Drop, rely on policy.** Skill rule 2 ("no raw values where a token exists") already governs new
   and edited styles. Pros: zero risk. Cons: forfeits the draft's already-written free swaps and
   leaves the audit-flagged file contradicting the very rule; the ratchet only covers hex colors, so
   nothing enforces the policy for spacing.

## Recommendation

Lean **option 1**. The tradeoff the maintainer must weigh is the one the burndown deadlocked on:
accept ~2px visual shifts to land on-scale (reviewer's position), or demand pixel-identity and
accept commented literals (implementer's position). Option 1 threads it per value: snap where the
scale is the obvious intent (24→2xl, 18→space-4, 6→space-1/2), keep literals only where the value is
functional (28px label reserve, 36px control size) — each with a WHY comment, which is exactly the
escape hatch skill rule 2 defines and the draft failed to use.

A resurrected attempt must differ from the draft in three ways: (a) snap the near-misses instead of
preserving them, (b) comment the survivors so the reviewer sees a justified one-off rather than an
unexamined leftover, and (c) attach before/after screenshots of the picker (both themes, desktop +
`max-width: 520px`) so the next review argues about specific pixels, not principle. Also fix the
draft's own inconsistency: it left `padding: var(--space-6) 18px` and
`padding: var(--space-2) var(--space-2) 28px var(--space-2)` half-tokenized with no comment — the
exact shape the reviewer flagged.

## Suggested next step

Re-stage in docs/AUDIT.md as option 1 with the per-value table above, flagged as needing owner
sign-off on the 24→22px heading and label-padding choices (screenshots in the PR). Fold in the
design-skill "Migration status" truth-up. Option 2, if ever wanted, becomes its own issue — not an
audit burndown item.
