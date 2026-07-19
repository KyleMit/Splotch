# ADR-0065: Crayon Brush Uses Swept Deposition Geometry

**Status:** Active **Date:** 2026-07

## Context

A translucent crayon brush exposes a distinction the opaque pen can ignore: adjacent pointer-frame
segments are one physical pass, while a later traversal through the same paper is another pass.
Drawing every pointer batch as a round-capped Canvas stroke deposits twice at each internal cap and
creates a row of darker beads. Flattening all live geometry during command simplification has the
opposite failure: it changes how many translucent deposits replay and makes surviving strokes fade
or shift after undo.

Thirty-three experiments explored continuous and binary texture fields, body-plus-texture layers,
and explicit buildup state. The strongest results used the selected RGB with continuous alpha tooth.
Binary masks looked static, permanent holes could never fill, and counters based on time, gesture,
distance, or bounding-box overlap did not represent real paper traversal. Full-canvas buildup masks
could distinguish traversals but were too expensive for the pointer hot path.

## Decision

The crayon is an ordinary stored `crayon` op rendered through the shared command-replay renderer in
`web/src/lib/drawing/strokeOps.ts`. Its paint and geometry live in
`web/src/lib/drawing/crayonBrush.ts`:

* Paint is the exact selected RGB with a deterministic, seamless 256-pixel paper-coordinate height
  field mapped continuously to alpha. Its small nonzero valley allows enough repeated passes to fill
  all tooth; no phase, time, random, or mutable render-order state is involved. Tinted tiles are
  cached by color, patterns by target context, and the active color is warmed outside pointer moves.
* Geometry is a deterministically resampled centerline tessellated into swept polygons. Consecutive
  segments share bisected join edges and therefore deposit once. A real reversal starts a new pass;
  non-adjacent polygons that cross are filled separately and source-over again. Only the physical
  start and end receive caps, and a tap is one tip disk.
* The exact polygons used for live rendering are stored on the op. Replay, resize, keyframes, and
  PNG export call the same `renderOp` path with the same fixed paper pattern. Crayon ops bypass the
  path-only generic simplifier because translucent deposition is not idempotent; polygon count still
  participates in ADR-0035's keyframe threshold so pathological gestures remain bounded.

Focused pixel tests require containment, same-hue buildup for separate and continuous overdraw,
straight-path event-rate invariance without historical endpoint beads, and exact pixels after
replay, resize, export, and a forced keyframe. A production Chromium probe at 4× CPU throttle
measured 120 crayon pointer moves at 0.033 ms average, 0.2 ms p95, and 1.0 ms maximum after texture
warmup. These are synthetic harness numbers, not a substitute for real-device Safari profiling.

## Consequences

* **\+** Adjacent implementation segments no longer masquerade as wax buildup, while a true
  backtrack or crossing becomes denser live without changing hue.
* **\+** Grain remains within the swept shape and all pixels are deterministic under the existing
  single-renderer replay model.
* **\+** The brush adds no full-canvas scratch mask or per-move texture generation to the hot path.
* **−** Crayon commands retain more raw geometry than simplified pen commands until ADR-0035 folds
  an extreme command into a keyframe.
* **−** The alpha transfer and fixed phase are intentionally tunable visual choices; changing them
  requires direct comparison against the committed crayon references and replay/performance
  revalidation.
* **−** A sharp reversal is represented as two capped physical passes. This preserves buildup at
  backtracking cusps but makes reversal treatment part of the replay contract rather than a generic
  Canvas join setting.
