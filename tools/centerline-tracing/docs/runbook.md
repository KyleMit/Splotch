# Runbook

Everything you need to run the tracer, rebuild the review sheet, and check that
what you produced is what was measured.

## Install

```bash
pip3 install -r requirements.txt      # numpy scipy scikit-image shapely pillow svgelements skan
npm install                           # @resvg/resvg-js, fit-curve, sharp, pixelmatch, pngjs
```

Node is not optional. Rasterization (resvg) and Bézier fitting (fit-curve) are
Node libraries the Python stages shell out to. Verified on Python 3.11 / Node 22.

Verify the install without tracing anything:

```bash
python3 src/test_clg.py               # ~30 s; prints "all invariants hold"
```

## Trace

```bash
python3 src/run.py                                  # every SVG in inputs/
python3 src/run.py --images house-wide,sun-square   # a subset
python3 src/run.py --in-dir mydrawings --out-dir /tmp/trace
```

Per drawing this writes three things into the output directory:

```
<image>.svg           the stroked centerline drawing — the deliverable
graphs/<image>.json   the same drawing as a centerline-graph/1 document
manifest.json         one record per drawing: config used and what it scored
```

`manifest.json` accumulates across partial runs, so tracing one drawing does not
truncate the record for the other nine.

**Cost.** About 25 s per drawing on the ten inputs, dominated by rasterizing each
filled element at 8 px per SVG unit and by `medial_axis` on the resulting masks.
`dinosaur-wide` is the slowest at ~100 s; `sun-square` takes 1 s. Cost grows
faster than linearly in raster scale — see [tuning.md](tuning.md).

Overriding the defaults (`--scale`, `--lam`) is the subject of
[tuning.md](tuning.md). Do not reach for them before reading it; both defaults
were chosen by a sweep, and one of them is non-obvious.

## Rebuild the contact sheet

The sheet is how a person reviews the output. Rebuild it whenever the outputs
change:

```bash
python3 src/run.py                    # 1. emit the SVGs
node    src/render_pairs.mjs          # 2. render matched WebP pairs -> runs/sheet-assets.json
python3 src/build_contact_sheet.py    # 3. inject them -> docs/contact-sheet.html
```

Or `npm run sheet` for steps 2–3. The result is a single ~780 KB self-contained
HTML file: open it directly, no server needed. `runs/sheet-assets.json` is an
intermediate and is not in version control; `docs/contact-sheet.html` is.

Both halves of every pair go through the *same* rasterizer at the *same* pixel
size on the same white ground. If you change one side's render path, change the
other — see [lessons.md](lessons.md#a-comparison-render-must-differ-by-one-thing-only).

## Verify

**The cheap check that matters most: does what you emitted reproduce what was
measured?** Every drawing in `manifest.json` should match `runs/scale-sweep.md`
to four decimals at the same scale. It is one command and it is the only thing
standing between a real result and a plausible-looking lookalike produced by a
slightly different code path.

```bash
python3 - <<'EOF'
import json
for r in json.load(open("outputs/skimage-skan/manifest.json")):
    print(f"{r['image']:18s} scale {r['scale']:g}  err {r['error']:.4f}  "
          f"wobble {r['wobble']:.4f}  {r['edgesEmitted']} strokes")
EOF
```

Other checks:

```bash
python3 src/test_clg.py                              # graph, pruning and metric invariants
node src/compare.js inputs/house-wide.svg \
     outputs/skimage-skan/house-wide.svg 1200 /tmp/diff.png   # raster diff + diff image
```

`compare.js` measures something different from the vector metric — colour
difference over the whole canvas, not symmetric difference over ink. Both are
useful; quote both or neither, never one as if it were the other.

## Re-measure (the bench)

Only needed if you changed the extraction or emission code, or want the numbers
for a configuration nobody has run. The bench is a separate harness from
`run.py`: it sweeps configurations and records them, and it never writes into
`outputs/`.

```bash
python3 src/skan/corpus.py                              # regenerate the 20 ground-truth cases
python3 src/skan/bench.py corpus                        # centerline error against known truth
python3 src/skan/bench.py inputs --images house-wide --width-mode piecewise
python3 src/skan/bench.py sweep  --images house-wide --scales 1,2,4,8
python3 src/skan/bench.py report                        # re-print stored results
bash    src/skan/runbench.sh                            # the whole matrix, ~20 min
```

Results merge into `runs/metrics.json`, keyed by image and tag. Emitted SVGs and
graphs land in `runs/out/` and `runs/graphs/`, which are regenerable and not in
version control.

Then the visual record:

```bash
python3 src/skan/sheets.py comparison --tag 'medial-axis@4+pw' --crops 2
python3 src/skan/sheets.py progress --image house-wide
```

These read `runs/metrics.json` and render from `runs/out/`; records whose files
are no longer on disk are skipped with a message, so re-run the bench for a tag
if a tile you expected is missing.

## Troubleshooting

**Scores wobble by ~±0.01 IoU between identical runs.** `medial_axis` randomises
the tie-breaking order used in thinning unless you pass `rng`. The pipeline pins
`ExtractConfig.rng_seed = 0` on every call; if you added a code path that calls
`medial_axis` directly, pass the seed. Left unpinned, this is enough noise to
hide a real regression or invent one.

**A drawing loses tiny marks.** Sub-pixel path fragments (0.4–0.9 user units
across) in the source are dropped deliberately and counted separately as
`subpixelElementsDropped`, not as a failure. Seven elements in `home-wide` and one
in `balloon-tall` are in this category. Check that count before assuming strokes
were lost.

**`node: command not found`, or fitting returns nothing.** The Python stages
shell out to Node. Run `npm install` and make sure `node` is on `PATH` for the
process running Python.

**A drawing takes minutes, not seconds.** Cost is superlinear in raster scale and
in element size. At scale 16, `dinosaur-wide` did not finish in 45 minutes. If
you raised `--scale`, that is why; see [tuning.md](tuning.md).

**The container suspends between turns** in a hosted agent session, so long
background jobs barely advance while you wait on them. Run benches in the
foreground. `bench.py` writes after every cell, so a partial run survives.
