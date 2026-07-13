# Idea #17 — Model bake-off: flash-image vs the pro image tier

**Verdict: WORKED.** A real second (and third) image model exists on this key. The reduced bake-off
ran end-to-end on all three named hard pages with the production gates, inside the 12-call budget
(exactly 12 Gemini image calls). There is a clear winner: **`gemini-3.1-flash-image` cleared all
three failure classes that are tuned around in the current pipeline** — no re-inking, no
whiten-everything misfire, no global nudge, zero drift. The pro tier (`gemini-3-pro-image`) fixed
re-inking too but introduced its own failure (invents/extends geometry → drift gate) and under-edits
chalks (gate-passing null edit), so it is *not* the better default.

## 1. Available image models on this key (list-models, free)

`GET /v1beta/models` (2026-07-13) — image-output models (`generateContent`):

| Model                                 | Notes                                                                |
| ------------------------------------- | -------------------------------------------------------------------- |
| `gemini-2.5-flash-image`              | current pipeline default (everything tuned on its 2026-07 behavior)  |
| `gemini-3-pro-image` / `-preview`     | the pro image tier the idea asked about                              |
| `gemini-3.1-flash-image` / `-preview` | newer flash image tier                                               |
| `gemini-3.1-flash-lite-image`         | lite tier (not tested — budget)                                      |
| `nano-banana-pro-preview`             | (not tested — budget)                                                |
| `imagen-4.0-*`                        | `predict` only, not an image-*edit* API — unusable for this pipeline |

## 2. Design of the reduced bake-off

* The three named pages map onto **two generators**: train-wide re-inking and caterpillar-wide eye
  flooding are night-fill classes (`gen-coloring-fills-dark.mjs`), rectangle-wide's
  whiten-everything misfire is a chalk class (`gen-coloring-chalk.mjs`).
* One-line temporary patch:
  `const MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image'` in both generators
  (reverted after the runs). Everything else — prompts, gates, thresholds, alignment — is the
  production path.
* Night fills: `--samples 2 --max-attempts 1` (exactly 1 API call per take, no retry ladder, so raw
  per-take behavior is visible). Chalk: `--force --max-attempts 2`, **without** the `--notes` that
  the shipped rectangle chalk needed, to test the misfire tendency raw.
* flash-2.5 baselines: the documented signatures (train lineW 51–105 through ~27 attempts;
  caterpillar flat-eye ships; rectangle misfire needed a `--notes` retry), the SHIPPED raws rescored
  offline with an identical-math harness (`code/bakeoff-idea17.mjs`, parity-checked against the
  generator's own output), plus 2 fresh flash-2.5 confirmation takes on train-wide.

Call ledger (12 total): pro fills 4 + pro chalk 1 + 3.1 fills 4 + 3.1 chalk 1 + flash-2.5
confirmation 2.

## 3. Scorecard

### vehicles/train-wide — night fill (re-inking class). Gates: drift ≤ 0.004, bgLuma ≤ 100, lineW ≥ 150

| Model / take                        | drift      | bgLuma | lineW   | shift     | eyes   | pass (ex-eye)                                    |
| ----------------------------------- | ---------- | ------ | ------- | --------- | ------ | ------------------------------------------------ |
| shipped raw (2.5, best-of-many era) | 0.0000     | 39     | **75**  | —         | 1 flat | ✗ lineW (shipped anyway; composite renders fine) |
| flash-2.5 fresh t1                  | 0.0000     | 35     | **107** | 0,0       | 1 flat | ✗ re-inked — signature reconfirmed live          |
| flash-2.5 fresh t2                  | 0.0009     | 48     | 255     | **−5,−2** | 1 flat | ✓ (nudge corrected by alignToSource)             |
| 3-pro t1                            | **0.0188** | 42     | 255     | 0,0       | 1 flat | ✗ drift                                          |
| 3-pro t2                            | **0.0620** | 43     | 255     | 0,0       | 1 flat | ✗ drift                                          |
| 3.1-flash t1                        | 0.0000     | 33     | 255     | 0,0       | 1 flat | ✓                                                |
| 3.1-flash t2                        | 0.0000     | 30     | 255     | 0,0       | 1 flat | ✓                                                |

* The "1 flat eye" warning is **identical across every model and the shipped asset** — the known
  routine non-face-core warning on vehicles (pipeline.md), not a differentiator.
* **Both new models never re-ink** (lineW 255 on all 4 takes vs 2.5's 51–107 habit on this page).
* **Pro's drift is real, not noise**: the overlay (`images/train-drift-pro.webp`) shows it
  *extending the rails past where the source line art stops* plus stray cloud strokes. Take 2 also
  has a gradient sky (prompt asks flat fills).
* Neither new model needed the alignToSource nudge on any take; fresh 2.5 rolled a −5,−2 nudge.

### nature/caterpillar-wide — night fill (eye-flooding class)

| Model / take      | drift           | bgLuma  | lineW     | eyes   |
| ----------------- | --------------- | ------- | --------- | ------ |
| shipped raw (2.5) | 0.0002          | 33      | **127**   | 2 flat |
| 3-pro t1 / t2     | 0.0000 / 0.0000 | 43 / 37 | 255 / 255 | 2 flat |
| 3.1-flash t1 / t2 | 0.0000 / 0.0000 | 23 / 27 | 255 / 255 | 2 flat |

* Eye verdicts are **identical for every model including the shipped raw** — and the composite
  render (`images/caterpillar-eyes.webp`) shows why: **the failure lives in the shipped CHALK, which
  whitens the eyeballs; the punch/composite makes the chalk win**, so no fill model can change the
  outcome. Both challengers actually painted *lively* raw-fill eyes (white sclera, dark pupil,
  catchlight) — arguably better fills than what shipped. This class is **asset-owned, not
  model-owned**: the durable fix remains de-swirling the pen eyes (IDEAS #5) and re-chalking.
* Incidentally both challengers also beat shipped lineW here (255 vs 127).
* Minor pro quirk: it repainted some deliberate chalk whites (antenna tips) with color; 3.1-flash
  left every chalk white untouched. (Survivable — the punch restores whites — but it's the same
  "does its own thing" tendency as the drift.)

### shapes/rectangle-wide — chalk, NO --notes (whiten-everything class). Gates: keep/localKeep, invented ≤ 0.01, whiteFrac ≤ 10%

| Model                                   | keep | localKeep | whiteFrac | invented | outcome                                                                                                        |
| --------------------------------------- | ---- | --------- | --------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| shipped (2.5, needed a `--notes` retry) | 100  | 100       | 1.1%      | 0        | baseline                                                                                                       |
| 3-pro, attempt 1                        | 100  | 100       | **0.0%**  | 0        | gates PASS but **null edit** — whitened nothing, returned the input                                            |
| 3.1-flash, attempt 1                    | 100  | 100       | **1.27%** | 0        | **proper chalk, first try, no notes** — whitened the ring annuli exactly like the notes-assisted shipped chalk |

* The whiten-everything misfire did not appear on either new model.
* Pro's null edit is a **new failure signature the gates don't catch** (whiteFrac 0 passes; the
  eye-polarity check only *warns* on missed whites, and on this page the light-raw reference doesn't
  trip it at all). If pro were ever adopted for chalks, a `whiteFrac > 0` floor (or whitesMissed as
  a hard gate) would be needed on pages with known whites.

## 4. What was tried and what happened

1. **List-models discovery** — one free HTTP call; found the pro tier + two newer flash image tiers.
2. **Env-var model override** on the two generators — worked immediately; both new models accept the
   identical prompt/config path (temperature config included) with no API changes.
3. **The bake-off runs** — all 12 calls succeeded, no 503s, no safety blocks.
4. **Offline rescore harness** (`code/bakeoff-idea17.mjs`) — copies the generators' exact scoring
   math so shipped raws and saved takes land on one scorecard; parity-checked (differences only from
   webp re-encode of saved samples, ≤ 0.0005 drift / ≤ 5 lineW).
5. **Visualizers** (`code/bakeoff-vis-idea17.mjs`) — night-composite render and drift-pixel overlay;
   these turned two ambiguous numbers into explanations (chalk-owned eye flooding; pro's rail
   extension).

## 5. Recommendation

* **Candidate new default: `gemini-3.1-flash-image`** for both night fills and chalks. On the three
  hardest pages it passed every model-owned gate on the first take with no page-specific notes —
  behavior 2.5 needed ~27-attempt ladders, `--notes`, and `--dilate-lines` to approximate. Before
  switching the `MODEL` constants (5 files: gen-coloring-fills{,-dark}, gen-coloring-chalk,
  gen-style-covers, normalize-outline-strokes — and `web/src/lib/server/ai/gemini.ts` is a separate
  app-side decision), run a broader validation: one full category light+night+chalk, plus re-tune
  the attempt budget DOWN (default 3–4 attempts may be wasteful now) per pipeline.md's "Model drift"
  note.
* **Do not route to `gemini-3-pro-image`**: it solves re-inking but adds invented/extended geometry
  (drift-gate failures on 2/2 train takes), gradient backgrounds, chalk null edits, and repainted
  chalk whites. No page class observed here favors it, so no routing table is needed — a straight
  default swap beats routing.
* **The caterpillar/ladybug eye class is not a model problem** — no bake-off will fix it; de-swirl
  the pen eyes and regenerate the suites (IDEAS #5).
* If 3.1-flash is adopted, revisit now-unneeded mitigations: the temperature ladder,
  `--dilate-lines`, and the shipped-despite-lineW-fail exceptions (train-wide's night raw could
  simply be regenerated clean — its lineW went 75 → 255 twice here).

## 6. Limitations

* 2 takes/page/model (the idea's own reduced cap), one page per failure class — signatures were
  consistent within and across pages, but this is a screen, not a proof; the 5-take version on a
  full category should precede a default swap.
* `gemini-3.1-flash-lite-image` and `nano-banana-pro-preview` were not exercised (budget).
* The chalk misfire test ran only on rectangle-wide; caterpillar's chalk-side eye flooding was
  diagnosed from the composite, not re-generated with the new models (budget went to the fill-side
  takes).
* Pricing/quota of the new tiers was not evaluated (list-models doesn't expose it).

## Evidence

| File                                                                          | Shows                                                                                                         |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `images/train-night-4up.webp`                                                 | the re-inking class: fresh 2.5 re-inked take + shipped lineW-75 raw vs pro/3.1 white-line takes               |
| `images/train-drift-pro.webp`                                                 | pro's drift pixels (red): rails extended past the source line art                                             |
| `images/caterpillar-eyes.webp`                                                | both challengers' lively raw-fill eyes vs the chalk-flooded composite + the chalk input that owns the failure |
| `images/rectangle-chalk-3up.webp`                                             | shipped notes-assisted chalk vs pro's null edit vs 3.1's correct no-notes chalk                               |
| `images/train-flash25-take.webp` / `images/train-flash31-take.webp`           | full-size before/after of the re-inking class                                                                 |
| `images/rectangle-pro-display.webp` / `images/rectangle-flash31-display.webp` | full-size chalk displays (null edit vs correct)                                                               |
