# Idea 5 — De-swirl the two flat-pupil pages (nature/caterpillar-wide, ladybug-wide)

**Verdict: WORKED** — the mechanism was proven end-to-end on `nature/caterpillar-wide`:
deterministic (sharp/SVG, zero-API) de-swirl of the pen eyes → regenerated light fill,
chalk, and night fill → the eyes audit flips `caterpillar-wide` night from
`FAIL (2 eye(s) flat)` to `ok`, with every registration/outline audit green.
7 of the 8 budgeted Gemini calls were used (1 light + 1 chalk + 5 night attempts).

## What the "flat pupil" actually is (diagnosis)

The status table (`pipeline.md`) frames it as "the fill model refuses to paint a
spiral's interior dark". Empirically the shipped failure is one step downstream:

1. The pen eyes on both `-wide` pages are **welded spirals**: eyeball ring → pupil
   ring → catchlight are tangent/merged (ladybug's are literal one-stroke spirals;
   caterpillar's are tangent-welded rings, and its eyeball ring even has a spiral
   opening at its lower-left where the stroke curls out of the eye).
2. That weld **collapses the nested-region topology** `lib/eye-fill.mjs` needs:
   `findEyeCores` on the shipped pen found only the 2 tiny catchlight interiors —
   **no pupil-interior cores** (a proper eye yields two cores, cf. caterpillar-tall's 5).
3. With no dark pupil core to protect, the **chalk generator's eye-polarity gate had
   nothing to enforce**, and the shipped chalk whitens the *whole eyeball, pupil
   included* (solid ink in storage).
4. The night **punch masks with the chalk**, so even a night raw with a perfectly
   painted dark pupil (the shipped `caterpillar-wide.night.raw.webp` has one!) gets
   its pupil cleared and screened over by solid chalk white → **flat white eyeballs**
   in the final dark-mode composite. That's what `gen:coloring-fills:audit:eyes`
   flags (`night FAIL (2 eye(s) flat)`), and what a child sees.

So the durable fix is exactly what IDEAS.md named — fix the pen, regen the suite —
but the causal chain runs pen → *detector topology* → *chalk polarity gate* → punch,
not pen → fill refusal. (The ≥11 failed fill attempts recorded pre-fork were the
same root cause seen from the other side: gates judged eyes on composites the chalk
had already doomed.)

Two related audit blind spots found:
- `gen:coloring-outlines:audit` does NOT flag these eyes: ring depth is 4 (≤ 4 bar) —
  a spiral is tangent circles, not extra *nested* circles — and there are no solid
  regions. So the normalizer would skip these pages without `--force`, and no gate
  measures "spiralness". Detection heuristic that does work: **a face page whose pen
  yields catchlight cores but no pupil-interior cores** (or simply < 2 cores per eye).
- `snail-wide`'s 1-core flag in the status table is the same smell, judged fine on
  review.

## What was tried

### 1. Gemini normalizer route — not attempted, and it needs `--force`
`caterpillar-tall` was de-swirled via the normalizer (commit `551ab52`, t 0.2 +
"CHANGE NOTHING ELSE ANYWHERE"), but it *failed* the ring-depth gate at depth 5, so
the normalizer engaged. The `-wide` pages **pass** the audit (depth 4), so
`gen:coloring-outlines:normalize` skips them unless `--force`d — and, once forced, an
unchanged echo of the source would pass every gate (nothing measures the spiral), so
the outcome rides entirely on `--notes` + human review. I went deterministic instead
to save the API budget for the downstream proof.

### 2. Deterministic sharp/SVG surgery (worked — `code/idea5-deswirl.mjs`)
Erase each eye's interior with an ellipse fitted just inside the eyeball ring, then
draw the caterpillar-tall two-circle treatment: one thin pupil ellipse + one small
**detached** catchlight circle, with >= 2.5 px clearance everywhere so no antialias
weld (ink threshold: luma < 150) can rebuild the spiral. Iterations that failed first:
- **Too-tight geometry**: pupil rx 13 / catchlight r 5.5 welded to neighboring rings
  through antialias and re-broke the topology on one eye (detector: 1 core). Final
  geometry: pupil rx 9 / ry 13.5 / stroke 4.5; catchlight r 3 / stroke 2, offset
  slightly up; clearances >= 2.5 px verified numerically.
- **Flood-based "keep only the eyeball ring" erase**: unreliable — the outside-white
  flood leaks *into* the sclera through the spiral's opening in the outer ring, so
  inside/outside can't be distinguished by connectivity on these pages.
- Weld nubs left where old strokes met the eyeball ring are harmless: open strokes
  create no enclosed regions, so detector topology and ring depth are unaffected, and
  visually they read as minor shading.
- ASCII luma maps (`code/idea5-ascii.mjs`, the technique `pipeline.md` documents) were
  the only reliable way to measure the stroke geometry; step-2 sampling misleads —
  measure at full resolution before trusting a reading.

Result on the edited pen (all offline, deterministic):
- `findEyeCores`: 2 → **4 cores** (pupil interior + catchlight per eye)
- ring depth 4 (passes), solidity passes (blob 0)
- registration vs shipped pen: forward keep **100.0 / local 100.0**, reverse
  **99.87 / local 97.56** — no pipeline gate anywhere would reject this edit.

### 3. Suite regeneration on the new pen (7 Gemini calls total)
- **Light fill** (1 call): passed all gates first try — keep 100 / local 100 /
  white 0.1%. Classic lively eyes (dark pupil, white catchlight). Note: the old light
  raw was *never* the problem, but regenerating it first matters — the chalk gate's
  polarity reference is the committed light raw, which must correspond to the new pen.
  (I temporarily set `MAX_ATTEMPTS = 2` in `gen-coloring-fills.mjs` to bound API use;
  reverted.)
- **Chalk** (1 call): `gen:coloring-chalk -- nature/caterpillar-wide --apply --force
  --max-attempts 3` passed first try — keep 99.1 / local 83.4 / white 0.5% (vs the
  whole-eyeball whitening before). The new chalk keeps a **fillable pupil** with a
  chalk-ink catchlight inside it — the owl-style best case. Only warning: "eye whites
  not chalked (1)", the known warn-only polarity direction.
- **Night fill** (5 calls, 2 runs): both runs produced takes with **lively eyes** and
  good night traits (bgLuma 32-40, lineW 255). Best take drift 0.0056 vs the 0.004
  bar (take 1: 0.0111) — the drift is invented bright marks (antenna-tip glow), not
  eye-related. With a normal budget (`--max-attempts 8`) this would very likely clear;
  the visual composite is already clean and the eye gate passes.
- **Punch** (offline): shipped `.light.webp` / `.night.webp` re-derived.

### 4. Verification (all offline)
- `gen:coloring-fills:audit:eyes -- nature`: caterpillar-wide **night FAIL → ok**
  (4 cores / 4 lively / light ok / night ok).
- `gen:coloring-fills:audit -- nature`: 0 flagged; both new raws 100/100.
- `gen:coloring-outlines:audit -- nature`: all ok.
- Simulated final composites (`lib/night-composite.mjs`): before = flat white
  eyeballs with a grey fleck; after = deep navy pupils + white catchlights + sclera.

## Evidence (same views before/after)

| View | Before | After |
| --- | --- | --- |
| Pen eyes (spiral vs two-circle) | `before-cw-pen-eyes-zoom.png` | `after-cw-pen-eyes-zoom.png` |
| Chalk eyes, stored ink-on-white (solid eyeball vs fillable pupil) | `before-cw-chalk-eyes-zoom.png` | `after-cw-chalk-eyes-zoom.png` |
| Night composite, eyes (the shipped flat-pupil failure vs fixed) | `before-cw-night-composite-eyes.png` | `after-cw-night-composite-eyes.png` |
| Night composite, full page | `before-cw-night-composite-full.png` | `after-cw-night-composite-full.png` |
| Light raw eyes | `before-cw-light-eyes-zoom.png` | `after-cw-light-eyes-zoom.png` |
| Ladybug-wide (page 2, untouched): true spiral pen eyes + flat night | `before-lw-pen-eyes-zoom.png`, `before-lw-night-composite-eyes.png` | — |
| caterpillar-tall pen eyes (the de-swirl template) | `template-ct-pen-eyes.png` | — |

## Limitations

- **Ladybug-wide was not attempted** (budget). Its eyes are *literal one-stroke
  spirals* (see `before-lw-pen-eyes-zoom.png`) — messier than caterpillar's tangent
  rings. The same erase-and-redraw works in principle (interior erase + two-circle
  redraw does not care what the old interior was), but the eyeball ring itself is
  part of the spiral, so expect to redraw the outer ring too, or to leave a
  spiral-tail nub; geometry must be re-measured (eyes ~ x[555-600] and x[680-730],
  y[540-600]).
- The best night take carries drift 0.0056 (> 0.004): antenna-glow marks, not
  eyes. A couple more attempts (or `--notes` "no glow around the antennae") should
  clear it before a real ship.
- Thumbs were not regenerated (offline `gen:coloring-thumbs`, trivial) — a real ship
  regenerates thumb + light + chalk + night + punch per `pipeline.md`.
- The surgery constants are hand-measured for caterpillar-wide's eye geometry; the
  script is an experiment artifact, not a general tool.
- Everything was reverted; nothing is committed. To reproduce: run
  `code/idea5-deswirl.mjs` from `tools/asset-gen/` (writes the candidate to
  `.coloring-samples-dark/idea5/`), copy over the pen, then light → chalk → night →
  punch as above.

## Recommendations for the real two-page fix

1. Budget ~12-16 Gemini calls: per page, light 1-2, chalk 1-3, night 3-8 (the drift
   gate is the long pole, not the eyes).
2. Do caterpillar-wide with the surgery script as-is (validated here); for
   ladybug-wide either re-measure and extend the surgery (redraw the outer ring as an
   SVG ellipse — registration tolerance +-2 px at 512 gives ~6 px of native slack), or
   use the normalizer with `--force`, t <= 0.3, and notes demanding the two-circle eye
   and "CHANGE NOTHING ELSE ANYWHERE", verifying de-swirl by `findEyeCores` count
   (>= 2 cores per eye), which no existing gate checks.
3. Wire nothing in `books.ts` — both pages are already cataloged; this is pure asset
   regen.
4. Worth adding to the outline audit: flag face pages where an eye cluster yields a
   catchlight core without an enclosing pupil-interior core (the "spiral smell") —
   it would have caught both these pages and snail-wide.
