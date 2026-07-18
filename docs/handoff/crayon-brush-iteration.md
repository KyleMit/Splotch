# Handoff — crayon brush iteration

> 2026-07-18 · branch `claude/brush-modes-selector-z1rek0` · no PR yet · Iterating the crayon
> brush's look + wax buildup on the Option-A per-op renderer (ADR-0065). v12 shipped; user says
> "needs more iteration."

## Objective & non-goals

**Objective.** Make the **crayon** brush read like real wax crayon on textured paper, with **wax
buildup** that matches the user's spec: a second stroke over existing crayon **fills the paper grain
in new locations** and gets denser **at the same hue** — "does little to change the actual colour."
It must be **live/gradual** (no snap on lift), **contained** (no grain sprayed past the stroke
path), and **not gritty**. All on the single-renderer, bit-identical-undo invariant (ADR-0033).

**Non-goals.**

* Not touching the brush-selector UI / flyout / tool state — that part shipped and its E2E is green.
* Not re-opening **watercolor** (v3 "feathered wet edge" stands, ADR-0065).
* Not adding a per-op offscreen buffer to any brush *other* than crayon.
* Not changing the buildup **semantics** to multiply/darkening — the user explicitly wants
  constant-hue coverage buildup, not "darker on overlap."

## State

* **Branch:** `claude/brush-modes-selector-z1rek0` (designated; pushed).
* **Netlify preview mirror:** `feature/brush-modes-selector` (fast-forwarded to the same commit;
  restricted mode only deploys `feature/*`). URL:
  `https://feature-brush-modes-selector--splotchy.netlify.app`.
* **PR:** none opened yet.

| sha       | what                                                                            |
| --------- | ------------------------------------------------------------------------------- |
| `4c61ea9` | **Redesign crayon: wax body with tooth holes + coverage buildup** (current tip) |
| `70e4d0b` | (superseded) Document crayon redesign + wax buildup in ADR-0065                 |
| `44ad232` | (superseded) Add E2E for crayon wax buildup and undo                            |
| `2759934` | (superseded) Add crayon wax buildup + ship v11 grain                            |

**Files touched by `4c61ea9`:**

* `web/src/lib/drawing/brushRender.ts` — the crayon renderer. **v12 `crayonV12` is the shipped
  renderer** (`activeVariant.crayon = 12`). v3–v11 were **deleted** (kept v1 baseline, v2, v12).
* `web/src/lib/drawing/strokeOps.ts` — added `seed?: number` to the `dot` **and** `path` ops;
  **removed** all buildup machinery (`commandIsBuildup`, `commandDeviceRect`, `bakeBuildupRaster`,
  `renderCommand`, `renderCommandOps`, `cmdBuf`, `StrokeGroupCommand.buildupRaster`).
* `web/src/lib/drawing/engine.ts` — per-stroke `seed` plumbing (`nextStrokeSeed()` counter,
  `PointerState.seed`, stamped on both op kinds); **reverted** the snapshot/settle buildup
  machinery.
* `web/src/lib/drawing/undoHistory.ts` — reverted to op-by-op `renderOp` loops (dropped
  `renderCommand`/raster/`peekCommand`).
* `web/src/lib/drawing/commandSimplify.ts` — preserve `seed: first.seed` in rebuilt path spans.
* `web/tests/flows.spec.ts` — rewrote the crayon buildup E2E to assert **coverage** buildup.
* `docs/adrs/0065-...md` — rewrote the crayon-winner + wax-buildup follow-up sections.

## How v12 works (read the code, this is the map)

`web/src/lib/drawing/brushRender.ts` → `crayonV12` (and helpers `c12hash`, `c12HoleTile`,
`c12MottleTile`, cached `c12HolePat` / `c12MottlePat`).

* Per op: draw a **solid opaque wax body** (`paintOpShape`) onto a small **per-op offscreen bbox**
  (`opBounds` + shared `ensureScratch`/`scratch`), then **bite paper-tooth holes out of it**
  (`destination-out`) with a baked, canvas-anchored, **seed-phased** tooth mask, add a subtle
  **colour-independent black/white mottle** (`source-atop`) for waxiness, then blit the scratch
  `source-over` onto the target. Holes only *remove*, so nothing exists outside the stroke outline →
  edge frays into connected tooth bites, **no spray**.
* **Buildup = coverage, pure per-op (Option A).** Every op carries a per-stroke `seed`
  (engine-stamped, constant across one gesture, preserved through simplification). The tooth mask is
  phased by the seed:
  * **within a stroke** every op shares the seed → identical holes at the same canvas places →
    overlapping per-frame ops are **idempotent** (opaque over opaque): no joint beads, bit-identical
    replay;
  * a **later** stroke's different seed → its wax covers the first's holes → the overlap **fills
    toward solid at the same hue**. Live, gradual, no multiply/snapshot/raster.
* **No history-level buildup machinery** — undo/resize/export just loop `renderOp` over stored ops.

## Acceptance criteria we've added

1. **E2E — coverage buildup** (`web/tests/flows.spec.ts`, "crayon builds up — a second stroke fills
   the paper tooth, and undo lifts it"). Metric: **inked coverage** (fraction of the stroke's bbox
   with `alpha ≥ 150`). Draw a crayon line; draw it **again** (separate gesture → new seed) →
   coverage **rises** `> oneLayer*1.05`; **undo** → coverage drops `< twoLayers*0.95`. (Canvas is
   transparent where unpainted — tooth holes are transparent, so "paper" = low alpha, NOT light
   pixels. The old luminance-of-inked metric was wrong for the new semantics and was replaced.)
2. **Bit-identity** — `perf:units` (pen) must stay **0-px** ink mismatch after rebuild-from-ops.
   Currently 0/10 fail, worst shift 1px (normal simplification tolerance).
3. **Performance** (`perf:brush`, 4× CPU throttle, software GL): draw **avg ≲ 1.5 ms**, **max < ~6
   ms** (no dropped frame). Current v12: avg **1.13 ms**, max **5 ms**, undo 185 ms (heavy battery;
   keyframe safety-net ADR-0035 bounds real drawings). NB: undo replays every op through the
   offscreen path — watch this if strokes get more expensive.
4. **Qualitative (visual), judged against the Gemini references** — waxy body, **fine** paper tooth
   (not coarse/gritty), grain **contained** (no starburst/spray past the path), buildup **constant
   hue** (never darker than the crayon colour), no snap-on-lift.

## The adversarial judge — what it is and how much to trust it

The user asked to "look up pictures of crayon strokes or ask the Gemini image model … as prior art /
inspiration and also as an online judge of output." Implemented as `crayon-lab/` (see the code copy
in `docs/handoff/crayon-lab/`):

* **References (target):** `gen-refs.mjs` → `gemini-2.5-flash-image` produces three real-crayon
  photos (single / overlap / scribble). The **overlap** ref is the load-bearing one: it shows dense
  cores + fine speckled edges, and crossings that read **denser at the same hue** — the exact
  coverage-buildup target.
* **Judge:** `judge.mjs` → `gemini-2.5-flash` scores each render vs the refs on waxy / grain /
  containment / buildup + a critique + suggestions (JSON).

**Trust calibration (important):** the judge is **harsh and unreliable on absolute realism** — it
anchors on a macro photo and scored everything 2–3 even when the look was good. Its **buildup
detection is broken**: it repeatedly called clearly-working buildup "absent" and suggested making
overlaps *darker/more saturated*, which **contradicts the user's spec**. Do **not** chase its
buildup or waxy scores. Its **one reliable signal was `containment`**, which tracked the real
regression cleanly: **2 → 6 → 7** as the "spray" was fixed by switching from additive stamps to
body-with-holes-punched. Use the judge as a **regression signal + a way to keep the target
concrete**, and make final calls by **direct visual comparison** to the refs (and the user).

## Decisions made (and why) — including reverted approaches

* **Additive stamp fields → REJECTED.** v11 and the first three v12 attempts scattered opaque/─alpha
  marks. Any additive dots outside a dense core read as an **airbrush spray / starburst** (the
  user's complaint) and pure per-cell noise reads as **grit**. Lowering coverage to expose tooth
  made the spray worse; raising it made buildup invisible. Fundamental dead-end for "contained +
  toothy".
* **Body-with-holes-punched (offscreen dest-out) → CHOSEN (v12).** Holes only remove, so containment
  is free and the edge frays into connected bites. Fine tooth + real buildup + constant hue.
* **`multiply` / snapshot-settle / raster-cache buildup → REVERTED.** The previous approach
  (`2759934`) composited each crayon *command* with `multiply` and settled it on lift. That is the
  **snap-in, all-at-once, too-dark** behavior the user rejected. Coverage buildup via per-op
  seed-phased holes replaces it and needs **no** history machinery.
* **Tiling paper-tooth mask (384², sampled at canvas coords, seed-phased) → ACCEPTED**, with a
  caveat: ADR-0065 documents the "tiling trap" (v9/v10 had *visible* periodic autocorrelation at the
  tile size). v12's mask is **fine tooth smaller than the eye resolves**, sampled at canvas coords
  and phased per stroke — a different case from chunky periodic marks. **If a critic re-runs an
  autocorrelation pass, expect a peak at 384px** and be ready to justify it as sub-perceptual or
  move to a larger/non-repeating field.
* **Colour-independent mottle → CHOSEN over per-colour.** Black-pools + white-sheen at low alpha,
  `source-atop`, one baked tile → no per-colour bake hitch on a colour change.
* **Pattern caching → CHOSEN.** Cutting `createPattern`-per-op + a one-time bake dropped the max
  frame from 65 ms → 5 ms and avg 2.6 → 1.1 ms.
* **Pruned v3–v11 → CHOSEN.** ~1000 lines of dead design-iteration variants removed (story preserved
  in ADR-0065 + the contact sheet). Kept v1 (bench baseline), v2 (first shipped), v12 (winner).

## Unverified assumptions

* **Real-device perf.** All perf numbers are headless **software GL** (SwiftShader), which penalizes
  `drawImage`/patterns heavily; real GPU should be much cheaper, but the offscreen v12 has **not**
  been profiled on a phone. `undo 185 ms` (throttled) is the number to watch.
* **First-crayon-stroke bake.** The tooth + mottle tiles bake lazily on first crayon op (one-time
  ~tens of ms). Not measured as a discrete hitch; could pre-warm on brush select if it shows.
* **Look is "good enough"** is my visual judgment + the user's earlier direction, **not** signed off
  — the user says it "needs more iteration."
* Buildup within a **single continuous scribble** does **not** fill (same seed → idempotent). This
  is intentional (keeps a smooth stroke bead-free) but the user may or may not want a continuous
  scribble to also densify — **open question, ask.**

## Done & verified (commands run, results)

* `npm run check` → **0 errors / 0 warnings**.
* `npm run test:unit` → **440 passed**.
* `npm run test:e2e -- -g "crayon builds up"` → **pass** (the new coverage-buildup assertion).
* `npm run test:e2e -- -g "brush"` → **10 passed** (selector + magic-brush flows).
* `npm run perf:units -- --no-build` → **0/10 fail**, worst shift 1.00px (pen bit-identity holds).
* `npm run perf:brush -- --brush=crayon --variants=12` → avg **1.13 ms**, max **5.0 ms**, undo 185
  ms.
* `npm run format:check` → clean (prettier + dprint).

## Risks & next 3 steps

1. **Get concrete user feedback on what "needs more iteration"** — is it the tooth scale, the edge
   raggedness (v12's body edge is fairly clean vs the ragged reference), the density, the waxiness,
   or buildup strength? The single biggest visual gap vs the reference is **edge raggedness** (real
   crayon edges break more) and possibly **finer/subtler tooth**. Tunables in `crayonV12`:
   `C12_COARSE` (clump size), `C12_HOLE_LO/HI` (hole coverage), the mottle alphas, and the tooth
   `fine` weight. Re-run `render.mjs` + eyeball vs refs after each change.
2. **Decide the single-continuous-scribble buildup question** (Unverified assumptions) — if the user
   wants a continuous scribble to densify too, the seed would need to vary *within* a stroke (which
   reintroduces the join-bead risk — needs care, likely a separate low-frequency phase, not per-op).
3. **Profile v12 on a real device** (or at least sanity-check undo on a large real drawing) before
   calling perf done; consider pre-warming the tile bake on brush-select if the first stroke
   hitches.

## Reread first

* `web/src/lib/drawing/brushRender.ts` — `crayonV12` + `c12*` helpers (the renderer).
* `web/src/lib/drawing/engine.ts` — `nextStrokeSeed()` / `PointerState.seed` / op stamping.
* `docs/adrs/0065-brush-modes-per-op-render-dispatch.md` — "crayon redesign … + wax buildup"
  follow-up (the full story + the tiling-trap warning).
* `web/tests/flows.spec.ts` — "crayon builds up …" (the coverage acceptance test + its metric note).
* `docs/handoff/crayon-lab/` — the reference/judge/render/contact-sheet scripts + README (how to
  run).
* `docs/handoff/crayon-iterations-contact-sheet.png` — v1→v12 journey + refs + final scenes at a
  glance.
* Perf/harness: `scripts/perf/brush-bench.mjs` (`perf:brush`), `scripts/perf/stroke-units.mjs`
  (`perf:units`), `scripts/perf/brush-contact-sheet.mjs` (`perf:brush:sheet`).
