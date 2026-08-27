# ADR-0147: Crayon Deposition Is a Per-Runtime Decision — Restamp on Web, Planes on Native

**Status:** Active — amends [ADR-0085](0085-tiled-live-canvas-for-ipad-webkit.md)'s crayon preview
architecture for the web build, extends [ADR-0146](0146-crayon-op-granularity-per-runtime.md)'s
per-runtime pattern to the deposition pipeline, and re-opens
[ADR-0137](0137-lost-frame-gate-exceptions.md)'s `ipad-device-web:crayon` exception for retirement
**Date:** 2026-08

## Context

ADR-0085 gave crayon two extra composited canvases per live tile: a bottom plane presented with
`mix-blend-mode: darken` and a top mirror at `1 − colorMix` opacity, so the browser's compositing of
(darken, then lerp) previewed the exact pixels the pass-close `crayonFlush` stamp would bake into
the normal tile. ADR-0137 then recorded crayon's residual iPad-Safari cost — 1.23% of in-contact
frame time against a 1% gate, after thirteen measured attempts — as a codified 1.5% exception,
explicitly "not a proof that no implementation can" close the gap. The candidate that ADR-0137 named
as never implemented was collapsing the two planes; the compositing cost of the planes themselves
was the one suspect no experiment had isolated.

The 2026-08-26 physical-iPad campaign
(`docs/scratchpad/perf/crayon-elimination-campaign-2026-08-26.md`, branch
`perf/crayon-campaign-notes-2026-08-26`) ran that isolation as a five-rung ablation from crayon back
to pen, then measured sixteen alternative implementations, three trusted-touch captures each. The
attribution was unambiguous:

* The composited planes are crayon's **entire** excess over pen. Direct-painting the full two-pass
  wax texture into the normal ink tiles measured 0.64% against pen's 0.76% — the texture ADR-0137
  presumed "inherently more expensive than a solid stroke" is free on this device.
* The plane topology is the mechanism, not the blend mode: a single uncovered mutating plane is
  catastrophic at `darken` (2.39%) and at `normal` (2.18%) alike; two stacked planes cost 1.2%; zero
  planes cost 0.6–0.9%.

Alternatives measured and rejected for the replacement (each survives as an `exp/crayon-*` branch):
batching restamps per frame or deferring the glaze to pass close (restamp cost scales with area —
2.62% and 2.18%); a single premixed preview plane (1.45%); incremental under-capture reading the
composited tile per op (froze the page outright at 97% lost — a per-op read of a composited canvas
forces a GPU pipeline sync); folding the glaze offscreen into the shadow (blend operations into a
canvas demote it as a blit source — 2.8%).

## Decision

**Crayon's deposition pipeline is decided per runtime, from the same compile-time `CAPACITOR=true`
signal as its op granularity (ADR-0146): the web build deposits by restamp; the Capacitor WKWebView
keeps ADR-0085's composited-plane pipeline.** The pipeline is injected through
`configureCrayonDeposition` in `web/src/lib/drawing/crayonPassBuffer.ts` — vitest pins
`__IS_CAPACITOR__` true and would dead-code-eliminate the web branch, and both pipelines stay pinned
by unit tests — and the engine configures it at module evaluation.

The per-runtime split is measured, not hedged. The same-day native A/B on the same physical iPad
priced the pipelines oppositely, the exact shape ADR-0146 found for op granularity:

| WKWebView crayon (portrait-light, 3 samples each) | lost frame time     |
| ------------------------------------------------- | ------------------- |
| plane pipeline (main)                             | 1.19 / 1.24 / 1.39% |
| restamp, merged ops cap 8                         | 1.76 / 1.92 / 2.08% |
| restamp, merged ops cap 3                         | 1.88 / 2.10 / 2.12% |
| restamp, per-move ops                             | 4.40 / 4.53 / 5.50% |

Safari's optimum (restamp) is the WKWebView's pessimum at every measured op shape, and vice versa —
on Safari the planes are the entire crayon excess. ADR-0146's granularity fork also stands
unchanged: per-move on the WKWebView is catastrophic under either pipeline.

**On the web build, the open crayon pass deposits directly onto the normal ink tiles; nothing extra
is composited while a child draws:**

* The pass accumulates on an offscreen buffer, and every op restores its own padded rect from an
  offscreen "under" shadow of the pre-pass pixels, then re-applies the two-blit subtractive glaze
  onto the tile. A pixel's latest restamp is the same pure function of (final buffer, under) the old
  close-time stamp applied once — later ops only repaint pixels inside their own padded rect, which
  is exactly the region they restamp — so live pixels always equal the pass-close glaze and
  `crayonFlush` only resets pass state.
* A pass opening on a **blank** tile (detected in `showTileForOp` while the tile is still hidden,
  after `prepareTileForMutation` has run) takes a byte-exact single-blit fast path: over blank paper
  the two-blit glaze collapses to exactly the wax, and no under shadow is needed.
* The under shadow is read from the composited tile **at most once per invalidation**, and the read
  is deferred to two frames after finger-lift (`finishGroupWhenCanvasIdle` in `engine.ts`) —
  Safari's `scheduleIdle` fallback demands an input-quiet window a fast scribbler never grants.
  Foreign ink, eraser, undo, clear, repaint, and a closed pass's own wax invalidate the shadow; a
  pass opening before the refresh pays one synchronous read as the fallback.
* The preview plane elements stay in the `LiveSurface` DOM contract but are vestigial: hidden all
  session, never given a backing (`realizedCrayonBackings` is pinned at 0 by
  `drawing-work-counters.spec.ts`). Removing the elements is a follow-up, not part of this decision.

Measured on the physical iPad (Safari, trusted XCUITest touch): crayon lost frame time 0.77–0.97%
against pen's 0.75% in the same session, both orientations — from a 1.11–1.35% baseline.

Three campaign-earned constraints bound any rework of this path:

1. **Never read a composited live canvas on the pointer hot path.** Per-op reads froze the page;
   even once-per-pass reads produced 50–79 ms worst paint frames.
2. **Restamp cost scales with area per frame, not blit count.** Per-op padded rects are the ceiling;
   frame unions and pass bounds were each measured a full point worse or more.
3. **Never apply blend operations into a canvas that hot-path blits read from.**

## Consequences

* \+ Crayon reaches pen parity on the lost-frame gate on the target this app is judged on, passing
  the flat 1% gate ADR-0137 exempted it from. The exception should be re-measured and retired at the
  next matrix recapture (ADR-0137's own ratchet-down rule).
* \+ 32 live canvases, the per-op mirror blit, per-op `hidden` writes, and the 16-tile flush stamps
  leave the hot path entirely; the checkpoint's role shrinks to bounding buffer memory and pass
  semantics.
* \+ Live pixels equal committed pixels by construction, which removes the plane-to-stamp rounding
  seam ADR-0068 documented and lets export composite tiles without stamping an open pass.
* − Worst paint frames run 46–63 ms against pen's 36 — over ADR-0085's 50 ms soft budget, under the
  67 ms hard fail. The recorded lead is the merged-op/segmented-stroke shape that measured 0.61%
  with a flat 35 ms max (`exp/crayon-i12-merged-direct`); until then this is a deliberate trade of a
  permanently failing lost-frame gate for a marginally exceeding paint-max tail.
* − Two deposition pipelines now exist for one brush, compounding ADR-0146's two-granularity cost:
  any change to crayon rasterization must be measured on BOTH runtimes, and web-side visual
  verification no longer vouches for native (or vice versa). Collapsing the fork in either direction
  re-imposes a measured regression on the other runtime.
* − The under shadow adds an invalidation protocol (foreign ink, undo, clear, repaint) that new
  pixel-mutating paths must join; a missed invalidation restores stale under-ink on the next
  overlapping pass. The pixel-contract E2E specs are the guard.
* − The vestigial plane elements and their CSS remain until the follow-up removal, and the two-plane
  preview description in ADR-0085 no longer matches production.
