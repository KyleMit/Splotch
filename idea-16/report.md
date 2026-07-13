# Idea #16 — Night fill as a recolor edit of the light raw (bake-off report)

**Verdict: PARTIAL.** The recolor-edit path decisively wins registration, line polarity, and
light↔night palette coherence — but it consistently loses the thing night fills exist for: the
*mood*. Every take came back 20–40 luma brighter than the shipped night with grey-slate skies and
desaturated, muddy subject colors, and three prompt generations (plus an explicit all-caps `--notes`
lever) could not fully fix it. Not ready to replace the chalk-conditioned default; very promising as
a palette-coherence ingredient.

## Setup

* **Edit input:** the **shipped punched light fill** (`web/static/coloring/**/*.light.webp`), per
  prior art from idea-run #8 (the light *raw* is known-dead: its black outlines made Gemini re-ink
  dark lines 7/7). The punched fill is outline-free flat color, so there is no black line for the
  model to copy.
* **Model:** `gemini-2.5-flash-image`, low temperature (0.3–0.5), 8 calls total (budget cap).
* **Harness:** `code/idea16-recolor-night.mjs` (ran from `tools/asset-gen/`, deleted from the repo
  afterwards). Pipeline mirrors `gen-coloring-fills-dark.mjs`: resize to page dims → `alignToSource`
  against the chalk → standard gates (`scoreDrift`, `scoreNightness`, `scoreLineColor` copied
  verbatim) → eye gate on the simulated final composite (`compositeNight` + `judgeNightEyes` vs the
  light raw's eye cores). Two experiment-specific metrics added:
  * **lineBand** — fill luma directly under the chalk's ink (median + frac < 50): detects dark
    re-inking on a fills-only image, where `scoreLineColor`'s ≥150 bar is inapplicable (see below).
  * **paletteCoherence** — median circular hue distance light↔night over chromatic subject pixels
    (background and chalk ink excluded), plus `recoloredShare` = fraction of pixels whose hue moved
    > 60°.
* **Fair baseline:** the shipped `.night.webp` (also punched/fills-only) scored with the exact same
  metrics, and both sides judged on the same `compositeNight` render.

### A structural note on the gates

The raw night path's `scoreLineColor ≥ 150` bar assumes the fill carries its own **white outlines**.
A recolor of the *punched* light fill produces a **fills-only** image — there are no lines in it at
all, by construction, and none are needed: the chalk owns the lines and the punch clears the fill
under them (the train-wide precedent in `pipeline.md`). So `lineWhite` is recorded but meaningless
on this path for both sides (shipped punched nights themselves score 73–167). Line polarity is
instead judged by `lineBand.fracBlack` + visual composite: did the model paint near-black ink
under/near the line positions?

## Scorecard

All fills-only images scored against the page's chalk; eyes on the simulated composite.
`hueMed`/`recolored` = palette coherence vs the shipped light fill (lower = more coherent).

### nature/ant-wide (the blanket)

| take              | drift | bgLuma   | lineW | band fracBlack | hueMed   | recolored | eyes |
| ----------------- | ----- | -------- | ----- | -------------- | -------- | --------- | ---- |
| **shipped night** | 0     | **63.9** | 167   | 0.048          | 61.2°    | **50.4%** | pass |
| recolor v1 t=.35  | 0     | 89.9     | 87    | 0.200          | **3.6°** | **0%**    | pass |
| recolor v1 t=.50  | 0     | 90.0     | 87    | 0.190          | 6.5°     | 0%        | pass |
| recolor v2 t=.35  | 0     | 69.9     | 71    | 0.448          | 7.6°     | 0%        | pass |

The idea's headline case confirmed: the shipped night repaints the red/white picnic blanket
teal/navy (recoloredShare 50%); every recolor take keeps it red/white, just darkened. Eyes lively in
all takes. But v1's sky is slate-grey and the ant's face goes grey-brown vs the shipped warm peach;
v2 darkens (bgLuma 70) yet stays duller than shipped.

### farm/duck-wide

| take                          | drift | bgLuma   | lineW | band fracBlack | hueMed   | recolored | eyes         |
| ----------------------------- | ----- | -------- | ----- | -------------- | -------- | --------- | ------------ |
| **shipped night**             | 0     | **48.8** | 108   | 0.154          | 14.2°    | 5.6%      | **FAIL (1)** |
| recolor v1 t=.35              | 0     | 73.4     | 76    | 0.331          | **4.5°** | **0%**    | pass         |
| recolor v2 t=.35              | 0     | 76.7     | 77    | 0.434          | 15.0°    | 10.3%     | FAIL (1)     |
| recolor v3 (dark notes) t=.30 | 0     | 68.2     | 69    | 0.519          | 6.1°     | 1.3%      | pass         |

Note the *shipped* night fails the automated composite eye gate (it shipped via human adjudication —
`pipeline.md` documents flat-eye warnings as routine), so eye scores here are comparative, not
absolute. The duck is this path's clearest quality loss: the shipped night keeps a warm yellow duck;
every recolor take turns it **olive/tan** ("dimmed yellow" = mud), even v3's explicit `--notes`
"stays WARM GOLDEN YELLOW, never olive". v3 did fix the sky (proper navy-indigo, bgLuma 68) and the
eyes.

### vehicles/train-wide (hardest line-polarity case)

| take              | drift | bgLuma   | lineW | band fracBlack | hueMed   | recolored | eyes     |
| ----------------- | ----- | -------- | ----- | -------------- | -------- | --------- | -------- |
| **shipped night** | 0     | **38.7** | 73    | 0.319          | 53.5°    | **38.3%** | FAIL (1) |
| recolor v1 t=.35  | 0     | 70.8     | 58    | 0.545          | **7.9°** | **0%**    | FAIL (1) |
| recolor v2 t=.35  | 0     | 90.6     | 70    | 0.438          | 14.3°    | 0%        | FAIL (1) |

The polarity stress test **passed trivially**: with a punched (line-free) input there is nothing to
flip, and no take re-inked dark outlines anywhere (composites clean, no dark halo ringing; the
elevated fracBlack is the train's own dark-at-night body under the lines, same regime as the shipped
punched night's 0.32). Coherence again massive: the shipped night repaints the blue train dark-red
(38% recolored); the recolor keeps it blue/red. Both sides fail the same 1 eye core on the composite
judge. But mood: shipped is a genuinely dark moonlit scene (bgLuma 39); the recolors are grey-slate
dusk (71–91).

## Aggregate

| Axis                            | Winner                                                              | Evidence                                                                                                                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registration                    | **recolor** (slightly)                                              | drift = 0.000 on all 6 takes; model nudge 2–8 px fully undone by `alignToSource`. Registration really is inherited from the shipped light asset.                                                                                                     |
| Line polarity                   | **recolor** (by construction)                                       | 0/6 takes re-inked dark lines — the known-dead failure of the raw-input variant never appears with a punched input.                                                                                                                                  |
| Palette coherence               | **recolor** (massive)                                               | hueMedian 3.6–15° / recoloredShare 0–10% vs shipped 14–61° / up to 50%.                                                                                                                                                                              |
| Eye structure                   | tie-to-recolor                                                      | ant 3/3 pass; duck 2/3 pass (shipped: fail); train fails the same single core as shipped. Pupils inherit from the light fill; chalk owns sclera/catchlight.                                                                                          |
| Gate pass rate (standard gates) | recolor 6/6 within bars (drift ≤ .004, bgLuma ≤ 100, lineColor N/A) | but "passes the bar" ≠ "as good as shipped"…                                                                                                                                                                                                         |
| **Night mood**                  | **shipped chalk-conditioned path, clearly**                         | recolor bgLuma 68–91 vs shipped 39–64; slate-grey skies (v1), muddy desaturated subjects (all versions); duck olive vs warm yellow; #8's "conditioned nights trend brighter" applies *harder* here — the model anchors on the bright daylight input. |

## What was tried, prompt-wise

1. **v1** — "repaint as cozy moonlit night, same hue dimmed and cooled, change colors only": perfect
   structure, but "dimmed" reads as *greyed* — slate skies, ashen faces, olive duck.
2. **v2** — jewel-tone demands ("DEEP RICH SATURATED midnight blue… VIVID, never muddy, never olive
   sludge"): moderately better (blue pond, blue/red train survive), skies still slate, duck still
   olive, ant improved to bgLuma 70.
3. **v3** — v2 + page `--notes` ("MUCH DARKER THAN YOU THINK… almost black sky… duck stays WARM
   GOLDEN YELLOW, never olive"): sky finally a real navy and bgLuma 68 (closest to shipped), eyes
   recovered — duck *still* olive. The subject-desaturation bias survived every escalation level the
   pipeline's own playbook uses.

Determinism note: two same-prompt takes at t 0.35/0.50 (ant) scored near-identically — this edit is
highly deterministic, so extra same-prompt takes are low-information; prompt changes are the lever,
not the temperature ladder.

## Limitations

* 8-call budget: no test of a **two-image variant** (punched light fill + the chalk's white-on-black
  display as a second reference — could anchor darkness the way the chalk input does today), no
  per-part COLOR PLAN text (idea #9), no test on a tall page or a dark-bodied subject (spider).
* Output is **fills-only, not a raw**: it cannot drop into `fill-src/` as a `.night.raw.webp` (the
  punch expects outlines intact; the drift audit scores raw registration). Adopting this path means
  either shipping the output as an already-punched fill (breaking the "raws are the source of truth"
  invariant and blinding `gen:coloring-fills:audit`) or defining a new asset class — a real
  architecture cost the idea text glossed over.
* Palette-coherence metric samples chromatic pixels only (chroma > 25 both sides); a fill that
  desaturates to near-grey escapes the hue comparison — exactly the recolor path's failure mode, so
  its coherence wins are, if anything, slightly flattered.
* Eye gate on composites is noisy (2 of 3 *shipped* nights fail it); treated comparatively.

## Recommendation

**Do not make this the default night path yet.** It fixes the three things it promised
(registration, polarity, coherence — #8-free) but regresses the core deliverable — a genuinely dark,
warm, moonlit scene — and the regression resisted the full prompt-escalation playbook. The
chalk-conditioned path's nights are simply better-looking on all 3 bake-off pages.

Worth pursuing next (cheap, decisive follow-ups):

1. **Hybrid conditioning:** feed the current chalk-conditioned generator the punched light fill as a
   *second* input image ("use this daytime version's palette, darkened") — keeps the chalk's
   darkness anchor while importing the recolor path's coherence. The highest-value experiment this
   run had no budget for.
2. **Recolor as COLOR PLAN source:** run the (cheap, highly deterministic) recolor once, extract
   per-region hues, and inject them as a text COLOR PLAN into the existing night generator (idea #9
   synergy).
3. If the recolor path is ever adopted, add a **saturation/darkness post-gate** (subject chroma vs
   the light fill, bgLuma ≤ ~65) — the standard nightness bar (≤ 100) passed takes that visibly read
   as overcast daytime.

## Evidence files (long side 480 px)

Per page: `{page}.light-ref.webp` (shipped light + pen, palette reference),
`{page}.before-shipped-night.webp` (shipped night composite), `{page}.after-recolor-night.webp`
(best recolor take composite — ant v2, duck v3, train v2). Failure-mode extras:
`ant-wide.recolor-v1-grey.webp`, `duck-wide.recolor-v1-desaturated.webp`. Full-resolution takes and
all composites are in `work/`.
