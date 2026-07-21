# ADR-0065: Crayon Brush — Textured Wax via Phase-Shifted Paper-Tooth Pattern Ops

**Status:** Active — amended by ADR-0066 (2026-07): snapshot undo replaced command replay, so the
replay-determinism contract this ADR was built under narrows to "the commit fold must reproduce the
live pixels." The RDP-bypass carve-out and the replay-cost consequence are moot (simplification and
keyframing are deleted); the binary tooth is still required for intra-pass idempotence on the pass
buffer, but the replay-era constraints against soft fractional-alpha tooth, per-stroke composited
layers, and nondeterministic grain are lifted. **Date:** 2026-07

## Context

Splotch is a drawing app for toddlers, and the free-draw stroke was a flat, solid, anti-aliased line
— a clean marker, not the wax crayon a child actually holds. We wanted a **crayon** brush that
convincingly reads as wax on textured paper and, crucially, **behaves** like wax: drawing over an
existing same-colour mark should keep building up — filling the paper tooth and getting denser —
**without shifting or darkening the hue**.

The hard requirements (and the traps to avoid):

* **Reads as waxy crayon on paper**: a dense body with fine paper-tooth texture, not a flat fill,
  not gritty digital noise, not a blurry soft edge — wax has a broken but crisp edge.
* **Grain contained to the stroke**: nothing sprays, speckles, or starbursts past the path.
* **Wax buildup at constant hue** (the behaviour we cared most about): a second same-colour pass
  fills tooth the first left bare and gets denser, but **must not** multiply-darken or muddy the
  colour. Redrawing twice should change the colour little and fill the tooth a lot.
* **Buildup is live and gradual**: it happens continuously *while* the second stroke is drawn, never
  as a sudden snap after the stroke finishes.
* **Rides the existing single-renderer model** (ADR-0033): undo, resize, PNG export, and remount all
  replay the stored ops through one `renderOp`, so the brush must be **bit-identical on replay** and
  **deterministic** — no `Math.random`/time at render (the 0-pixel-drift invariant in
  `engine.spec.ts` must stay green).
* **Cheap on the hot path** (ADR-0032/0036): under the 4× CPU-throttle brush-perf setting, average
  per-op draw ≲ 2 ms and no single op > ~8 ms.

The obvious idea — draw a solid stroke and overlay `Math.random` speckle — fails almost every line:
it's non-deterministic (breaks replay), the noise reads as digital grit, and a semi-transparent
speckle multiply-darkens on overlap instead of building up at constant hue.

## Decision

A crayon stroke is an **ordinary op in the existing command log** (ADR-0033, exactly like the magic
brush in ADR-0043), flagged `crayon` and carrying a stored integer `seed`. Its paint is a
**repeating `CanvasPattern` of the stroke colour at a paper-tooth alpha**, not a solid colour.
`renderOp` fills the op's shape with that pattern; everything else is unchanged.

Three properties, owned by `lib/drawing/crayonBrush.ts`, deliver the look and the wax behaviour:

1. **The tooth is the fill's alpha, so grain is contained by construction.** A single deterministic
   paper-tooth **height field** — a tileable sum of fine value-noise octaves, generated once from a
   fixed PRNG seed at module load — is thresholded per stroke into an opaque wax **body** punched by
   fine **pits** where paper shows through. The threshold decision is **binary** (a texel is opaque
   bump or bare pit, never a grey in between — see property 2 for why); a fixed per-texel
   ordered-dither field jitters the threshold within a narrow band so the pit rims *stipple* rather
   than alias into hard dots, keeping the crisp-but-broken wax edge without any fractional alpha.
   Because this is the op's own fill alpha, the grain can only ever exist *inside* the stroke the
   finger drew. Nothing sprays past the path.

2. **Deterministic *and op-count-independent*, so replay is bit-identical.** The height field is
   fixed; the only per-stroke variation is the stored `seed`, which merely **phase-shifts** the same
   field. `renderOp` sets the pattern's transform to a paper-anchored translate derived from the
   seed (the same paper-coordinate anchoring the magic sheet uses so live drawing and every replay
   surface tile it identically). But a fixed field and stored seed are **not sufficient** on their
   own: a crayon stroke is drawn live as *dozens* of overlapping per-frame ops, then replayed (undo,
   resize, export) as a *few* simplified ones (ADR-0036), and `source-over` only reproduces the same
   pixels under a different op count when **every alpha is 0 or 1** — fractional alpha accumulates
   on overlap (`a → a + a(1−a)`), so a soft tooth renders *denser* live than on replay and the whole
   texture visibly shifts the instant any later stroke is undone. Making the tooth binary closes
   that gap: overlapping same-phase ops are idempotent, so live pixels equal replay pixels. The lone
   residual is the anti-aliased **silhouette** of the stroke itself (a sub-pixel edge ring), which
   is inherent to per-op `stroke()` and imperceptible. `engine.spec.ts` guards this two ways now:
   the pixel-**count** invariant (which a soft tooth also passed — count is blind to a spatial
   shuffle) *and* a spatial-**stability** check that undoes a later stroke and asserts an earlier
   stroke's texture band is byte-stable.

3. **Wax buildup at constant hue, live and gradual.** The body is laid down **opaque**, so a second
   same-colour stroke over the first is opaque-over-opaque of the *identical* colour — the hue
   physically cannot shift or darken (no multiply). What changes is **coverage**: because each
   stroke phase-shifts the tooth by its own seed, the second stroke's pits fall in different paper
   spots and fill tooth the first left bare. It gets denser while staying the same colour — exactly
   pressing a crayon over its own mark. Buildup is **live/gradual** for free: each per-frame op
   paints its wax immediately as the finger moves, so the fill follows the stroke rather than
   snapping in at the end.

The centre-dense / edge-broken falloff a real crayon shows (hard press in the middle, crumbling
flecks at the rim) is reproduced with a small set of **nested density passes**: a full-width sparse
pass under a narrower dense pass, both the same colour and seed, drawn widest-first. All the knobs
(tile size, octaves, per-pass width/coverage, dither-band width, body-density variation, shade
variation) live in a mutable `CrayonOptions` with tuned defaults.

**The wax body carries a subtle per-texel shade variation, in RGB only.** The swept-passes
experiment (PR 429) showed that a fill whose colour gently mottles reads far waxier than a flat
body, and its continuous alpha ramp is exactly what property 2 forbids here. The resolution:
`shadeShift` nudges each tile texel's rgb a few percent toward black/white — tall tooth bumps (thick
deposit) slightly darker, the slow body field lighter exactly where it thins the coverage — while
the alpha stays binary. Because the shift is a pure function of the paper texel (never the pass or
op) and every pass of a stroke shares one phase, overdraw rewrites each pixel with its own exact
colour, so the op-count-independence of property 2 is untouched. The amplitude is deliberately very
subtle (`shadeVariation: 0.08`, fine grain weighted over the slow drift): the phase-shifting splat
pattern already varies coverage, so the colour wobble only has to break the flatness, not carry the
texture. Same-colour buildup still cannot multiply-darken; a band's *mean* colour can now drift a
few levels between passes (the slow term does not average out over a band), which the constant-hue
E2E bound accommodates while still catching a translucency regression by an order of magnitude.

**Buildup also happens mid-stroke — a pass, not a stroke, is the unit of phase.** Real wax doesn't
care whether the crayon lifted before re-covering a spot, so a continuous back-and-forth scribble
must densify live exactly like separate strokes do. `CrayonPassTracker` (ported from the
swept-passes experiment, PR 429, thresholds and all) watches the live polyline for the tip
re-covering its own laid strip — a sharp reversal, or re-entry within a stroke width of paper laid
more than the trailing-arc exclusion ago — and the engine starts a new **pass** there by bumping to
a fresh seed for the ops that follow (`strokeCrayonSegments`). Straight lines, gentle curves,
ordinary corners, and hand jitter never split (unit-pinned); a genuine pointer-resume jump also
starts a fresh pass. Since the seed was already stored per op, mid-stroke splits are replay-safe by
the same mechanism as everything else.

**Crossing colours mix — subtractively, via a per-pass buffer stamped once.** Blue over yellow must
read green. Three iterations shaped the mechanism. First, any per-op mix would compound across the
dozens of overlapping per-frame ops inside a stroke and cancel itself toward pure crayon colour in
the interior; mixing must happen **once per deposition pass**, against what was under the pass — the
swept-passes experiment's overlay conclusion. Second, the mix must be **subtractive**: pigments
filter light rather than average it, so an rgb lerp of blue over yellow goes *grey*. Third, the
subtractive operator matters: a multiply glaze mutes the shared channels and darkens same-colour
overdraw, capping how strong the mix could ship — still short of visible green on a phone. The
winner is **`darken` (per-channel min)**: `min(S,D)` is the two pigments' shared reflectance, so
blue over yellow keeps its full green channel while only its blue channel drops, and `min(c,c) = c`
means a same-colour pass reproduces its own pixels **exactly** — the constant-hue buildup rule holds
at any strength, which is what lets the mix ship strong enough to actually see. Crayon ops
accumulate on a per-target **pass buffer** at full opacity (overlapping ops stay idempotent there),
and a recorded `crayonFlush` op stamps the buffer in two blits with no readback — `darken` at alpha
1 (covered ink becomes `min(S,D)`, blank paper gets `S`), then `source-over` at `1 − m` — netting
`out = (1−m)·S + m·min(S,D)` per covered pixel (`colorMix` m = 0.55: the palette blue over yellow
lands at (98, 162, 146), green-dominant). Over blank paper the two steps collapse to exactly `S`,
fully opaque. The engine records the flush at every pass close (mid-stroke split, pointer lift,
resume jump), so replay stamps — and therefore mixes — at exactly the live positions in the op
order, keeping rebuilds byte-identical. Live, the open pass renders on **two stacked engine-owned
overlay canvases** painted identically per op — the bottom with `mix-blend-mode: darken`, the top at
CSS opacity `1 − m` — whose compositing reproduces the two-blit stamp precisely, so there is no
visible snap at pass close, and the pointer-events-none overlays never intercept input. The canvas
and both overlays sit in a wrapper with **`isolation: isolate`**, which confines the darken blend to
the canvas's own pixels: over virgin (transparent) canvas the preview shows the pure colour, exactly
like the stamp. Without the isolation the blend composites against the page behind the canvas —
invisible on the near-white light paper (`min(colour, white) = colour`) but on the dark paper
`min(colour, near-black)` erased the bottom layer, leaving a faint `1 − m`-opacity stroke until the
pass stamped (the dark-mode-only bug this paragraph's E2E screenshot test pins).

Because a crayon op lives in the **same canvas, in draw order**, the correctness requirements fall
out of machinery that already exists: undo/resize/export replay it like any op (ADR-0033/0034);
`renderOp` skips crayon when the op is an eraser, so `destination-out` erasing clears wax like any
pixel; and a later solid stroke paints over it (source-over order, flushing any open pass first so
compositing order matches op order). Simplification (ADR-0036) is the one carve-out: a command
holding crayon ink **bypasses simplification wholesale**, for two reasons. RDP re-fits the polyline
within ~1px, an invisible AA shift for a solid stroke, but the crayon's binary tooth flips whole
texels at a re-fitted silhouette — visible at exactly the scribble hairpins mid-stroke splitting
creates. And the reducer re-emits path ops at the pointer's first-op position, which would reorder
the inline `crayonFlush` markers relative to their passes — the positions that make replay mix at
the same points live rendering did. Replaying the exact live ops is idempotent by construction, so
live and every rebuild agree byte-for-byte; ADR-0035 keyframing bounds the longer replay instead,
just as the swept-passes experiment concluded.

### Design + tuning loop

The look was tuned against **photos of real wax crayon** (a single stroke, two same-colour strokes
crossing, a scribble fill, a light→heavy build-up gradient) generated with the repo's Gemini image
seam. A repeatable loop rendered the crayon into the same scenes through `/dev/engine` under the
`setCrayonParams` A/B seam (below), measured coverage + mean opaque colour per region, and scored
renders against the references with a Gemini vision judge. The judge was used as a **regression
signal, not an oracle** — it ran harsh and was flat-out wrong on the buildup axis (it scored buildup
0 while the pixel measurement showed +0.08 coverage at a constant hue); the final call was made by
eye against the references. Several rounds moved from a coarse, visibly-repeating tile to a large
tile with fine multi-scale grain, from a too-solid "marker + halo" core to tooth throughout the
body, and added slow body-density variation for waxy pressure unevenness.

### Selectable + A/B-able the way render variants already are

Following the `setSimplifyParams` precedent (ADR-0036), the crayon is dev-selectable and its
variants A/B-able through the `/dev/engine` harness, gated by `PUBLIC_ENABLE_DEV_HARNESS`:
`setCrayonMode` toggles the brush and `setCrayonParams`/`getCrayonParams` override the
tooth/coverage/pass knobs at runtime, so **one preview build sweeps every variant** and the winner
ships as the `CRAYON_DEFAULTS`. Production never calls the setter.

## Consequences

* **+** Zero new undo/eraser/ordering/export machinery — the brush rides the command log, so the
  bit-identical-replay invariant is correct by construction, not by a parallel textured-layer system
  that would have to re-derive it.
* **+** Wax buildup at a genuinely constant hue: opaque-over-opaque of the same colour can't darken,
  and coverage rises because the tooth phase-shifts per pass — a fresh stroke *or* a continuous
  gesture re-covering its own paper (the pass tracker). No multiply, no muddying, and no
  lift-dependence: scribbling in one gesture deepens exactly like redrawing after a lift.
* **+** Crossing colours interact like real pigment: each pass shows `colorMix` (55%) of its darken
  mix with the ink under it — subtractively, so blue over yellow genuinely goes green-dominant (an
  rgb lerp goes grey; a multiply glaze went muddy-teal and penalised buildup). Same-colour overdraw
  is EXACT (`min(c,c)=c` — the constant-hue rule survives at full mix strength), and wax over blank
  paper stays fully opaque at the exact colour. The cost: the engine owns two small overlay canvases
  for the open pass's live preview, and the canvas's owning wrapper must blend-isolate the stack
  (`isolation: isolate`) so the preview mixes against the canvas's pixels, not the page behind it.
* **+** Fully deterministic *and* undo-stable: the tooth field is fixed, the only per-pass variation
  is a stored seed, the tooth is binary, and crayon ops replay exactly as drawn — so the same
  drawing always produces the same pixels, byte-for-byte, including after a later stroke is undone.
* **−** The tooth is binary, so the pit rims are stippled (ordered dither) rather than a smooth
  alpha ramp. This is a deliberate trade: a soft ramp looked marginally creamier but its fractional
  alpha accumulated across the overlapping live ops, so the whole texture *shifted* the moment any
  stroke was undone/resized (the drawing rebuilds from simplified ops). Undo stability won; the
  dither keeps the binary rims from reading as hard dots, so the look holds. A true soft tooth would
  need a per-stroke composited layer (a parallel textured-layer system this ADR explicitly avoids).
* **+** Cheap: under the 4× CPU throttle, per-op draw averaged **0.086 ms** (max 2.6 ms) across a
  realistic multi-colour session — far under the ≲ 2 ms / ~8 ms budget. A new colour's wax tiles
  build once at ~1 ms, off any single frame.
* **−** The tooth field repeats every tile (256 px); a large fill can in principle show the period.
  Chosen tile + coarse-octave-free fine grain keep the repeat below legibility in practice, but a
  huge single-colour flood is the thin edge.
* **−** Buildup varies which pits fill (phase-shift), not deposit *depth* — it does not model a
  second pass filling the *same* valleys deeper. Visually indistinguishable at toddler scale and it
  keeps the hue exactly constant, which the depth model would not.
* **−** Crayon commands keep their per-frame ops (no RDP thinning), so their replay walks more ops
  and the undo log holds more points than a solid stroke's. ADR-0035 keyframing bounds the replay
  walk; the trade buys byte-identical rebuilds at scribble hairpins, where RDP's ~1px re-fit would
  flip binary-tooth texels. A hairpin gentler than the split thresholds deposits once (no split) —
  sharp reversals and true re-entries, the toddler cases, split correctly. Dwelling with a wiggling
  finger slowly darkens the tip area — physically plausible, bounded per split.
* **−** The mix stamps make a rebuild's raster work synchronous: each pass's `drawImage` is a canvas
  read-back that forces the just-painted strokes to rasterize on the spot (pre-mixing, replay
  strokes queued and rasterized off-thread after the undo call returned). Undo — a discrete tap, not
  the drawing hot path — pays it: a crayon-heavy 20-command history rebuilds in ~0.3–0.5 s under the
  software-rendered 4× profile harness (which exaggerates canvas blits; a real GPU composites them
  far cheaper). Stamps are bounded to each pass's bbox, `engine.draw` stays at ~0.9 ms avg, and
  `colorMix: 0` is a dev-sweepable escape hatch back to the direct opaque pipeline. A known
  follow-up if devices show sluggish undo: a rolling one-undo-back snapshot to make the first (most
  common) undo a single blit.
* **−** Not yet exposed as a kid-facing Actions Panel tool. The brush is fully wired through the
  engine (`setCrayonMode`) and selectable/A-B-able via the dev harness; adding a user-facing button
  is a deliberate follow-up (it needs an illustrated crayon icon matching the existing icon set,
  plus the settings/`actionButtonLayout`/Parent Center plumbing the eraser and magic brush have),
  kept out of this change so an un-designed icon doesn't ship into the polished icon set.
