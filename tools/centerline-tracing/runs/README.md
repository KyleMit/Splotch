# runs/ — the measured record

Evidence, not deliverables. The shipped drawings are in `outputs/skimage-skan/`.

| path | what it is |
|---|---|
| `metrics.json` | every bench run ever recorded, keyed by image and tag: IoU, pixel diff, symmetric difference, boundary distance, edge and Bézier counts, failure tags, timings |
| `scale-sweep.md` | the raster-scale sweep — 10 drawings × 5 scales, each auto-pruned. The measurement behind the `--scale` default |
| `corpus/` | the 20-case synthetic ground-truth corpus: filled shapes Shapely-buffered from **known** centerlines, plus `corpus.json` recording the truth. Regenerate with `python3 src/skan/corpus.py` |
| `sheets/` | contact sheets from the last full bench — `comparison` (input / output / diff / overlay per drawing), `corpus`, and per-drawing `progress` sheets |

## Not in version control

These are regenerable caches, and they are listed in `.gitignore` so a bench run
cannot quietly become part of the record:

| path | regenerate with |
|---|---|
| `out/` | `bash src/skan/runbench.sh` — emitted SVGs, one per image × tag |
| `graphs/` | same — graph JSON, one per image × tag |
| `diffs/` | same — per-run raster diff PNGs |
| `promoted/` | `python3 src/skan/bench.py inputs --promote` |
| `sheet-assets.json` | `node src/render_pairs.mjs` — the WebP pairs the contact sheet inlines |

`sheets.py` renders from `out/`, so after a fresh clone a sheet rebuild will skip
tags whose SVGs are absent and say so. Re-run the bench for those tags to get the
tiles back.

**`bench.py --promote` writes to `runs/promoted/`, never to `outputs/`.** That is
deliberate — see [`docs/lessons.md`](../docs/lessons.md#never-let-a-harness-write-into-the-directory-it-reads-from).
