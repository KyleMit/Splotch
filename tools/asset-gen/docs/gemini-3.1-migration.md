# 2026-07 catalog regeneration on `gemini-3.1-flash-image`

The full-catalog regeneration that made `gemini-3.1-flash-image` the pipeline's default image model
(IDEAS #17, validated by the [`ideas-exploration/idea-17`](../ideas-exploration/idea-17/report.md)
bake-off). Every chalk outline, light fill, and night fill — 94 pages × 3 assets — was regenerated
through the production gates; this file is the run record: per-page generation counts, every page
whose prompt or call arguments were customized, and the issues that remain open after the wave.

## What changed

* `MODEL` in all five generators (`gen-coloring-fills{,-dark}`, `gen-coloring-chalk`,
  `gen-style-covers`, `normalize-outline-strokes`) went `gemini-2.5-flash-image` →
  `gemini-3.1-flash-image`. The app-side `web/src/lib/server/ai/gemini.ts` model is a separate
  decision and was NOT changed. Style covers were not regenerated (no gates exist for them; the swap
  only affects future cover runs).
* Landed alongside (validated in ideas-exploration, zero-regression evidence):
  * **IDEAS #11** — the chalk keep gate scores against the pen with solid interiors whitened out, so
    deliberate pupil-whitening no longer reads as lost ink (19 chalks previously shipped by
    hand-override; this wave needed zero overrides).
  * **IDEAS #12** — `judgeNightEyes` ignores band-blind cores and, on chalk-forked pages, cores the
    chalk never marked white (wheel hubs, rover screens), so flat-eye flags mean something again.
* Night fills were generated against a **tightened mood gate** (`--night-luma-max 60` instead of the
  then-default 100 — since made the code default) to close IDEAS #4's 4× night-sky brightness
  spread. The shipped catalog's night backgrounds now span bgLuma **18–48** (previously 16–66).

## Results

| Stage | Pages | First-take pass | Multi-try | Notes                                                                                        |
| ----- | ----: | --------------: | --------: | -------------------------------------------------------------------------------------------- |
| Chalk |    94 |              90 |         4 | all 94 applied by the generator's own gates — zero hand-cp overrides (the 2.5 era needed 19) |
| Light |    94 |              53 |        41 | retries mostly hunting lively eyes on accident-era pens                                      |
| Night |    94 |              72 |        22 | lineW 255 on every page (2.5 era: recurring 51–170 re-inking)                                |

* **Registration**: drift audit 0/94 flagged; the model adds almost no global nudge (2.5's signature
  few-pixel shift appears on fewer than half the pages, and alignToSource corrects it as before).
* **Eyes**: night-side eye audit 0 FAIL. Light-side flat-eye flags fell **53 → 39** vs the pre-swap
  baseline — 15 pages cleared (including both historical flat-pupil ships `nature/caterpillar-wide`
  and `nature/ladybug-wide`, IDEAS #5, which 2.5 refused across 11+ attempts each); the one new flag
  (`farm/duck-wide`) is the known side-profile detector false positive (IDEAS #12), verified lively
  by eye.
* **Re-inking (IDEAS #1)**: gone. `vehicles/train-wide` — lineW 51–105 through ~27 attempts on 2.5,
  shipped with an exception — passed first take at lineW 255. The residual-halo audit's top scorers
  were all adjudicated as deliberate dark art or glow effects (crops reviewed).
* **Invented shapes (IDEAS #13)**: the idea-13 detector ran over all 188 shipped fills; 1 real
  invention was caught and regenerated away (`objects/house-tall` light — two outlined flowers
  invented on the open sky, invisible to the keep/white/eye gates), 2 flags were false positives
  (existing regions in unusual colors).
* All 94 night composites were reviewed visually (montages) in addition to the gates; the whole
  catalog was re-punched and passes `check:assets`.

## Generation budget

Soft cap 5 generations per image/variant (the generators' `--max-attempts 5` keep-best-of-N ladder),
hard cap 10 (additional targeted runs with levers). Two pages reached ~10: `vehicles/police-tall`
chalk and `shapes/rectangle-wide` night (both landed acceptable takes — see below).

## Per-page customizations

Pages whose generation deviated from the uniform prompt/arguments. (Uniform = the stock prompt,
`--max-attempts 5`, night `--night-luma-max 60`.)

> **2026-07-13:** the still-relevant customizations below are now encoded in the per-page notes
> registry (`fill-src/<cat>/notes.json`, auto-loaded by the generators — see `pipeline.md`), so a
> future regen no longer needs to mine this table: circle-wide's contrast note is seeded;
> rectangle-wide's bubble note was superseded by its 2026-07-13 fresh pen (no bubbles — its registry
> entry carries the fresh pen's contrast note instead); police-tall's erase note applied only to its
> old solid-pupil pen (also replaced 2026-07-13) and lives on as the `retry` recipe on its
> still-solid-pupil sibling `police-wide`. This table remains the historical run record.

| Page                    | Asset | Customization                                                                                                                                      | Why                                                                                                                                                                                                       |
| ----------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vehicles/police-tall`  | chalk | `--notes` erase-and-redraw instruction ("erase the solid white inside each pupil… white sclera, black outlined pupil, white catchlight"), `-t 0.4` | The wave's chalk whitened the pupils along with the sclera — the gate-blind class (solid pen pupils yield no eye cores, so eye-polarity can't gate). Night fill then regenerated against the fixed chalk. |
| `vehicles/fire-tall`    | light | plain re-run (no prompt change)                                                                                                                    | flat-eye regression vs baseline; cleared in 2 more takes (5 total).                                                                                                                                       |
| `vehicles/train-wide`   | light | plain re-run (no prompt change)                                                                                                                    | flat-eye regression vs baseline; cleared in 3 more takes (7 total).                                                                                                                                       |
| `objects/house-tall`    | light | plain re-run (no prompt change)                                                                                                                    | idea-13 detector caught two invented flowers on the open sky; regen is invention-free.                                                                                                                    |
| `shapes/circle-wide`    | night | `--notes` "the circle is the star… fill it with a color that stands out, not navy"                                                                 | The disc rolled near-sky navy (no subject/background contrast — no gate measures this). Retry landed dusty rose.                                                                                          |
| `shapes/rectangle-wide` | night | `--notes` "the four circles are soap BUBBLES… one pale color, no dark pixels, no pupils", `-t 0.25`                                                | Fills kept painting the pen's bubbles as googly eyeballs. Hit the 10-generation hard cap; the final take (pale shine bubbles) shipped.                                                                    |

## Outstanding issues after the wave

> Frozen snapshot as of the wave — the **living, maintained list is GitHub issues labeled
> `area:asset-gen`**; check there for current status.

* **Accident-era pens still cap light-mode eye quality** (IDEAS #6): the 39 remaining light-side
  flat-eye flags are pen-owned (solid ink pupils give the fill nothing to paint) or detector noise
  on non-face cores. The durable fix remains pen normalization + light regen; night mode is
  unaffected (the chalk owns those whites).
* **`shapes/rectangle-wide` bubbles** read as bright white shine-bubbles rather than translucent
  ones — acceptable, but a pen-side bubble redraw would fix it properly.
* **Chalk whitening judgment on solid-pen-eye pages is still gate-blind** (`police-tall` proved it):
  no gate compares a chalk's whites to what the night composite needs when the pen has no nested eye
  cores. Caught only by composite review; a "chalk-inked fraction inside pen solid regions near
  faces" scorer would close it.
* **Motif consistency across siblings** (IDEAS #2) was not systematically re-checked this wave (e.g.
  `dinosaur/pterodactyl-tall`'s sun is now warm gold vs its `-wide` sibling's crescent moon).
  Nothing looked wrong in review, but no gate enforces it.
* **Light↔night and tall↔wide palette coherence** (IDEAS #8/#9) remain un-enforced; the regen
  re-rolled all palettes independently.

## Rerun notes

The temperature ladder, `--dilate-lines`, and the shipped-despite-lineW exceptions were all 2.5-era
mitigations; none were needed here. Default `--max-attempts 3` is likely still right (chalk
first-take rate 96%); light fills benefit from the built-in 5.
