# Tuning guide — how to refine an output that came out wrong

Two knobs matter. Everything else in the pipeline is either scale-free by
construction or was measured and left alone.

| knob | what it does | default |
|---|---|---|
| **raster scale** (`--scale`) | px per SVG user unit when each filled element is rasterized. Sets how much of the drawing's boundary detail becomes skeleton structure. | **8**, except `sun-square` and `landscape-square` at **2** |
| **pruning strength λ** (`--lam`) | how aggressively terminal branches are deleted, in *local stroke widths*. `λ = 1.0` means "remove terminal branches shorter than one local stroke width". | chosen automatically per drawing |

Before touching either, know what you are optimizing. There are three axes and
they do not always move together:

- **error** — symmetric difference against the source fill, as a fraction of ink.
- **wobble** — RMS deviation from the path's own one-stroke-width low-pass, in
  stroke radii. This is the axis that tracks "as if drawn by a kid on a digital
  coloring app". An exact line is 0.000, an exact arc 0.002.
- **control points per stroke width** — editability, and how heavy the file is.

**Error alone will mislead you.** It rewards a path that wiggles along the
outline, which is exactly the look the product goal rules out. Always read error
together with wobble; `manifest.json` records both for every drawing.

---

## Raster scale

Swept over all ten drawings at 1, 2, 4, 8 and 16, each cell re-extracted at its
own scale and then auto-pruned — so a scale is judged on what survives cleanup
rather than on its raw skeleton. Medians:

| scale | error | wobble | pts / stroke width | branches | extract |
|---|---|---|---|---|---|
| 1 | 0.0443 | 0.0298 | 3.66 | 59 | 2.9 s |
| 2 | 0.0252 | 0.0237 | 3.49 | 52 | 3.4 s |
| 4 | 0.0205 | 0.0215 | 2.24 | 62 | 9.2 s |
| **8** | **0.0188** | **0.0178** | **1.76** | 76 | 31.1 s |
| 16 | 0.0187 | 0.0185 | 1.75 | 93 | 117.5 s |

Full tables per drawing: [`runs/scale-sweep.md`](../runs/scale-sweep.md).

**Scale 4 → 8 improves all three axes at once**: −8% error, −17% wobble, −21%
control points per stroke width. That combination is what makes it a real result
rather than a metric artifact. It is not an artifact of the selection rule either
— the same improvement is present in the *unpruned* column (median error at λ=0
goes 0.0188 → 0.0176), so the gain comes from extraction and pruning merely does
not throw it away.

**Scale 16 is not worth it.** Error is flat, wobble is *worse* than scale 8, points
per width is identical, and extraction is 5.8× slower. Worse than the medians
suggest: `dinosaur-wide` at scale 16 did not finish in **45 minutes**. Don't.

**Two drawings want a lower scale, and they are the two this engine is worst on.**

| drawing | best scale | error there | error at scale 4 |
|---|---|---|---|
| `sun-square` | 2 | **0.0246** | 0.0390 (−37%) |
| `landscape-square` | 2 | **0.0244** | 0.0268 (−9%) |

Both are thin tapering scribble. Above scale 2 the taper tails resolve into
skeleton structure that pruning then has to guess about. This is the shape to
recognise: **fine tapering detail wants a coarser raster, not a finer one.** If a
new drawing comes out badly and it looks like `sun-square`, try `--scale 2` first.

```bash
python3 src/run.py --images mydrawing --scale 2
python3 src/run.py --images mydrawing --scale 4
python3 src/run.py --images mydrawing --scale 8      # compare the manifest rows
```

Scale is much cheaper to route per drawing than any other decision here, and the
sweep says per-drawing scale selection reaches ~0.0179 median error against 0.0188
for a fixed 8. What is missing is a selection *rule* that does not require ground
truth — an open question, not a solved one.

## Pruning strength λ

λ is in local stroke widths, so it means the same thing on a 100-unit drawing and
a 10,000-unit one. The default sweep is `0, 0.5, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0`,
dense below 2 because that is where the spur/real-detail boundary lives.

The selector takes the *simplest* candidate whose reconstruction error is within
tolerance of the best achievable. That is what lets the engine be evaluated at its
own best setting instead of at whatever threshold someone happened to pick.

Automatic selection is not just a convenience — measured against three backends'
hand-tuned thresholds it bought 16–35% simpler graphs for +0–8% error, and against
one genuinely tuned width-relative filter it was better on **10 of 10** drawings.
Prefer fixing the automatic choice to overriding it.

To pin it anyway:

```bash
python3 src/run.py --images mydrawing --lam 1.5    # skips the sweep, uses this λ
```

**Reading the choice.** `manifest.json` records `lam`, `edgesBeforePruning` and
`edgesEmitted` per drawing. λ = 0 means the selector declined to prune at all —
three of the ten drawings (`home-wide`, `house-tall`, `dinosaur-wide`) land there
at scale 8. That is a real signal, not a default; see the open problem below.

**When output has spurious spikes:** raise λ toward 1.5–2.0 and check the render,
not just the error. Over-pruning scores *well* on IoU because IoU is forgiving of
small missing marks — which is exactly why the selector optimizes symmetric
difference instead, and exactly why you look at the contact sheet.

**When output has lost detail:** lower λ, or if λ was already 0, the geometry was
never extracted — that is a scale problem, not a pruning problem.

## The iteration loop

For one drawing that came out wrong:

```bash
# 1. Establish the baseline you are trying to beat.
python3 src/run.py --images mydrawing
#    -> note error / wobble / strokes from the printed line

# 2. Change ONE thing. Scale first — it is the bigger lever and the cheaper one.
python3 src/run.py --images mydrawing --scale 2 --out-dir /tmp/try-s2
python3 src/run.py --images mydrawing --scale 4 --out-dir /tmp/try-s4

# 3. Look at it. Metrics are proxies; the render is the deliverable.
node    src/render_pairs.mjs /tmp/try-s2
python3 src/build_contact_sheet.py            # -> docs/contact-sheet.html

# 4. Only when you like what you see, write it into outputs/ for real.
python3 src/run.py --images mydrawing --scale 2
```

Writing trials to `--out-dir /tmp/...` keeps `outputs/` clean; step 4 is what
commits the change. Read error and wobble **together** at every step — a change
that improves one and degrades the other is usually not the change you want.

For a whole-population change (new corpus, changed extraction code), use the bench
instead of `run.py`; see [runbook.md § Re-measure](runbook.md#re-measure-the-bench).

## Knobs that were measured and left alone

Do not re-litigate these without new evidence; each cost real time to settle.

- **`--width-mode piecewise`** — on. Splitting an edge into constant-radius runs
  improved *every* drawing, most of all the tapered ones (`sun-square` 3.59% →
  1.73% pixel diff). Costs file size and segment count. Keep it.
- <a id="cap-extend"></a>**`--cap-extend`** — off. Marching a terminal end to the
  outline and backing off one local radius improves corpus centerline error
  consistently (case 05 median 0.094 → 0.032) but changes nothing measurable on
  real art, because round-cap retraction is only 3–4% of R. **Turn it on if the
  centerline itself is your deliverable** rather than the re-render.
- **Simplify epsilon 0.15 user units**, with detected corners forced to survive.
- **Width-run split threshold ±18%** — the one hand-chosen constant in the
  pipeline. It is scale-free (a ratio) and no drawing was tuned against it
  individually.
- **`corner_window = 0.9 × R_local`**, scaled by local radius rather than absolute
  arc length. An absolute window mis-fires between fat and thin strokes in the same
  drawing.
- **`rng_seed = 0`** on every `medial_axis` call. Not a tuning knob — a
  correctness requirement. See [lessons.md](lessons.md#medial_axis-is-non-deterministic-by-default).

## <a id="the-open-problem"></a>The open problem: pruning does not keep up with resolution

Worth knowing before you raise the scale, because it is measured and it has a
known correct answer.

Corpus case 20 is a single straight capsule under boundary jitter. The true answer
is one branch at every scale. Branches surviving automatic pruning:

| scale | 1 | 2 | 4 | 8 | 16 |
|---|---|---|---|---|---|
| before pruning | 20 | 23 | 43 | 106 | 201 |
| **after pruning** | **1** | 4 | 4 | **21** | **59** |

Proportionally pruning looks like it is holding — it removes 100% of the spurious
branches at scale 1 and still 71% at scale 16 — but what reaches the output grows
without bound. λ is scale-free by construction and the spurs *do* have small
`R_med`, so this should not happen: either the spur radius estimate is contaminated
at high resolution, or the selection rule is stopping short of the right λ. The
corroborating signal is in the selector itself: on three drawings it picks λ=0 at
scale 8, declining to prune at all, where at scale 1 it picks 3.0, 1.0 and 0.0. So
the failure is in the *decision*, not only in the threshold.

Two consequences:

1. **Scale 8 is right despite the cleanup argument, not because of it.** The
   accuracy and smoothness gains are real and measured; the "scale 8 is fine
   because pruning cleans up after it" reasoning is false.
2. Ground truth tempers the scale-8 result in a second way. Median distance to the
   *true* centerline across the 20 cases: 0.2511 (s1) · 0.1897 (s2) · **0.1363
   (s4)** · **0.1332 (s8)** · 0.1435 (s16), and P95 is *best at scale 4*. Where
   the line actually sits converges by scale 4 and stops improving. The scale-8
   win on real drawings is a reconstruction-and-smoothness win, not a "the line is
   in a more correct place" win.

This is a well-posed question with a known correct answer, which makes it the best
next experiment if you want to push output quality further. The other one is a
curve-fitting pass: the engine already exposes a simplify epsilon and emits
Béziers, and the scale sweep shows error and smoothness moving together rather
than trading off, so there is room. Target: keep wobble ≤ 0.02 while cutting
control points per stroke width, watching the error axis at the same time.
