# ADR-0065: Brush Modes — Per-Op Render Dispatch on the Single Renderer

**Status:** Active **Date:** 2026-07

## Context

Splotch shipped two ways to lay down ink: the **pen** (a solid stroke in the active color) and the
**magic brush** (reveals a coloring page's fill / a rainbow where the child paints, ADR-0043). We
want more brushes — starting with **crayon** (a waxy, grainy stroke) and **watercolor** (a soft,
translucent stroke that pools where it overlaps) — selected from a **brush-selector flyout** that
replaces the single magic-brush button in the Actions Panel.

The hard part is not the UI; it's the renderer. The drawing engine has a load-bearing invariant
(ADR-0033): **`renderOp()` is the single renderer every surface shares.** Live drawing, undo/resize
replay, and PNG export all paint each recorded op through the same function, which is what makes
undo bit-identical (verified strictly by `perf:units`: 0-pixel ink mismatch after a
rebuild-from-ops). A stroke is not one object at render time — it is a *sequence* of ops (one `dot`
at the start, one `path` op per pointermove frame) sharing a `pid` and style, each rendered
immediately and independently. Commit-time simplification (ADR-0036) then rewrites those ops to
fewer segments, and long commands collapse into keyframe rasters (ADR-0035).

Two of the new brushes want effects at a granularity the model doesn't natively expose:

* **Crayon** wants texture. Texture is spatial — a grain lattice anchored in canvas space — so
  adjacent path ops sample the same lattice and there is no seam. This composes per-op.
* **Watercolor** wants translucency + soft edges + buildup. True stroke-uniform translucency is the
  problem: `globalAlpha < 1` with `source-over` **double-darkens every overlap**, and consecutive
  path ops overlap at their shared endpoints — so a single "translucent stroke" rendered as many
  translucent sub-segments comes out lumpy at every join. Uniform translucency wants the *whole
  stroke* composited at once, which the per-op model does not hand the renderer.

We evaluated three architectures for reconciling richer brushes with the single-renderer invariant.

### Option A — Per-op self-contained rendering (chosen)

Store `brush: BrushKind` on every op; `renderOp()` dispatches on it. Each brush renders its op
alone, as a pure function of the op's stored fields plus the target's current pixels — using per-op
`globalAlpha`, blend mode, a spatially-anchored `CanvasPattern`, or geometry derived
deterministically from the op. No cross-op state.

* **Pros:** Zero change to undo/replay/export/keyframe/simplify — they already loop over ops through
  `renderOp`, so a crayon or watercolor stroke replays for free and stays bit-identical. Cheapest,
  lowest-risk. The magic brush is the existing proof this works (it's just another `brush` value).
* **Cons:** Cannot do true whole-stroke alpha. Watercolor translucency must be *approximated* per-op
  in a way that tolerates within-stroke overlap (e.g. `multiply` at moderate alpha so overlaps pool
  gently — which reads as "wet paint," desirable for a toddler brush — rather than a uniform wash;
  or a near-opaque soft-edged stroke). Any randomness (grain, blotches) MUST be hashed from op
  geometry, never `Math.random()`, or a rebuild diverges from what the child drew.

### Option B — Per-stroke offscreen accumulation buffer

Give a translucent stroke its own offscreen canvas: stroke each op into the buffer at full alpha (so
within-stroke overlaps don't build), then composite `buffer × alpha` onto the visible canvas. Replay
must group a command's ops per stroke and render each through a scratch buffer to match.

* **Pros:** Correct stroke-uniform translucency, correct soft wet edges, correct cross-stroke
  buildup.
* **Cons:** Breaks "one op → immediate paint." `renderOp` alone is no longer sufficient; replay
  needs a stroke-grouping pass and a scratch surface, and the live incremental path must produce
  identical pixels to that buffered replay. Extra per-frame blit + memory. A real option *only if*
  Option A's quality proves insufficient — measured per brush, not assumed.

### Option C — Commit-time bake / deferred rasterization

Render the brush cheaply/approximately live, then at commit bake the whole simplified stroke
properly (Option B style) into a raster and store that instead of replayable ops; replay just blits.

* **Pros:** Live hot path stays cheap regardless of brush cost; replay is a blit.
* **Cons:** Live ≠ committed appearance (a visible "snap" at stroke end) and it **breaks
  bit-identity by design**, fighting the `perf:units` invariant. Most raster memory, highest risk.
  Reserved for a brush too expensive to ever replay per-op — neither crayon nor watercolor is.

## Decision

Adopt **Option A** as the brush architecture, and pick each brush's concrete rendering empirically.

1. **`brush: BrushKind` on the op** (`'pen' | 'magic' | 'crayon' | 'watercolor'`), replacing the old
   `magic` boolean. The eraser stays an orthogonal modifier (`erase`), not a brush. `renderOp()`
   dispatches: erase → destination-out; `magic` → sheet pattern (unchanged); `crayon`/`watercolor` →
   `renderBrushOp()` in `brushRender.ts`; else the solid pen. Every surface shares this dispatch, so
   the invariant holds by construction.

2. **`brushRender.ts` owns the textured brushes**, isolated and independently testable. Each brush
   exposes numbered **variants**; a dev seam (`setBrushVariant`, mirroring `setSimplifyParams`) pins
   the active one so a **single production build renders every candidate**. `perf:brush`
   (`scripts/perf/brush-bench.mjs`) drives `/dev/engine` through a fixed battery (long squiggles, an
   overlapping cluster, short dashes) per variant and reports draw cost (total/avg/max
   `engine.draw`), rebuild cost (one `undo` replay), opaque-pixel count, and a screenshot — the same
   one-build-sweeps-all shape as `perf:sweep`.

3. **Determinism is the correctness gate.** A brush renderer reads only the op's fields and the
   target pixels; texture/blotch variation is hashed from op geometry. This preserves bit-identical
   undo (`perf:units`) without those tests needing to know about brushes.

The per-brush winners (crayon, then watercolor) are chosen from their implemented variants using
`perf:brush` + visual review, and recorded as follow-ups to this ADR. If a brush's Option-A quality
ceiling is unacceptable, Option B is revisited **for that brush only** — but the default, and the
bar every brush is measured against first, is per-op self-contained rendering.

## Consequences

* New brushes are additive: a `BrushKind` value + a renderer in `brushRender.ts`, no engine surgery.
  Undo/resize/export/keyframe/simplify need no per-brush awareness.
* The brush is **persisted** (`splotch-brush`) and remembered across reloads; picking a color keeps
  a color-using brush (pen/crayon/watercolor) but leaves the magic brush — which ignores color — for
  the pen. The eraser remembers the brush underneath it.
* The magic brush lost nothing: it is now one `brush` value among several, rendered by the same
  sheet pattern as before (its E2E coverage is unchanged in behavior, only routed through the
  flyout).
* The ceiling of Option A is real: watercolor cannot be a mathematically-uniform translucent wash.
  For a toddler brush we judge gentle overlap-pooling a feature, not a defect; if that ever proves
  wrong, Option B is the escape hatch, scoped to the one brush that needs it.
* `perf:brush` is a reusable A/B harness for any future brush, keeping brush work measured rather
  than vibes-based.

## Follow-up: brush winners

Each brush's variants live in `brushRender.ts` behind the dev seam; the shipped default is the one
picked below via `perf:brush` (4× CPU throttle) + visual review.

* **Crayon → v12 "wax body, tooth holes"** (an opaque wax body with a canvas-anchored, seed-phased
  paper-tooth mask bitten out of it in a small per-op offscreen buffer, blitted source-over). ~1.1
  ms avg / 5 ms max draw, ~185 ms undo for a heavy battery under 4× throttle (a small-bbox blit per
  op, not a full-canvas one; the keyframe safety net (ADR-0035) bounds undo on large drawings).
  Because holes only ever REMOVE from the body, nothing exists outside the stroke outline — the edge
  frays into connected tooth-sized bites (never a spray of loose dots) and the interior shows fine
  grain. v2–v12 were an **adversarial design iteration** (see next section): the first shipped grain
  (**v2 "jittered multi-pass"**) drew user complaints — periodic beads at op joints and a blurry,
  non-waxy edge — and its successors (v3–v11, incl. the once-shipped v11 stamp field) drew a further
  round — "too gritty, a starburst past the path, and buildup that snaps in dark on lift" — which
  drove the final redesign.

* **Watercolor → v3 "feathered wet edge"** (concentric translucent bands from a wide faint halo to a
  narrow core — a cheap deterministic gaussian). ~0.06 ms avg / 1.0 ms max draw, ~27 ms undo — the
  cheapest of the four. It keeps the picked colour with a soft translucent edge and gentle
  overlap-pooling. Rejected: **v2 "multiply wash"** (two `multiply` passes) pooled harder but
  `multiply`-against-itself dragged a single blue stroke toward navy — bad when a toddler picks a
  colour and expects it back; **v4 "blurred soft stamp"** (offscreen `shadowBlur` — deliberately not
  `ctx.filter`, which the iOS 16.4 floor lacks until Safari 17) gave the most diffuse edge but was
  30–40× slower (3.4 ms avg draw, an 84 ms jank frame, ~330 ms undo), the same offscreen-per-op cost
  that sank an early crayon variant. A per-op approximation with gentle pooling is the right call
  for a toddler brush.

## Follow-up: crayon redesign (adversarial iteration) + wax buildup

The first crayon (v2) shipped, then drew complaints: **"little round dots at particular intervals"**
and **"the texture looks blurry, not crayon-like."** The dots were per-op round-cap beads from
offsetting whole passes; the blur was the soft translucent feather. Fixing this ran as a loop of
**designer subagents → adversarial critic subagents** (several rounds):

* **The tiling trap.** Cheap grain via a *visible* repeating `CanvasPattern` of chunky marks
  (v5/v9/v10) is inherently periodic: a critic's autocorrelation found a clean harmonic ladder at
  the tile size (v9 ~0.21 at 96 px; v10, which naïvely overlaid two coprime tiles, was *worse* at
  ~0.55/87 px — overlaying tiles does not cancel each tile's own period). Any short repeat of a
  chunky mark is the same family as the "periodic dots" complaint. (A *fine* paper-tooth mask that
  is smaller than the grain the eye resolves, sampled at canvas coordinates, is a different case —
  see v12 below.)
* **v11 "coarse position-hashed wax"** (once shipped) abandoned tiling for per-position hashing, but
  as an **additive stamp field** it drew a next round of feedback: **"too gritty, an almost
  starburst pattern that extends beyond the stroke path,"** and a buildup (then per-command
  `multiply`) that **"snaps in after the stroke finishes, all at once and much darker"** instead of
  gently filling paper grain. Additive dots scattered around a thin core inevitably read as an
  airbrush spray, and the multiply settle-on-lift was the visible snap.

**The reference/judge harness.** To break the subjective loop, we generated real-crayon reference
images with the Gemini image model (`gemini-2.5-flash-image`) — a single stroke, a same-colour
overlap, a scribble — and used a vision model (`gemini-2.5-flash`) as an automated adversarial judge
scoring each render against them (waxy / grain / containment / buildup). The judge is harsh and
unreliable on absolute realism (it anchors on a macro photo, and its buildup detection is weak), but
one axis — **containment** — tracked the real regression cleanly (2 → 7 as the spray was fixed), and
the references made the target look concrete. Final calls were made by direct visual comparison, not
the judge's score. The lab lives outside the app (git-excluded) and is not shipped.

* **The winner (v12 "wax body, tooth holes").** Instead of adding dots, draw a **solid opaque wax
  body** and **bite paper-tooth holes out of it** (`destination-out`) in a small per-op offscreen
  bbox, then blit source-over. Holes only remove, so nothing exists outside the stroke — the edge
  frays into connected tooth-sized bites (no spray), the interior shows fine grain, and a subtle
  colour-independent black/white mottle (`source-atop`) adds waxy pigment density. The tooth mask is
  a baked clumped value-noise texture sampled at *canvas* coordinates so it is continuous across a
  stroke's per-frame ops.

**Wax buildup — coverage, not multiply.** The follow-on request was that a *new* crayon stroke over
existing crayon should keep darkening — but the corrected spec is that redrawing "does little to
change the actual colour and more to fill in the paper grain in new locations." v12 delivers exactly
that with **pure per-op Option A — no multiply, buffer-settle, or raster cache:**

* Every op carries a per-stroke **`seed`** (stamped by the engine, constant across one gesture,
  preserved through simplification). The tooth mask is **phased by the seed**, so:
  * within one stroke every op shares the seed → the same holes land in the same canvas places →
    overlapping per-frame ops are idempotent (opaque body over opaque body): **no joint beads, and
    bit-identical replay** (`perf:units` still 0-px);
  * a **later** stroke has a different seed → its wax covers the holes the first pass left → the
    overlap **fills toward solid at the same hue**. The body is opaque `op.color`, so overlap never
    darkens past it — coverage buildup, not pigment multiply.
* It is **live and gradual** (each op composites immediately as the finger moves) — there is no
  settle-on-lift snap, and no darker-than-the-crayon artefact. Undo/resize/export need no per-brush
  awareness: they already loop `renderOp` over the stored ops, which reproduce the same seed-phased
  holes. This removed the previous `commandIsBuildup` / `bakeBuildupRaster` / `renderCommand` /
  snapshot-settle machinery entirely — buildup is now a property of the renderer, not the history.
* The one inherent trade-off of per-op state-free rendering: buildup needs *separate* strokes (a new
  seed). A single continuous back-and-forth scribble reuses one seed, so it fills its area but its
  self-overlaps stay idempotent (which is what keeps a smooth stroke bead-free — the same property,
  seen from the other side).
