# ADR-0117: Composition-anchored generation prompt, held by a measured adherence lab

**Status:** Active **Date:** 2026-08

## Context

`gpt-image-2 · low` (ADR-0113's pick) has a strong prior toward poster composition: under the
original "Reimagine this child's drawing as a polished, magical illustration" prompt it routinely
enlarged the child's subject, pulled it to the center, attached separated elements (a drawn sword
floated apart from the figure; the render put it in the figure's hand), and swallowed a thin ground
line into a full grass field. Gemini kept layouts nearly verbatim under the same prompt, so the
failure is a model-specific reading of "reimagine" — and for a toddler, the picture stops being
*their* drawing when their layout dissolves.

Fixing this by eye alone doesn't hold: composition drift is stochastic (the same prompt scored 16-81
across samples on one input), so any prompt comparison needs a measurement that survives restyling.
Pixel diffing is meaningless — a good generation repaints every pixel. Alternatives considered:

* **`input_fidelity: 'high'` on the image tool** — rejected: `gpt-image-2` 400s on the parameter
  (despite SDK docs saying "gpt-image-1.5 and later"), and carrying it on `gpt-image-1.5 · low`
  measured *worse* adherence than prompt wording alone (71.3 vs 85.4 mean) at 3.6× the cost.
* **Bolting "do not move things" rules onto the existing prompt** — helps (63.6 → ~81-83 for the
  layout-lock/anchor suffixes) but stays noticeably behind reframing the task itself, and sample
  variance stays high.
* **A strict "paint over it, leave empty areas empty" rewrite** — highest adherence measured (91.6)
  but timid: backgrounds stay bare paper, losing the sky/water/ground washes that make the result
  feel alive.

## Decision

Two coupled things, both under `tools/model-eval/`:

1. **`DEFAULT_PROMPT` (`web/src/lib/ai/prompt.ts`, mirrored in
   `tools/model-eval/lib/model-eval.mjs`) now opens by framing the task as painting directly over
   the child's drawing** — "the finished picture lines up with the original: every shape stays
   exactly where the child drew it, at exactly the size the child drew it" — keeps the flat-fill
   guidance, and closes with an atmosphere license: open background may gain sky/light/water/ground
   washes, never new objects or characters. Measured 85.4 mean composition score over a 19-input
   sweep against the legacy prompt's 63.6, while keeping rich backgrounds and the coloring-book
   categories intact (published side-by-side: `scrapbook/model-eval/prompt-adherence/`).

2. **Prompt changes to the generation path are measured, not eyeballed**: the prompt-adherence lab
   (`npm run model-eval:adherence`, `tools/model-eval/run-prompt-adherence.mjs`) re-generates
   candidate arms over the sparse-composition corpus and scores each output with
   `tools/model-eval/lib/composition-score.mjs` — chance-normalized chamfer of input ink edges
   against the output edge map (with a drift-naming best-transform search) plus per-palette-color
   element matching (centroid shift, scale factor, wash-vs-compact classing). The scorer is locked
   by unit tests; the lab retains the legacy prompt and every rejected arm so future candidates are
   compared against everything already tried.

The gotcha to preserve: the "lines up with the original" sentence is the load-bearing phrase.
Softening it back toward "keep the composition intact" (the legacy wording already said that!) is
exactly the regression the lab exists to catch — one stray sentence moved the mean by 22 points.

## Consequences

* \+ The child's layout survives generation: subjects stay put at their drawn size, separated
  elements stay separate, and open paper becomes atmosphere rather than invented scenery.
* \+ Prompt work on the generation path now has a repeatable instrument — a composition score, a
  drift diagnosis per element, and a publishable side-by-side report — instead of per-sample
  eyeballing of a stochastic failure.
* − The scorer is a ranking instrument, not ground truth: when an output's background adopts an
  element's hue its element measurements degrade (reported as `backgroundLike`), and absolute scores
  on dense coloring-book inputs mean little. Judge those rows by eye.
* − The new prompt trades a little re-imagination for adherence: gpt-image-2 now stays close to
  literal for sparse drawings (the strict-overlay arm showed the extreme of this; the atmosphere
  license buys most of the life back, but a director's-cut "reinvent my drawing" mode would need a
  different prompt).
* − `DEFAULT_PROMPT` also feeds the style-cover generator and composes with the style and dark-scene
  suffixes; those read fine against the new base (the night arm measured 83.5 on night paper), but
  any future suffix must be written against the paint-over framing.
