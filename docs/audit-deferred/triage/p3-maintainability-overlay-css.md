# Engine-created overlay CSS duplicates DrawingCanvas's `.crayon-overlay` styles

**Priority/category:** P3[maintainability] · **Cluster:** C01 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/lib/drawing/engine.ts:1261-1268` and
`web/src/lib/components/DrawingCanvas.svelte:477-489` — pinned at SHA f934d43 **Draft patch:** none

## Verdict

**OPTIONS — real tradeoffs.** Lean: single-source the rules in the global stylesheet (`app.css`) and
have the engine assign class names instead of a `cssText` string — but dropping the finding is a
defensible cheap call, because the engine-created path now serves only the `/dev/engine` harness.

## Original finding (condensed)

The engine builds its overlay canvases with an inline `cssText` string
(position/inset/size/pointer-events/z-index + `mix-blend-mode:darken` on the bottom layer), and
`DrawingCanvas.svelte` re-declares the same geometry and blend in its scoped `.crayon-overlay` rules
— the component comment literally says "keep the two in sync". Two sources of truth for one visual
contract; a z-index or blend change made once silently diverges `/dev/engine` from production.

## Why it was deferred

No deferral detail recorded in AUDIT-DEFERRED.md — the burndown likely lacked a verifier for this
finding, so there is no implementation attempt or reviewer objection on file.

## Current state of the code

Still duplicated at HEAD: `cssText` at `engine.ts:1244-1251` (inside `setupCrayonOverlays`), scoped
rules at `DrawingCanvas.svelte:478-493` with the "keep the two in sync" comment. One thing has
sharpened since the finding was filed: post-ADR-0072 the production path is always the
template-owned overlays (the engine *adopts* `canvas[data-crayon-overlay]` from the markup); the
engine-created branch runs **only** on `/dev/engine`, which inits after hydration. So the blast
radius of divergence is "the dev harness's crayon preview quietly stops matching production" —
annoying and misleading during tuning work, but never user-visible.

Constraint that shapes the fix: DrawingCanvas's rules are Svelte-scoped, so engine-created elements
can't pick them up by class name, and a `:global` block inside DrawingCanvas wouldn't load on
`/dev/engine` (the component isn't in that route's bundle). The only shared stylesheet both paths
load is `app.css` (imported by the root `+layout.svelte`, so every route gets it).

## Options considered

1. **Single-source in `app.css`** (lean): move the `.crayon-overlay` / `.crayon-overlay-top` rules
   verbatim into `app.css`; `setupCrayonOverlays` sets `el.className = 'crayon-overlay'` (and
   `'crayon-overlay crayon-overlay-top'`) instead of `cssText`; delete the scoped copy and the "keep
   in sync" comment. Pros: one source, both paths byte-identical, kills a documented maintenance
   landmine; no markup change, so hydration is untouched; `z-index: 2` still resolves inside
   `.canvas-stack`'s isolated stacking context. Cons: two global class names for a component-scoped
   concern — tolerated by the svelte.md rule's carve-out (classes set imperatively), but it is
   production-CSS churn whose beneficiary is a dev harness.
2. **Exported `OVERLAY_CSS` constant** consumed by the engine: does not actually deduplicate — a
   scoped `<style>` block cannot read a TS constant, so the Svelte copy survives and the "sync"
   comment merely moves. Rejected.
3. **Drop**: accept the comment-guarded duplication. The properties are stable (unchanged since the
   overlays landed), the divergence failure mode is harness-only, and the comment names the duty.
   Defensible, but it leaves a standing "remember to edit twice" trap in correctness-adjacent
   preview code that the crayon-tuning workflow relies on.

## Recommendation

Option 1, executed as a pure move (no property changes, before/after screenshot parity on both `/`
and `/dev/engine`). If the maintainer weighs the global-CSS convention cost higher than the
harness-drift risk, Option 3 costs nothing — the middle option is the only wrong one.

Verification: load `/` and `/dev/engine`, draw a crayon stroke over existing ink on each; the
open-pass preview and post-stamp pixels must match today's.
`grep -rn 'mix-blend-mode: darken'
web/src` returns one styling location afterwards.

## Suggested next step

Re-stage in `docs/AUDIT.md` as Option 1; implement in the same PR as the C01 overlay-struct change
(finding 4) — both edit `setupCrayonOverlays`, so bundling avoids conflicting touches.
