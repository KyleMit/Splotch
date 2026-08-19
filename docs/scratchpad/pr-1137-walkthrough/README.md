# PR #1137 — visual walkthrough evidence

[**WALKTHROUGH.md**](WALKTHROUGH.md) is the walkthrough itself — read that first.

This folder holds the figures and measurement scripts behind it, for PR #1137 ("Document
per-generator WebP quality choices"). The PR itself adds six comment lines and changes no behavior;
this folder holds the empirical check of whether each comment's stated rationale is visually and
numerically true.

`img/` — the figures, in the order the comment uses them. `scripts/` — the generators. Run from the
repo root with plain Node; they read committed assets and write to `.viz/out/`, touching nothing
under `web/static/` or `fill-src/`.

## The metric

"Paper dirtied" is the share of pixels that (a) are pure white in the lossless source and (b) sit
within 6 px of ink, whose value the encoder moved off white. On black-ink-on-white line art that is
exactly WebP ringing: the halo an encoder leaves hugging a hard edge. It is undefined for the
painted fills, which have no flat paper — those are measured as mean absolute pixel error instead.

`scripts/e10-control.mjs` is the load-bearing one: it binarizes an outline to pure 0/255 first, so
the reference carries no earlier WebP pass and a single encode is measured cleanly. Measurements
taken directly on committed assets (`e2-measure.mjs`, `e8-blast.mjs`) instead show second-generation
damage — the case the q92 comments' "downstream stages re-consume this output" clause is about.

## Follow-up: where outline ringing actually lands downstream

`scripts/downstream/` answers a second question — whether raising the pen outline above q92 would
pay off anywhere a user can see. It does not, and the scripts show why:

| Script                | What it establishes                                                                                                                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `overlay-haze.mjs`    | From a clean binary source, how much ringing survives the overlay's 8-step alpha quantizer at each quality. The deadband snaps anything under ~4/255 to fully transparent, so every surviving haze pixel lands at exactly alpha 8. |
| `overlay-ladder.mjs`  | The same ladder carried through to the shipped lossless overlay, with its file size.                                                                                                                                               |
| `real-ladder.mjs`     | The same ladder on the **real** outline instead of a binarized one — flat from q92 to lossless, which is the finding.                                                                                                              |
| `farfield.mjs`        | Separates ringing from legitimate antialiasing by distance from ink (antialiasing hugs an edge; anything past 4 px does not).                                                                                                      |
| `corpus-haze.mjs`     | The far-field measure across 12 pages, light and dark overlays, plus the byte cost of the haze in shipped files.                                                                                                                   |
| `paper-floor.mjs`     | The lever that does work: snapping near-white to pure white before the overlay is built.                                                                                                                                           |
| `thumb-path.mjs`      | Why the picker tiles never see any of it — the 4x downscale plus the tile's own q80 dominate.                                                                                                                                      |
| `lossless-corpus.mjs` | What each quality costs across all 104 outlines.                                                                                                                                                                                   |
| `visual.mjs`          | Renders `img/15-overlay-speckle.png`: a patch of open paper, composited on `--paper` at 1:1 and amplified.                                                                                                                         |

The conclusion the numbers support: the speckle is in the source render before the encoder sees it,
it is alpha 8/255 (about 3% black) and effectively invisible at 1:1, and it costs 1.7% of shipped
overlay bytes. A paper floor removes 96% of it; a higher `WEBP_QUALITY` removes none.
