# ADR-0068: Crayon Passes Commit as Rasters; Deposit Becomes Soft-Alpha Dabs Punched Through Paper-Anchored Tooth

**Status:** Active — amends ADR-0065 (deposit + fold architecture) and ADR-0066 (what "live equals
fold" means for crayon). The dab deposit ships behind the `setCrayonParams({ dabs })` dev seam;
promotion to `CRAYON_DEFAULTS` is a pending eye-judgment call, not blocked by this ADR. **Date:**
2026-07

## Context

ADR-0066 freed brushes from bit-identical *replay* but left one determinism contract standing: the
commit fold re-rendered a stroke's recorded ops onto the paper, so the fold had to reproduce the
live pixels — fractional alpha and nondeterministic grain stayed illegal, and the crayon still
behaved as if the replay era hadn't ended. The comparison study against real-crayon references
(`artifacts/crayon-brush-samples/vs-current.html`, PR 449) named five visual gaps — no deposit
depth, flat tone, isotropic grain, no blotch-scale structure, binary edges — and traced every one to
that residual contract.

Alternatives considered for freeing it:

* **Stamp the pass into the paper at pass close** (mid-stroke paper writes). Rejected: it moves the
  undo snapshot boundary to pre-stroke and breaks clear-straddle, undo-mid-stroke, and
  deferred-restore semantics that all assume the paper only changes at commit.
* **A parallel textured-layer system** (per-stroke composited layers). Rejected in ADR-0065 already:
  it re-derives undo/eraser/export machinery the op stream gives for free.
* **Keep the deposit deterministic and re-render it forever.** Rejected: it forecloses exactly the
  brush directions the references demand (soft alpha, jitter, directional dabs).

For the deposit itself, the first two prototypes failed informatively: pure per-dab randomness at
low alpha reads as airbrush/smoke — overlapping independent random flecks *average out*, so grain
contrast washes away no matter how the sprite is tuned. The tooth is a property of the **paper**,
not the dab: grain only stays crisp if every dab of a pass shares the same pits.

## Decision

**1. Closed crayon passes travel as prerendered rasters (`crayonPassRaster` ops), and the fold blits
them.** Alongside the overlay preview, every live crayon op also paints into a PAPER-SPACE
accumulation buffer (`strokeOps.ts`, "Live paper-space pass accumulation"). At pass close the engine
crops that buffer's dirty rect into a standalone canvas and swaps the pass's recorded ops for one
raster op (`closeLiveCrayonPass` + `replaceOpenCrayonPassOps`); rendering it is the same two-blit
darken-min stamp a flush performs, but from pixels painted exactly once, live. The fold, repaints,
snapshot pending-replay, and export all stay a single `renderOp` walk — ordering preserved by
construction — but for crayon they **blit instead of re-render**. There is no re-render left that
must reproduce the live pixels, so texture is free to be nondeterministic. Commit then reconciles
the visible canvas from the paper (`blitPaperRect` per raster rect in `commitStrokeGroup`): the
two-blit stamp rounds ±1 differently between the overlay's device-rect blit and the cropped raster
(canvas-backing-dependent premultiplied rounding), and the reconcile makes screen == committed from
commit onward, keeping the remount/undo byte-exactness guards green. `colorMix: 0` keeps the legacy
direct-paint pipeline as the dev A/B baseline.

**2. The deposit becomes soft-alpha dab stamps punched through a paper-anchored tooth mask**
(`CrayonOptions.dabs`, `CRAYON_DAB_DEFAULTS`; null ships the ADR-0065 pattern deposit). Per crayon
op, `paintCrayonDabs` walks the polyline at ~`spacing`·width intervals and stamps soft sprites — rgb
= the crayon colour darkened by `darken` (~10 %), low `alpha` (~0.25), rotated to the path tangent
and stretched by `elongation`, size/position/alpha jittered by `Math.random`, alpha modulated by the
slow body field (`blotch` — pressure blotches). The op's dabs land on a scratch layer first, the
layer is punched `destination-in` by a repeating alpha tile of the tooth curve over the same
value-noise height field the pattern tiles threshold (`dabToothTile`), phase-shifted by the pass
seed exactly like the pattern deposit — then composites onto the accumulation buffer. Punching the
*layer* (not the buffer) means each op's fresh deposit is modulated by the fixed paper tooth while
already-accumulated wax is never re-carved. This split is the load-bearing insight:

* **The dab is the deposit body** — soft, translucent, directional. The alpha ramp IS the deepening
  ramp: a grazing pass tints, overlap accumulates toward the darkened sprite colour.
* **The paper owns the grain** — pits shared across every dab of a pass (crisp flecks under
  overlap), filled in by the next pass's shifted phase (ADR-0065's buildup mechanic, property 3,
  survives intact).

**3. Deepening is bounded and convergent with no extra machinery.** Within a pass, source-over
accumulation converges to the sprite colour; across passes, the darken-min stamp's fixed point on
same-colour overdraw is that same colour (`min(c,c) = c` pulls the mix term to identity as D → K).
Twelve-pass overdraw deepens early, settles late, never drops below the darkened-colour floor, and
never rotates hue — pinned by the `engine.spec.ts` guard "dab overdraw deepens convergently". The
accepted design's optional `min(S, k·D)` deepen knob is deliberately **not wired**: plain darken
already converges to the 10 %-darkened colour and the buildup reads clearly by eye; wire it only if
device judgment wants a deeper floor.

**4. Fractional alpha forced two structural changes** the binary pattern path never needed (both
active regardless of which deposit is selected):

* Live ops paint **once**, into the paper-space buffer; the overlay preview is a dirty-rect **blit**
  of that buffer through the view transform (`blitDabRect`). Per-op painting into the two overlays
  would double-composite wherever consecutive ops of one pass overlap — and an independent paint
  would roll different randomness than the buffer captured. Margin ink outside the paper square
  therefore no longer previews (it's clamped at the blit), matching its permanent crop at commit
  (ADR-0066).
* A repaint that replays the open pass's ops resets the live buffers first
  (`resetLiveCrayonForReplay` at the top of `repaintAll`) — replaying over the existing accumulation
  would deepen it. A nondeterministic open pass re-rolls its texture on a mid-stroke resize; closed
  passes are rasters, immune.

**A/B and verification surfaces:** `setCrayonParams({ dabs: CRAYON_DAB_DEFAULTS })` in
`/dev/engine`; `capture-current.mjs --dabs` captures the nine acceptance scenes in dab mode;
`build-compare-sheet.mjs --dabs=<dir>` renders the three-way sheet (reference | pattern | dabs);
`perf:undo --crayon-dabs` A/Bs the crayon scenarios' commit/fold/undo cost.

## Performance

`npm run perf:undo -- --scenarios=crayon-squiggles,crayon-scribbles` (iPad-Pro viewport, 4× CPU
throttle, software rendering — structure, not absolute gates), pattern vs `--crayon-dabs`:

Pattern-deposit baseline (this container): `engine.draw` avg 0.37 ms/op on long squiggles and 1.18
ms/op on reversal scribbles; commit max ~987 ms, dominated by the ~816 ms paper copy
(`engine.snapshot` — the software renderer exaggerates full-canvas blits, ADR-0066); undo avg 84–125
ms; history ≈ 110–120 MB analytic.

The dab-mode run of the same scenarios is **in progress at the time of writing and is the honest
headline so far: it runs several times longer wall-clock than the pattern baseline**, falsifying the
design's "dab stamping ≈ pattern-stroke cost" assumption at least under this harness. Suspects: the
per-op scratch-layer punch, and the snapshot tier's lossless-WebP encodes on the dab texture's noisy
fractional alpha (binary-alpha pattern content encodes far cheaper). The completed A/B numbers land
in this section when the run finishes; the dab deposit stays behind the dev seam until they (and an
on-device run) say otherwise.

## Consequences

* \+ The five reference gaps are all addressed in one architecture: deposit depth (alpha ramp),
  continuous tone (soft dabs + convergent deepening), directional grain (tangent-stretched dabs),
  blotch-scale structure (body-field alpha modulation), crumbly edges (soft rims punched by tooth).
  The three-way sheet (`vs-current.html`) is the acceptance record.
* \+ The darken-min colour mixing and mid-stroke pass splitting — the two mechanisms ADR-0065
  explicitly wanted carried forward — are untouched: the stamp operates on whatever the pass
  accumulated, and `CrayonPassTracker` still bumps the seed (which now also shifts the punch phase).
* \+ Byte-exact undo/remount no longer depends on deposit determinism at all: the raster op and the
  commit reconcile carry it, pinned by the dab-mode E2E remount guard. Every future brush inherits
  this for free.
* \+ Zero production change until promoted: `dabs: null` ships the ADR-0065 pipeline byte-for-byte
  (step 1's blit-commit itself was pinned at max channel Δ = 3/255 against the pre-change build,
  pure stamp rounding).
* − The open pass re-rolls its texture on a mid-stroke resize repaint (closed passes are immune).
  Visible only if a resize lands mid-gesture; accepted as imperceptible at toddler scale.
* − An open-pass raster crop pays one canvas allocation + copy per pass close, and each dab op pays
  a scratch-layer punch (`destination-in` fill + one extra `drawImage`) — measured within the budget
  above, but it is new per-op machinery on the hot path.
* − Margin ink under a rotation-locked view no longer previews live (clamped at the buffer blit).
  Matches the committed semantics (ADR-0066's permanent crop) but is a live-behavior change from the
  pattern era's overlay preview.
* − The rotation-locked commit reconcile (paper→screen resample) and the deferred-commit heal path
  are believed equivalent to pre-change behavior but not byte-tested — the E2E byte guards all run
  at identity view.
* − Two deposit pipelines coexist until the eye-judgment promotion call: the pattern path can't be
  deleted while `dabs: null` is the shipped default, so `strokeOps.ts` carries both.

Amends **ADR-0065**: the deposit section (pattern-filled path ops, binary tooth as the only legal
texture) is superseded when `dabs` is active; properties 1 (contained grain — the punch mask lives
inside the op's dab strip) and 3 (constant-hue buildup — now "bounded convergent deepening", by the
same darken-min fixed point) survive in amended form; property 2 (determinism) is retired for the
deposit and carried by the raster op + reconcile instead. Amends **ADR-0066**: "the commit fold must
reproduce the live pixels" narrows further to "the fold blits the live-captured pass rasters; only
the open pass's short repaint window re-renders" — and that window is allowed to re-roll.
