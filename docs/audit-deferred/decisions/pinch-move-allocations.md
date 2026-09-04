# Pinch move path allocates per pointermove, against the repo's hot-path rule

**Original finding:** [P4][Performance] — `web/src/lib/actions/pinchZoom.svelte.ts`,
`web/src/lib/actions/spreadTracker.ts` — deferred because it failed adversarial review **Verdict:**
DROP

## Context

The finding observed that each engaged `pinchZoom` pointermove allocates several short-lived objects
— the `getOptions()` options literal in `AiImageResult.svelte`, the `local()` point, the
`tracker.points()` snapshot array, the centroid object, the transform literal fed to and returned
from `clampTransform`, the `getBounds()` bounds object, and the transform template string in
`apply()` — and that `.claude/rules/svelte.md`'s hot-path rule ("code reached per pointermove … must
not allocate arrays/objects") draws no exemption for it. Secondary: the `rect ??
node.getBoundingClientRect()` fallbacks are defensive lazy-init on the move path.

The burndown attempt escalated through three stages — in-place scratch objects, cached option fields
plus numeric CSS custom properties, and finally paused additive Web Animations driven by
`Animation.currentTime` — and the adversarial reviewer rejected all of them: the custom-property
route still serializes numbers to strings (`setProperty` takes strings), the WAAPI route leaked
uncancelled `fill: 'both'` animations from `destroy()`, weakened the E2E assertions to the point
that broken centroid anchoring stayed green, and introduced `Element.animate()` / additive
composition dependencies unregistered in `docs/COMPATIBILITY.md`.

## Current state

Verified at HEAD (b429d03): `pinchZoom.svelte.ts` and `spreadTracker.ts` are byte-identical to the
cd04c367 pin — every allocation site the finding lists is still present, and the rolled-back draft
patch still applies cleanly. The 13 unit tests in `pinchZoom.svelte.test.ts` and
`spreadTracker.test.ts` pass. The action is used in exactly one place: the AI preview stage in
`AiImageResult.svelte`. The gesture never runs concurrently with drawing — the preview is a modal
overlay, and the drawing engine's stroke path does not route through this tracker.

## Options considered

1. **Full allocation elimination (the draft patch).** The only mechanism that genuinely avoids
   per-move string construction is the paused-animation `currentTime` trick, because every
   style-based transform update (`style.transform`, `setProperty`) requires a string. That is
   precisely the approach the reviewer rejected, and its costs stand independent of the review: an
   unregistered compatibility surface, animation-lifecycle management in `destroy()`, and E2E
   coverage that had to trade direct transform assertions for geometry probes. The draft also swaps
   the recomputed centroid for an incrementally maintained running sum and inlines a copy of
   `clampTransform`'s clamp math inside `recompute()` — the first accumulates floating-point error
   across a long gesture instead of preserving exact numeric behavior, the second forks the clamp
   logic away from the exported, unit-tested `clampTransform`.
2. **Partial cleanup** (scratch objects, single `points()` pass, cache the option fields, drop the
   `??` fallbacks). Cheap, but the reviewer's first objection sets the acceptance bar explicitly:
   the finding counts as resolved only when the options object and the transform string go too. A
   partial pass leaves the finding's headline claim ("allocates per pointermove") true, trades the
   current straightforward value-semantics code for mutation-based plumbing, and buys nothing
   measurable (see below).
3. **Drop.** Accept the allocations as within budget for this path and record why.

## Decision / lean

DROP. Two facts together decide it:

* **The win is unmeasurable.** The path runs only while two fingers pinch the AI preview — drawing
  is inactive, so no frame budget shared with the stroke path is at stake. Per move it allocates
  roughly six small nursery objects and one short string, alongside the `PointerEvent` object the
  browser allocates for the same move no matter what the handler does. Generational GCs reclaim this
  class of garbage for near-zero cost. The `npm run perf:*` harness measures drawing, so no
  regression test would even observe the change.
* **The recorded acceptance bar and the repo's other constraints are jointly unsatisfiable at
  reasonable cost.** Meeting the bar requires the WAAPI machinery; the WAAPI machinery fails on
  compatibility, lifecycle, and test-strength grounds — the same review that set the bar rejected
  the only implementation that clears it. Anything short of the bar is option 2, which the bar
  itself disqualifies.

The hot-path rule's *purpose* — protecting the drawing frame budget, verified by `npm run perf:*` —
is not implicated here; the rule's enforcement clause already scopes it to paths the perf harness
can measure. If the literal "gesture trackers" wording keeps generating findings against the
preview-only pinch path, sharpening that sentence in `.claude/rules/svelte.md` (source: `.ruler/`)
is the follow-up, not rewriting the gesture code.

The secondary `rect ?? node.getBoundingClientRect()` point is confirmed unreachable in practice
(`local()` runs only after a `pointerdown` that snapshotted `rect`), but removing it costs a
non-null assertion or closure restructuring to save one branch and zero allocations — not worth a
standalone change, and bundling it here would be option 2 by another name.

## Why the previous attempt failed, and how this path avoids it

Every reviewer objection targeted the implementation's attempt to clear an absolute
allocation-freedom bar (residual option-object and string allocations, the WAAPI leak and compat
gap, the weakened E2E assertions). Dropping the finding moots them all: the current code keeps its
direct transform-string assertions in `ai-result.spec.ts`, its exact numeric behavior, its single
clamp implementation, and no new browser-API surface. The rolled-back draft patch is deleted with
this decision — its centroid running-sum and clamp inlining are the parts a future implementer
should specifically *not* reuse.
