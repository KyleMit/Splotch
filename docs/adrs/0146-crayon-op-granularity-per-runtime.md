# ADR-0146: Crayon Op Granularity Is a Per-Runtime Decision

**Status:** Active — amends ADR-0065 and ADR-0137 **Date:** 2026-08

## Context

Crayon is the one brush whose op shape is a live cost knob rather than a free coalesce. Every other
brush paints one shape per op, so a frame's worth of pointermoves merges into a single path and the
per-op cost disappears. Crayon deposits wax through two pattern passes into two surfaces per op
(ADR-0065), so both op *count* and op *path length* are real costs — and the August 2026 performance
campaign found the two shipping WebKit runtimes price them oppositely:

* **Safari charges for path length.** Merging a frame's moves into one longer path paints a larger
  dirty region per `stroke()` call and was measured making crayon *worse*: 1.57% → 2.11% of
  in-contact frame time. That measurement had hardened into "crayon cannot be merged" — a Safari
  result generalized past its runtime.
* **The Capacitor WKWebView charges per op.** The issue-1216 recapture measured native crayon at
  roughly **twice** Safari's cost on the same physical iPad (worst paint frames 55–87 ms against
  45–48 ms; issue 1236) — which mattered beyond an ordinary red cell, because the app children use
  on an iPad is the native one, while ADR-0137's crayon exception had been argued from the Safari
  number.

A same-day A/B on the device (portrait-light, ten gesture repeats) ordered the alternatives for the
WKWebView: one op per coalesced sample cost 3.07% (discarded; preserved as closed PR 1331), the
per-move status quo 1.74%, and per-frame merging 1.46%/0.99% — shipped, three same-session samples
read 0.96/1.11/1.44%, median 1.11%, inside the web cell's own band. There is no single op shape that
is right for both runtimes: each one's optimum is the other's pessimum.

## Decision

Crayon's wax-deposition granularity is decided per runtime, from the same compile-time
`CAPACITOR=true` signal that owns every web-vs-native branch: the **web build keeps one op per
pointermove**, the **native build merges a frame's moves into one op**, capped at
`CRAYON_MERGED_MOVES_CAP = 8` moves per op so a main-thread stall cannot merge unbounded moves into
one op whose bounding box selects tiles the ink never enters.

Implementation: `crayonOpGranularity` (`'per-move' | 'per-frame'`) is a dependency of
`createStrokeRasterQueue` in `web/src/lib/drawing/strokeRasterQueue.ts`; the engine derives its
value from `__IS_CAPACITOR__`. The engine's value is the compile-time literal, but this module takes
it as a dependency rather than reading the define directly — vitest pins `__IS_CAPACITOR__` true and
would dead-code-eliminate whichever branch the web build ships, and both granularities must stay
testable. The branch itself sits on a cold path (one comparison per flushed batch). Pinned by tests:
the cap, crayon-eraser merging, and resume-flush ordering in both granularities.

**The load-bearing invariant is that granularity is invisible in the pixels.** Merged ops consume
the same point sequence (`CrayonPassTracker` bookkeeping keeps the drawn path byte-identical), the
pattern phase is pass-scoped and paper-anchored (`seed` per pass, absolute `setTransform`), and the
pass buffer is idempotent binary-alpha wax — so batching changes *when* pixels are written, never
*which* pixels or what color. The one behavior the review found moving was checkpoint placement via
a split-frame credit bug (the trailing post-split batch re-credited moves the split had zeroed),
fixed before shipping. The contract was then verified by a human on 2026-08-26 (issue 1372): the
merged-op native build side by side against Safari's per-move rendering on the same physical iPad,
visually indistinguishable — including long strokes that split a deposition pass and mid-stroke
undo, the cases the perf A/B never exercised.

With the 2× penalty gone, the native crayon cell holds the same 1.5% lost-frame exception as the
Safari cell, added through ADR-0137's own add-with-evidence rule; that ADR carries the full evidence
trail.

## Consequences

* \+ Native crayon lands at Safari parity (median 1.11% against a 1.11–1.17% web band) instead of
  2×, and the runtime that actually ships to children is no longer worse than the number its gate
  exception was argued from.
* \+ The retracted generalization is on record: "crayon cannot be merged" was true of Safari only. A
  future cost investigation starts from per-runtime measurements, not an inherited absolute.
* \+ Both granularities stay independently testable through the dependency seam, under a test runner
  that compiles only one of them into the shipped web bundle.
* − Two rendering paths now exist for one brush. Any change to crayon rasterization must be measured
  on **both** runtimes, and web-side visual verification no longer automatically vouches for native.
  Parity rests on the invariants above, the pinned tests, and the issue-1372 eyeball — a change that
  breaks the paper-anchored pattern phase or the idempotent wax contract silently reopens the visual
  question.
* − Unifying the branch is not a cleanup. Collapsing to either shape re-imposes a measured
  regression on the other runtime (per-move: 1.74% on the WKWebView; merged: 2.11% on Safari).
* − The perf evidence covers non-reversing sweep gestures only; pass splits are position-identical
  under merging by construction, and the visual check exercised them, but their *cost* under merging
  is unmeasured.
