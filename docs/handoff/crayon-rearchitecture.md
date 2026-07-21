# Handoff — crayon re-architecture, steps 2–4 (soft-alpha dabs + deepening)

> 2026-07-21 · branch `claude/crayon-architecture-redesign-r74oal` · Step 1 (blit-commit) landed and
> verified; next is the soft-alpha dab deposit prototype (steps 2–4 of the accepted post-ADR-0066
> redesign), then profiling and the ADR amending 0065.

## Objective & non-goals

**Objective:** finish the crayon redesign the previous packet proposed. Step 1 freed the constraint
— the commit fold no longer re-renders crayon ops, so fractional alpha and nondeterministic grain
are now legal. Steps remaining: (2) soft-alpha dab-stamp tooth, (3) darkened-sprite deposit
deepening with a convergent `deepen` floor, (4) directional dabs + low-frequency blotch field. Each
A/B-able behind `setCrayonParams`, judged by eye against
`artifacts/crayon-brush-samples/vs-current.html`; then a `profiling`-skill brush-perf run and
`/create-adr` amending ADR-0065.

**Non-goals:** no WebGL/WebGPU; no change to undo/eraser/export machinery; no kid-facing crayon
button; no change to magic brush or pen; do **not** redo or rework step 1 (landed, byte-verified).

## The accepted design (steps 2–4, from the consumed proposal)

* **Dab stamps replace pattern-filled path ops**: soft-alpha sprites along the polyline, spacing ~⅓
  stroke width, sprites baked from the existing value-noise fields in `crayonBrush.ts`.
* **The alpha ramp IS the deepening ramp**: dab rgb = crayon colour darkened ~10 %, at low alpha
  (~0.15). A grazing pass reads as translucent tint; overlap within a stroke accumulates opacity
  toward the darker sprite colour (mid-stroke deepening with no pass split); a second stroke
  re-accumulates over stamped wax, kept convergent by the darken-min stamp.
* **Optional `deepen` knob** `min(S, k·D)` in the stamp: bounded darkening floor with fixed point
  `(1−m)·c / (1−m·k)` — can never compound into mud. Wire it into the *stamp*, not just the dab.
* **Texture upgrades now legal**: rotate/stretch dabs to the path tangent (directional streaks);
  modulate dab alpha by a low-frequency blotch field (pressure blotches); soft sprite edges;
  `Math.random` sprite-variant jitter (no stored seeds).
* Keep unchanged: `CrayonPassTracker` (mix-stamp granularity), the darken-min two-blit stamp, the
  two overlay canvases + `isolation: isolate` preview, warm-tiles→warm-sprites, all
  undo/eraser/resize/export machinery.

## State

Branch pushed, no PR. Handoff branch of the prior packet was merged to main via PR #449 (evidence
base + comparison sheet are in main).

| sha       | what                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| `3ff1a35` | Consumed the previous handoff packet                                                                       |
| `1cd6691` | Step 1: closed crayon passes travel as `crayonPassRaster` ops; fold/repaint/export blit them; E2E-verified |

Files touched: `web/src/lib/drawing/strokeOps.ts` (op type, live paper-space accumulation,
`closeLiveCrayonPass`, `resetLiveCrayonPass`, raster stamp case in `renderOp`),
`web/src/lib/drawing/undoHistory.ts` (`replaceOpenCrayonPassOps`, `activeCrayonRasterRects`,
`blitPaperRect`), `web/src/lib/drawing/engine.ts` (`recordCrayonFlush`, commit-time reconcile in
`commitStrokeGroup`, `setCrayonPaperSpace` wiring, clear drops the open pass),
`web/src/lib/drawing/undoHistory.test.ts` (+2 unit tests).

## Decisions made (and why)

* **Closed passes travel as ops (`crayonPassRaster`), not as mid-stroke paper stamps.** Stamping
  into the paper at pass close would have moved the undo snapshot to pre-stroke and broken
  clear-straddle/undo-mid-stroke/deferred-restore semantics. Keeping ONE op stream means fold,
  repaints, snapshot pending-replay, and export all stay a single `renderOp` walk with ordering
  preserved by construction.
* **Commit reconciles the visible canvas from the paper** (`blitPaperRect` per raster rect in
  `commitStrokeGroup`). Empirically pinned: the two-blit stamp rounds ±1 differently for the
  overlay's device-rect blit vs the cropped raster (canvas-backing-dependent premultiplied rounding)
  even on byte-identical content — verified with an in-page A/B (overlay-stamp == live, raster-stamp
  == paper, each internally deterministic, ±1 apart on ~4 % of pixels). Reconcile makes screen ==
  committed from commit onward, keeping the undo/remount byte-exact E2E guards green. Skipped when
  the fold is parked (pending magic sheet / deferred restore).
* **Live preview still paints ops into the overlays** (unchanged pixels, margin ink included); the
  paper-space buffer is a third per-op paint. The blit-from-buffer preview was deliberately deferred
  to step 2, where fractional alpha forces it anyway (see risks).
* **`colorMix: 0` keeps the legacy direct-paint pipeline** as the dev A/B baseline — no raster, raw
  ops, deterministic fold.
* **Clear also drops the open pass's buffered ink** (`resetLiveCrayonPass` in `clearCanvas`) — a
  stroke straddling drag-to-clear must not resurrect wiped wax through its pass raster (was a
  transient-ghost bug pre-change; would have been a committed-pixels bug post-change).
* **ADR deferred** until after step 3, per the accepted plan ("amend 0065 with whichever
  architecture wins" after measuring).

## Unverified assumptions

* The darkened-sprite accumulation model produces the reference look — still derived on paper, never
  rendered. Steps 2/3 prototypes must be judged by eye against `vs-current.html` scenes.
* Dab stamping cost ≈ current pattern-stroke cost — argued, not measured. Run the `profiling`
  skill's brush-perf harness (4× throttle) before/after.
* Under a rotation-locked paper view (ADR-0050), the commit reconcile blit resamples paper→screen
  and the raster stamp resamples on repaint — believed equivalent to today's next-repaint behavior,
  not byte-tested (the E2E byte guards all run at identity view).
* A deferred commit (restore in flight / magic pending) skips the reconcile; the eventual fold's
  next repaint is assumed to heal the ±1 divergence. Not byte-tested.
* `engine.spec.ts` constant-hue and spatial-stability guards can be re-bounded for step 3's bounded
  deepening without losing regression value.

## Done & verified

* `npm run check` clean; `npm run test:unit` 427/427 (2 new); engine E2E 59/59 including the
  remount/undo byte-exactness, constant-hue, mix, and dark-mode overlay guards; full `npm test`
  green (one unrelated flows.spec coloring-dialog test was flaky, passed on isolated rerun).
* Zero-visual-change pinned honestly: built the pre-change code (stash) and the step-1 code in the
  same container/Chromium, ran `capture-current.mjs` against both, raw-pixel-diffed all nine scenes:
  **max channel Δ = 3/255** (mean ≤ 0.31) — pure stamp rounding. Capture runs are bit-deterministic
  run-to-run (verified with a double run). Fresh step-1 captures left in gitignored
  `screenshots/crayon-current/`.
* Note: diffing fresh captures against the base64 images inside the *committed* `vs-current.html`
  overstates (maxΔ ~38) — cross-session Chromium drift + lossy webp re-encode. Always rebuild the
  "before" in-container as above.

## Risks & next 3 steps

Risks: **step 2's fractional alpha breaks two idempotence assumptions step 1 still leans on** — (a)
per-op painting into the two overlays double-composites wherever consecutive ops of one pass overlap
(fine today only because alpha is binary): the open-pass preview must become clear-rect + dirty-rect
`drawImage`s of the paper-space buffer through the view transform (the design's intended end state;
test the rotation-locked case); (b) repaint replay of open-pass ops re-accumulates into the
paper-space buffer — clear its dirty rect before replay, and accept that a nondeterministic open
pass re-rolls its texture on a mid-stroke resize (closed passes are rasters, immune). Also: WebKit
compositing of many small `drawImage` dabs is unmeasured (ADR-0066 device gates still open on PR
442), and soft-alpha deepening can overshoot — wire the convergent floor into the stamp.

1. **Step 2 prototype behind `setCrayonParams`:** dab-sprite deposit (soft alpha ~0.15, rgb darkened
   ~10 %, spacing ~⅓ width) replacing pattern path ops on the buffered (mix>0) path; move the
   open-pass preview to buffer blits (risk (a)); A/B vs `CRAYON_DEFAULTS` in `/dev/engine`.
2. **Step 3: deepening** — verify stroke-over-stroke and mid-stroke deepening converge (the `deepen`
   knob's fixed point), re-run `capture-current.mjs` + `build-compare-sheet.mjs`, judge by eye
   against the references; re-bound the constant-hue/spatial-stability E2E guards.
3. **Measure + document:** `profiling` skill brush-perf run before/after; `/create-adr` amending
   ADR-0065 with the winning architecture (step 1's blit-commit is ADR-worthy regardless).

## Reread first

* `web/src/lib/drawing/strokeOps.ts` — module header + "Live paper-space pass accumulation" section
  * the `crayonPassRaster` case in `renderOp` (the step-1 architecture in full).
* `web/src/lib/drawing/engine.ts:129-148` (`recordCrayonFlush`) and `commitStrokeGroup` (reconcile
  blits); `web/src/lib/drawing/undoHistory.ts` (`replaceOpenCrayonPassOps`, `blitPaperRect`).
* `web/src/lib/drawing/crayonBrush.ts` — the value-noise fields the dab sprites bake from;
  `CrayonPassTracker` stays.
* `docs/adrs/0065-crayon-brush-textured-wax.md`, `docs/adrs/0066-snapshot-undo-reinstated.md`.
* `artifacts/crayon-brush-samples/vs-current.html` — the acceptance record;
  `tools/asset-gen/crayon-brush-samples/README.md` — the capture/compare runbook (production build +
  `PUBLIC_ENABLE_DEV_HARNESS=true npm run preview`; vite dev 500s on `/dev/engine`).
* Skills: `profiling` (brush-perf harness), `adrs`, `create-adr`.
