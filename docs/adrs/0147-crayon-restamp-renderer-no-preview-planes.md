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
keeps ADR-0085's composited-plane pipeline.**

A third pipeline — DEFERRED STAMP — was built and measured for native, and **rejected on
appearance** (2026-08-27). It is documented here because its measurements stand and its rejection is
the decision: a 4× lost-frame improvement was available on native and was declined, so the next
person to find that headroom knows it has already been spent against a visual cost and what that
cost looked like.

The rejected deferred pipeline worked like this: the live preview is the opaque wax pattern-stroked
directly onto the normal ink tile; the pass accumulates in parallel on an offscreen buffer; the
under shadow seeds from the undo system's own pre-command tile snapshot (crayon adds zero
composited-tile reads — blank commands capture no patch and are exactly the virgin passes needing no
under); `crayonFlush` ops carry a `final` flag, so checkpoints and scribble splits are pure seed
boundaries and only the closing flush stamps the glaze — two frames after the lift, off the
in-contact window, followed by a one-pixel readback. Direct `flushCrayonBuffer` calls (export, a
foreign op compositing over the open pass) close synchronously; offscreen targets and repaint
replays bypass the deferral; and any reset that replaces the tile's pixels (undo patch restore,
clear, repaint) cancels a stamp still pending, because a closed-but-unstamped pass is precisely the
state the `dirty` flag no longer marks.

**The readback's effect is measured; its mechanism is not.** Without it the same build costs 1.7%
and with it 0.37%, and the cost lands on the *next* stroke's undo capture rather than on the stamp.
The explanation — that WebKit defers the stamp's canvas work until something forces a flush, and
that a read is what forces it — is a hypothesis consistent with those timings. A 75-second Time
Profiler capture over a 19-stroke native session (recorded in PR 1414's review) showed App,
WebContent, GPU, remote-image-buffer and generic flush stacks, but no sampled readback frame tying
the 1-px call to the next capture. Treat the workaround as empirically justified and mechanistically
unexplained; its durability across WebKit versions rests on the part that is not established.

Native trial ladder (physical iPad, trusted XCUITest touch): planes 1.24% lost → deferred with
pass-open tile reads 2.8 → stroke-cadence 3.0 → post-lift stamp unflushed 3.5 → patch-shared under
1.7 → plus forced flush **0.20–0.46% against a 0.01–0.05% native pen floor** (portrait 0.30–0.46
over three samples, landscape 0.20–0.33 over four). These are **same-instrument comparative**
numbers, not release-gate scores: [ADR-0144](0144-coalescing-is-a-witness-not-a-check.md) retired
`ios-capacitor-webview`'s last uncalibrated check — every capture here records `passed: true`,
`uncalibrated: []`, coalescing not applicable — so the limitation is gate class (the matrix reserves
the calibrated release gate for Safari), not a calibration gap. Three WKWebView rules earned:
pattern strokes and detached-canvas work are free while any tile-involving blit at pass cadence
costs ~1.4 points; a composited-tile read is priced by the unflushed work before it; the undo
snapshot is a free under source.

**The visual gate is what rejected it.** Automation measured the win and could not see the cost; a
person drawing on the device could, immediately. On 2026-08-27 the deferred build was installed on
the physical iPad alongside Safari running the restamp pipeline as a live control, and the verdict
was that the colour **visibly shifts when the stroke lands — bright wax darkening toward the
background** — which reads as a glitch rather than as ink drying. That is disqualifying for a
drawing app aimed at two-year-olds, whatever the frame numbers say.

The concession, as designed: over existing ink the live preview is unmixed opaque wax and the exact
glaze appears at the post-lift stamp; over blank paper — the dominant toddler case — pixels are
byte-exact throughout. Automation cannot close this, and the campaign's own history says why: its
broken blank renderer scored 0.00% with passing input fidelity. A person must draw on the device and
judge the over-ink behaviour (blue over yellow, and a long stroke crossing a wax checkpoint) before
this pipeline is activated. Until that sign-off exists the plane pipeline remains native's default;
the deferred pipeline lands behind the `configureCrayonDeposition` seam as measured, unit-tested,
inactive code.

**Unmet productization condition, recorded rather than inherited:**
[ADR-0085](0085-tiled-live-canvas-for-ipad-webkit.md) requires its repeated live-surface grid sweep
to be re-run after any renderer or brush-buffer change, and this decision is both. The 4×4 grid was
selected when every tile carried three live canvases and crayon mutated two of them per op; both
pipelines here delete that hot-path cost, so the old 2×1/3×1/2×2/4×4 ordering does not establish the
optimum under restamp or deferred deposition. The grid is carried forward **unverified** for these
pipelines. Re-run that sweep before treating either topology as settled.

The original decision text below records the state this amendment supersedes. The pipeline is
injected through `configureCrayonDeposition` in `web/src/lib/drawing/crayonPassBuffer.ts` — vitest
pins `__IS_CAPACITOR__` true and would dead-code-eliminate the web branch, and both pipelines stay
pinned by unit tests — and the engine configures it at module evaluation.

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

Measured on the physical iPad (Safari, trusted XCUITest touch), **as corrected on 2026-08-27**:
crayon lost frame time 0.83 / 0.88 / 0.77% portrait against a same-session pen control of 0.81% —
parity — and 0.97 / 0.98 / 1.06% landscape, from a 1.11–1.35% baseline. The original text read
"0.77–0.97%, both orientations", which rested on a two-sample landscape arm below the campaign
runbook's own three-sample minimum. Taking the third sample both exposed a regression that had
already merged (fixed in PR 1423) and moved landscape to *at* the 1% gate rather than under it.

Three campaign-earned constraints bound any rework of this path:

1. **Never read a composited live canvas on the pointer hot path.** Per-op reads froze the page;
   even once-per-pass reads produced 50–79 ms worst paint frames.
2. **Restamp cost scales with area per frame, not blit count.** Per-op padded rects are the ceiling;
   frame unions and pass bounds were each measured a full point worse or more.
3. **Never apply blend operations into a canvas that hot-path blits read from.**

## Consequences

* \+ **Native keeps a pipeline whose appearance is known-good**, at a measured cost: the deferred
  alternative was 1.24% → 0.20–0.46% (roughly 4×, against a 0.01–0.05% pen floor) and was declined
  because the glaze arriving after the stroke reads as a colour glitch.
* − **The native win is unclaimed, not unavailable.** Closing it needs a deposition that is cheap on
  the WKWebView *and* mixes live. Every measured way of mixing live there runs through the
  operations that runtime charges ~1.4 points for — which is why the plane pipeline exists. A future
  attempt should treat "live-accurate preview" as the hard constraint and the frame budget as the
  variable, which is the opposite of how this campaign was run.
* \+ Crayon reaches pen parity in portrait on the target this app is judged on. Landscape is
  restored but sits at ~0.97–1.06%, so **ADR-0137's 1.5% exception stays in force and must not be
  retired on this evidence** — the earlier revision of this ADR recommended retiring it, on the
  two-sample landscape arm since withdrawn. The landscape residual is unresolved: shadow-read count,
  restamp count and the paper transform were each excluded; restamp area measured nearly equal by
  geometry (+3.6%) but is **not** excluded, since this campaign's own i2 result shows restamp area
  can behave non-linearly on device.
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
