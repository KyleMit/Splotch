# ADR-0065: Crayon Brush — Textured Wax via Phase-Shifted Paper-Tooth Pattern Ops

**Status:** Active **Date:** 2026-07

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
   fixed; the only variation is the stored per-op `seed`, which merely **phase-shifts** the same
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
(tile size, octaves, per-pass width/coverage, dither-band width, body-density variation, tone
variation) live in a mutable `CrayonOptions` with tuned defaults.

### Subtle per-texel tone variation (RGB-only, alpha untouched)

The opaque body is additionally not one flat RGB: each texel's colour is shaded a touch darker or
lighter (`toneVariation`, ±12% of the channel's headroom by default) by a **tone field** derived
from the same paper-tooth height field that decides where wax lands — thick wax on the high grain
shades darker, a thin scrape lighter — so the fill carries the waxy tonal life of real crayon
(adapted from the swept-passes experiment's continuous height→alpha transfer, PR `#429`) without
giving up any replay invariant. Three constraints shape it:

* **RGB only, never alpha.** Fractional alpha is what breaks undo (property 2), so the tone lives
  entirely in the tile's RGB while the tooth stays binary. An opaque texel painted any number of
  times by any number of ops resolves to the same colour, because…
* **…the tone is a pure function of the texel, shared by every pass.** Both density passes shade a
  given paper texel identically (only their alphas differ), so pass order and op overlap cannot
  produce a different colour — idempotence extends from the binary alpha to the shaded RGB.
* **Fine grain only, so buildup keeps a constant hue.** The tone deliberately samples only the fine
  height field, never the slow body field: fine grain averages out over any region, so a same-colour
  redraw — whose seed phase-shifts the tone along with the tooth — cannot move a region's *mean*
  colour (the buildup-at-constant-hue test pins this). An earlier variant that mixed in the slow
  body field visibly shifted a band's mean on redraw and was rejected. Slow tonal drift still reads
  in the render via the body field's pit-density wobble.

Because the colour tile is built synchronously on the pointer path the first time a colour is drawn,
the tone is quantized to 32 levels at field-build time and applied per texel as one byte lookup into
a per-colour LUT — measured first-stroke cost for a fresh colour moved ~2.6 → ~3.0 ms (unthrottled,
one-time per colour); the per-frame hot path (cached pattern) is untouched.

### Colour mixing with the ink underneath (a once-per-stroke snapshot, never the live destination)

Fresh wax picks up a little of the colour already on the paper — yellow drawn over blue leans green
(`colorMix`, a low lerp fraction, 0.15 by default; real crayons barely mix). The obvious
implementations all break the replay contract: a blend mode or fractional alpha *reads the
destination per op*, and a stroke is dozens of overlapping live ops but a few simplified replay ops,
so repeated destination-reads accumulate differently per op count and the pixels shift on undo. The
correct construction restores purity:

* **The mix source is a snapshot of the target taken once per stroke group**, before the group's
  first op. Every op of the group lerps its deposited texels toward that fixed image, so the
  deposited value is again a pure function of the texel — idempotent under any op count — and every
  rebuild reproduces the snapshot bit-exactly because commands replay in order: the target's content
  before a command *is* the state the live snapshot captured. The engine arms the snapshot at live
  stroke start (and re-arms it as empty when a clear lands mid-stroke); every replay loop (undo,
  resize, export, keyframe build, baseline fold) re-arms it per command.
* **Per stroke group, not per finger or per mid-gesture pass:** commit-time simplification reorders
  a multi-touch command's interleaved ops, which is only sound while every op of the command mixes
  against the same under image. Mixing with pre-stroke ink covers every visible case anyway — a
  stroke is one colour, and mixing with your own colour is invisible.
* **A lerp, not a multiply — same-colour buildup stays at constant hue.** `lerp(C, C) = C`, so
  redrawing the same colour cannot darken or muddy (the constant-hue requirement above); a
  subtractive multiply would darken same-colour overlap by `k·C(1−C/255)` and was rejected.
* **Compositing confines the mix to the op's own tooth.** A mixed op renders on a shared scratch
  surface: the tooth passes stroke onto the scratch, one `source-atop` pass at `colorMix` alpha
  draws the snapshot over it (atop = confined to existing alpha, so the pits stay transparent and
  old ink shows through untouched), and the result blits back within the op's device bounds. Live
  per-op bounds are a few dozen pixels, so the extra raster cost is small; the snapshot copy is one
  full-canvas `drawImage` per stroke, skipped entirely when the canvas is blank or `colorMix` is 0.

Cost: two extra canvas-sized rasters (snapshot + scratch, grow-only, allocated lazily — never for a
blank canvas), one full-canvas copy per crayon stroke over existing ink, and the same per command on
rebuild. Residual: the under-ink's ADR-accepted anti-aliased silhouette fringe differs slightly
between live and simplified rendering, and the mix samples it — measured at a few invisible fringe
pixels per overlapping stroke pair (present with `colorMix` 0 too; the mixed-scene E2E pins interior
byte-stability and bounds the fringe count).

### Mid-gesture buildup: the seed advances when a stroke re-covers its own wax

With one seed per stroke, backtracking WITHIN a continuous gesture was idempotent — the same phase
re-deposits the same texels, so scribbling back and forth over a spot never deepened it, while
lifting the pen and redrawing the identical sweeps did. A real crayon doesn't care whether the pen
lifted: re-covering wax is re-covering wax. So the seed is per **deposition pass**, not per stroke:
`CrayonPassTracker` (ported from the swept-passes experiment, PR `#429`) watches each pointer's
gesture geometry, and at the moment the tip starts re-covering its own strip — a sharp reversal
(turn past ~100°, measured between direction anchors so pixel jitter can't trigger it) or re-entry
(landing within ~half a width of a point laid more than ~2.5 widths of arc ago) — the engine closes
the current op, advances the seed from the same monotonic counter, and re-seeds a tracker. Each
re-covering sweep then deposits a freshly phase-shifted tooth on top, so a continuous scribble
deepens live exactly like lifted strokes (pinned by an E2E parity test).

Every op still stores the seed it was drawn with, so replay is exact by the same argument as before;
commit-time simplification already refuses to merge ops with different seeds (the style key), so the
pass boundaries survive reduction and undo rebuilds are byte-stable (both pinned in E2E for a
split-containing stroke). The split lands between ops mid-frame — the closed op ends at the previous
point and the next begins there, keeping the smoothed curve geometrically continuous. Known
tradeoffs inherited with the tracker: a hairpin gentler than both thresholds deposits once (no
split), and a long dwell with a wiggling finger slowly darkens under the tip — the physical
behaviour, bounded per split.

Because a crayon op lives in the **same canvas, in draw order**, the correctness requirements fall
out of machinery that already exists: undo/resize/export replay it like any op (ADR-0033/0034);
`renderOp` skips crayon when the op is an eraser, so `destination-out` erasing clears wax like any
pixel; a later solid stroke paints over it (source-over order); and simplification (ADR-0036) thins
it like any path op — `crayon` and `seed` join the per-run style key so crayon/solid runs, and two
crayon strokes with different seeds, never merge.

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
  and coverage rises because the tooth phase-shifts per deposition pass — across strokes and within
  one continuous scribble alike. No multiply, no muddying.
* **+** Fully deterministic *and* undo-stable: the tooth field is fixed, the only variation is a
  seed stored per op, and the tooth is binary, so the same drawing always produces the same pixels —
  including after a later stroke is undone, when the surviving strokes rebuild from far fewer
  simplified ops than they were drawn with.
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
* **−** Not yet exposed as a kid-facing Actions Panel tool. The brush is fully wired through the
  engine (`setCrayonMode`) and selectable/A-B-able via the dev harness; adding a user-facing button
  is a deliberate follow-up (it needs an illustrated crayon icon matching the existing icon set,
  plus the settings/`actionButtonLayout`/Parent Center plumbing the eraser and magic brush have),
  kept out of this change so an un-designed icon doesn't ship into the polished icon set.
