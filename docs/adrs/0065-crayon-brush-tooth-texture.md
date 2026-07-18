# ADR-0065: Crayon Brush — Blue-Noise Paper Tooth with Per-Stroke Wax Buildup

**Status:** Active\
**Date:** 2026-07

## Context

Splotch shipped one freehand tool (the pen — a smooth solid line) plus the eraser and the magic
brush (ADR-0043). We wanted a **crayon** that convincingly reads as waxy pigment on textured paper
and, above all, **builds up like real wax**: a second same-colour stroke over the first should fill
the paper grain and grow denser while staying the exact same hue — never darkening or muddying the
way a translucent marker (a multiply blend) would.

Four hard constraints from the drawing engine shaped the design:

* **One renderer, bit-identical replay (ADR-0033/0035/0036).** Every surface — the live canvas,
  undo, resize, keyframes, PNG export — repaints from the same op log through `renderOp`. Undo,
  resize, and export must reproduce a stroke exactly (the engine spec enforces 0-pixel drift).
* **Deterministic render (no RNG/time).** Any texture variation must derive only from stored op data
  so the same drawing always produces the same pixels.
* **The supported floor is Chrome 111 / Safari 16.4 (`docs/COMPATIBILITY.md`).** `createPattern`,
  `ImageData`, and `getTransform()` are all within it; `OffscreenCanvas`, `ctx.filter`, and
  `createImageBitmap` (dev-harness only) are not relied on.
* **The drawing hot path is perf-critical** — the brush harness (`npm run perf:web`, 4× CPU
  throttle) wants average per-op draw ≲ 2 ms and no dropped frames.

A useful accident of the rendering stack made the look possible: the drawing `<canvas>` is
transparent and the handmade-paper sheet renders *beneath* it (ADR-0050/0051), so crayon drawn at
partial alpha reveals the real paper in the tooth valleys — actual crayon-on-paper, live and in the
exported PNG.

## Decision

Add a **crayon** tool (a mutually-exclusive modifier alongside eraser/magic, wired the same way) and
render it as **a stroke masked by a fixed paper-tooth texture, composited per stroke group**.

### 1. Blue-noise paper tooth, shipped as a constant

The tooth is a **void-and-cluster blue-noise** threshold matrix (Ulichney 1993), not white noise:
blue noise spreads its energy to high frequencies, so any partial-coverage slice is an evenly spaced
fine stipple that reads as paper grain rather than gritty clumps. It is generated once, offline and
seeded, by `scripts/gen-crayon-noise.mjs` (`npm run gen:crayon-noise`) and committed as a base64
byte tile in `web/src/lib/drawing/crayonNoise.ts`. Shipping a constant (vs. generating at load)
guarantees every device/replay/export samples the identical tooth and costs nothing at runtime.

### 2. Two-band tooth → a colourised repeating pattern

`crayonTexture.ts` builds the tooth from two frequency bands so it reads as wax, not a mechanical
stipple: a **high band** (the blue noise, softened to ~1.5 device-px grain) is the fine paper tooth,
and a **low band** (a smooth tileable value-noise field) nudges the local coverage up and down for
organic denser/lighter patches. A coverage curve maps tooth height → per-layer deposit alpha
(near-opaque on peaks, a small non-zero floor in valleys). The result is colourised per crayon
colour and used as a repeating `CanvasPattern` anchored at the paper origin — so the grain is fixed
in paper space and identical across the live canvas, replay, keyframes, and export.

### 3. Source-over of a constant hue = wax buildup (never multiply)

Layering the same semi-transparent colour C over itself with `source-over` drives coverage as
`1 − (1 − a)^n`: alpha climbs toward opaque, the hue never moves, and it never darkens *past* C.
That is exactly wax buildup at constant hue — and it is why the crayon must **not** use `multiply`
(which keeps driving toward black).

### 4. Per-stroke-group compositing (the crux)

Plain per-op source-over can't tell "my own slow stroke overlapping itself" from "a previous
stroke", so a slowly drawn stroke self-saturates to near-solid and leaves no tooth and no headroom
to build on. So each **stroke group (= one undo command) deposits exactly one tooth layer**:
`crayonGroup.ts` keeps a per-target coverage mask and, for each op, deposits tooth-textured colour
**only where the group hasn't already painted**. Within a stroke this is idempotent (grain stays
visible); across strokes ordinary source-over on the target accumulates (buildup). The callers that
replay a command's ops (`paintStateThrough`, `replayAll`'s active command, `foldOldestIntoBaseline`,
and the live `beginStrokeGroup`) bracket each command with `beginCrayonGroup()`, so live and every
rebuild run the identical algorithm. All per-op work is clipped to the op's device rect, keeping the
cost proportional to the op, not the canvas.

Because the deposit is incremental per op, buildup over an existing stroke appears **gradually while
the second stroke is drawn**, never as a snap at stroke end.

### 5. Dev-selectable variants

`/dev/crayon` renders the reference scenes (single stroke, same-colour buildup, scribble fill)
through the real renderer over the real paper, with live sliders for the tooth-coverage variant
params (the `setCrayonVariant` engine seam, mirroring `setSimplifyParams`). It doubled as the
deterministic screenshot source for an automated reference/vision-judge loop (real-crayon references
generated with Gemini, scored against renders) used to tune the shipped defaults. The winning
variant is the default in `DEFAULT_CRAYON_PARAMS`.

## Consequences

* **Buildup works and is live.** A second same-colour pass measurably fills tooth and raises total
  wax (~+10% alpha/pass in the engine test) at constant hue, with no multiply darkening — the
  behaviour we most cared about. Covered by `web/tests/crayon.spec.ts` (E2E, real pixels) and the
  pure-math law in `crayonTexture.test.ts`.
* **Bit-identical replay holds.** The tooth derives only from stored ops + the shipped tile and
  composites deterministically, so every rebuild reproduces the same pixels; the live-vs-committed
  difference is only the one-time commit simplification every stroke already has (ADR-0036).
* **Memory:** each render target keeps two extra full-canvas scratch canvases (coverage + dab).
  They're cached per context and small in number (visible, baseline, export).
* **A faint per-op "scallop" can appear** at stroke-op boundaries (the coverage mask's AA seam).
  It's minimal with the engine's coalesced multi-segment ops and reads as hand-drawn crayon texture;
  the finest one-op-per-point path (only the harness) exaggerates it.
* **The low-frequency band repeats** at the tooth tile's scale (~128 CSS px at 2× DPR). It's subtle
  and only noticeable across a large flat fill.

### Alternatives considered

* **White-noise tooth** — gritty, clumpy speckle; blue noise is the fix (this was the entry point).
* **Per-op source-over without groups** — a slow stroke saturates to a near-solid fill and kills
  buildup headroom (measured); rejected in favour of per-group compositing.
* **`multiply` blend for buildup** — darkens toward black and muddies the hue; the opposite of wax.
* **Scattering stamps/particles along the path** — sprays grain past the drawn path (fails
  containment); stroking the actual path through a tooth pattern keeps grain inside the stroke.
* **Compositing the whole group at stroke end** — buildup over existing ink would appear as a snap,
  not gradually; the incremental per-op delta avoids it.
