# ADR-0065: Crayon Brush — Paper-Tooth Pattern Fill with Phase-Shifted Wax Buildup

**Status:** Active **Date:** 2026-07

## Context

Splotch needed a **crayon** brush that convincingly reads as wax on textured paper — not a marker,
not a pen with noise sprinkled on it. The behaviour that mattered most was **wax buildup**: drawing
a second crayon stroke over existing crayon of the *same colour* should fill in more of the paper
tooth and get **denser** while staying the **same hue** — no multiply-style darkening or muddying —
and it should build up **live and gradually** as the second stroke is drawn, never as a snap after
the stroke ends.

Whatever technique we chose had to ride Splotch's existing single-renderer drawing model (ADR-0033):
every op is replayed through one `renderOp()` so live drawing, undo, resize, and PNG export are
bit-identical, and rendering must be deterministic (no `Math.random`/time at render — ADR-0033's
0-drift invariant, guarded by `perf:units` and the engine spec). And it had to stay on the drawing
hot path's budget (ADR-0032): the magic brush set the bar at plain-pen cost by being an ordinary
pattern-fill op (ADR-0043).

The tempting first idea — stroke solid colour into an offscreen scratch, `destination-in` a tooth
pattern to punch grain, then `drawImage` onto the canvas — is the **per-op two-surface mask**
composite that ADR-0043 already measured at ~24 ms/move and rejected. A full-canvas composite every
`pointermove` blows the frame budget by ~1600×. That was a known dead end going in.

## Decision

A crayon stroke is an **ordinary op in the command log** (ADR-0033), flagged `crayon`, whose paint
is a **`CanvasPattern` of the stroke colour punched by a fixed paper-tooth mask** — opaque on the
tooth peaks, transparent in the valleys. `renderOp` strokes that pattern for a crayon op; erasing,
undo, resize, and export are unchanged, so every hard requirement falls out of machinery that
already exists — exactly the magic brush's model (ADR-0043), a different pattern source. The whole
brush lives in `lib/drawing/crayon.ts`; the engine only threads a `crayon` flag + a per-stroke grain
phase onto each op and adds one branch to `renderOp`.

Two properties are load-bearing:

* **Waxy, not flat, and contained.** The pattern only paints *inside* the stroked shape, so the
  grain can never spray past the drawn path. The tooth valleys are transparent, so the stroke body
  is dense colour broken by fine paper showing through, with a broken-but-crisp edge — no blur, no
  digital grit, no starburst.

* **Buildup at constant hue, by construction.** The colour is **fully opaque** (`bodyAlpha: 1`), so
  `source-over` of the crayon colour over existing crayon of the same colour is a **no-op on the
  peaks it already covers** — the hue physically cannot shift or darken. The only thing a second
  pass can do is land colour on the **valleys the first pass left**. To make it do that instead of
  re-covering the same peaks, each stroke shifts the tooth by a **per-stroke grain phase**
  (`gx`/`gy` stored on the op). Different phase → the passes interleave → coverage climbs toward
  solid while the hue never moves. Because each `pointermove` op paints along the path, the fill-in
  is live and gradual, never a post-stroke snap.

### Determinism

The tooth tile is a **deterministic value-noise fractal** generated once from a fixed seed (a
`mulberry32` PRNG — never `Math.random`), thresholded at the coverage quantile so the opaque
fraction is exact, with a soft smoothstep band for crisp-but-anti-aliased valley edges. The
per-stroke grain phase is **derived from the stroke's start point** (paper coordinates, which are
stored) and **stored on the op** as `gx`/`gy`, constant across the stroke's ops. So the texture
variation derives entirely from stored stroke data: the same drawing always produces the same
pixels, and undo/resize/export replay bit-identically. (`commandSimplify` carries `crayon`/`gx`/`gy`
through simplification and keys the per-run style on them so runs with a different phase don't
merge.) A pleasant side effect: two strokes that start even a pixel apart get well-separated phases,
so an overlapping second pass reliably builds up — while redrawing the *exact* same geometry
reproduces the exact same pixels, which is what makes the determinism test pass.

### Coloured-tile cache

The only non-trivial cost is punching the colour by the tooth (fill a tile with the colour, then
`destination-in` the tooth mask). It's cached per (target context, colour): the first op of a stroke
of a new colour builds it once — off the per-move hot path — and every later op just re-strokes the
cached pattern like a solid colour, phase-shifted via `pattern.setTransform` (the same
`DOMMatrix`-translate the magic sheet uses; within the Chrome 111 / Safari 16.4 floor —
`docs/COMPATIBILITY.md`). The cache is keyed per context because a pattern is bound to the context
that created it (the visible ctx live; baseline/keyframe/export contexts on replay).

### Tuning — empirically chosen through a render + vision-judge loop

The tooth was tuned against real-crayon reference images through a repeatable loop: render the same
scenes (single stroke, first-vs-second same-colour pass, scribble fill) through the **real shipping
code path** (`/dev/engine`'s `setCrayonParams` seam, so what was judged is what ships), then score
each render with an automated Gemini vision judge used as an adversarial regression signal — not an
oracle — with the final call made by eye against the references. The judge's first-round complaint
("coarse, uniform digital speckle") drove the winning change: a **fine base tooth** (cells 2/4/8)
for the paper grain **plus a strong coarse octave** (cell 64) that modulates wax density across the
stroke so it reads as uneven hand pressure rather than a uniform screen. Winning defaults:
`coverage 0.86`, `cells [2,4,8,64]`, `weights [1,0.5,0.35,0.5]`, `band 0.06`, `tile 512` — judge
overall 3 → 9 (grain 2 → 9, containment 10, buildup 10, no hue shift).

### Dev-selectable A/B

Following the `SimplifyMode` idiom (ADR-0036), `crayon.ts` owns a `CrayonMode` / `CrayonParams`
variant set with the shipping tuning as the default, and the engine exposes a thin `setCrayonParams`
dev seam wired onto `window.__engine` only on `/dev/engine` (`PUBLIC_ENABLE_DEV_HARNESS`) —
production never calls it. One build can A/B every variant (`'tooth'` shipped, `'dense'`, `'off'` =
plain-pen baseline). The user-facing tool follows the magic-brush spine exactly: a `crayon` boolean
in `toolState`, an `$effect` bridge to `setCrayonMode`, and a Crayon button in the Actions Panel.

### Performance

Measured through the `/dev/engine` harness under the same 4× CPU throttle as `perf:web`, driving 5
strokes × 120 ops across 5 distinct colours (so every stroke pays a cold coloured-tile build):

| brush          | avg per-op draw | p95     | max single op |
| -------------- | --------------- | ------- | ------------- |
| pen (baseline) | 0.054 ms        | 0.40 ms | 2.5 ms        |
| **crayon**     | **0.064 ms**    | 0.50 ms | **1.4 ms**    |

Crayon draws at essentially plain-pen cost — far under the ≲2 ms average / ~8 ms frame budget — and
`perf:units` still passes 10/10 (worst shift 1.00 px, the pen path is byte-unchanged).

## Consequences

* **+** Zero new undo/eraser/resize/export machinery — the crayon rides the command log, so
  bit-identical replay and correct draw-order are true by construction, not a parallel system.
* **+** Buildup at constant hue is a structural guarantee (opaque `source-over` + phase shift), not
  a tuning that could drift into darkening/muddying.
* **+** No measurable live-draw regression vs. the plain pen; the expensive punch is cached per
  colour, off the per-move path.
* **−** The tooth tile repeats every `tile` paper units; the per-stroke phase hides it across
  strokes and the grain is low-contrast, but a single very large fill could in principle show the
  period.
* **−** Redrawing the *exact same* stroke geometry reproduces identical pixels (no buildup on a
  pixel-perfect repeat) because the phase is position-derived. This is what makes replay
  deterministic; real (never-pixel-identical) input always builds up, so it isn't reachable in
  practice.
* **−** A keyframe raster (ADR-0035) baked from crayon ops freezes those pixels, so a later
  `setCrayonParams` retune won't re-render already-keyframed strokes — acceptable for a dev-only
  seam.
