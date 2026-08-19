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
