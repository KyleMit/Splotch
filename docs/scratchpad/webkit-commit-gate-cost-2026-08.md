# WebKit fast commit gate — where its wall clock goes

> Working notes from the August 2026 decomposition of the `WebKit commit gate (fast)` job
> ([issue #762](https://github.com/KyleMit/Splotch/issues/762)), the job that bounds a pull-request
> run's wall clock after the CI split in #761. The retained conclusion lives in
> [ADR-0093](../adrs/0093-two-tier-webkit-commit-gate-in-ci.md); this document is the evidence
> chain, including the numbers that killed the split-into-parallel-jobs option.

## Executive result

**One scenario is the job.** `crayon-scribbles` takes 68–72% of the gate command's wall clock, and
83% of *that* is its synchronous draw phase — 26,378 crayon `engine.draw` calls at 2.3–2.6 ms each
on GitHub's shared `macos-latest` runner. Its sibling `multi-finger` costs 7–9 s.

That asymmetry refutes the pre-scoped fix. Splitting the two fast-set scenarios into parallel
one-scenario jobs was estimated at a ~1m40s floor; measured, the crayon job would land at ~2m20s and
the whole change would buy **5–10 seconds** while doubling macOS runner consumption and, under the
renderer then in production, requiring a per-scenario fast mode plus relocation of its
encode-coverage invariant.

The draw phase is not harness overhead — it is the product's crayon deposition path rendering six
pattern-filled surfaces per op. Nothing in the workflow, the caching, or the harness can move it.
The only lever left changes the scenario's op count, which is what ADR-0093's gate calibration rests
on. The encode-coverage invariant required by the original split was retired with the legacy
snapshot/blob renderer in ADR-0100's 2026-08-11 amendment.

## Method

Two `WebKit commit gate (fast)` jobs three days apart, decomposed from their Actions step boundaries
and the timestamps on the harness's own per-scenario log lines. Both are cache-warm `pull_request`
runs on `macos-latest` (arm64).

* Run A — [30906895057](https://github.com/KyleMit/Splotch/actions/runs/30906895057), 2026-08-04,
  job 91983963892, 2m35s
* Run B — [31159768570](https://github.com/KyleMit/Splotch/actions/runs/31159768570), 2026-08-07,
  job 92807215422, 2m28s

The harness prints a `▶ <scenario label>` banner when a scenario starts and a `snapshots=… commit
p95 …` line when it ends, so the gap between them is that scenario's wall clock; the gap *after* a
result line is `collectMeasures` marshalling that scenario's user-timing entries across the
Playwright bridge (WebKit has no CDP, so the report's trace is synthesized from them).

`engine.draw total` and `draw() calls` come from the run's own report table, so draw cost inside a
scenario is measured, not inferred.

## Results

### Job structure

| Step                                                          | Run A     | Run B     |
| ------------------------------------------------------------- | --------- | --------- |
| Set up job                                                    | 1 s       | ~1 s      |
| `actions/checkout`                                            | 10 s      | ~10 s     |
| `setup-playwright-webkit` (npm ci + browser cache, both warm) | 19 s      | ~19 s     |
| **Run fast WebKit commit gate**                               | **118 s** | **100 s** |
| Post-job cleanup                                              | 5 s       | ~5 s      |
| **Job total**                                                 | **155 s** | **148 s** |

### Inside the gate command

| Segment                                                       | Run A      | Run B      |
| ------------------------------------------------------------- | ---------- | ---------- |
| `npm run build` + adapter + postbuild                         | 15.5 s     | 12.6 s     |
| Preview server boot                                           | 1.6 s      | 0.5 s      |
| WebKit launch + context + first `/dev/engine` load + geometry | 6.8 s      | 4.6 s      |
| `multi-finger` scenario                                       | 8.8 s      | 7.1 s      |
| ⤷ `collectMeasures` (52,690 entries)                          | 2.6 s      | 1.7 s      |
| **`crayon-scribbles` scenario**                               | **80.8 s** | **72.4 s** |
| ⤷ of which `engine.draw`                                      | 67.2 s     | 60.1 s     |
| ⤷ `collectMeasures` (26,378 entries) + gate + report          | 1.6 s      | 2.0 s      |

`crayon-scribbles` is 68% (A) / 72% (B) of the command and roughly half of the whole job.

### The crayon draw phase

|                                                                   | Run A     | Run B     | Local control |
| ----------------------------------------------------------------- | --------- | --------- | ------------- |
| `crayon-scribbles` draw calls                                     | 26,378    | 26,378    | 26,378        |
| `engine.draw` total                                               | 67,194 ms | 60,061 ms | 38,558 ms     |
| **ms per crayon draw call**                                       | **2.55**  | **2.28**  | **1.46**      |
| Normalization factor vs `CRAYON_DRAW_REFERENCE_MS_PER_CALL` (0.4) | 6.4×      | 5.7×      | n/a           |
| `multi-finger` ms per (pen) draw call                             | 0.014     | 0.010     | 0.026         |

The local control is `--scenarios=multi-finger,crayon-scribbles` on Chromium in a Linux cloud
container — a different engine on a different host, so its commit timings are meaningless (its
SwiftShader `engine.snapshot` alone reads 405 ms, exactly the unfaithfulness ADR-0093 refuses to
gate on). Its *draw* figures are the point: the crayon path costs 56× the pen path there too, and
lands within 1.6× of the macOS WebKit number.

Three things follow. The macOS runner is **not** broadly slow — the pen path in the same run
measures 0.010–0.014 ms per call. The crayon figure is **stable**, varying 12% across three days, so
it is not shared-host noise. And it is not macOS-specific either: any software-rasterized canvas
pays it.

Per crayon op, `renderCrayonOp` (`web/src/lib/drawing/crayonPassBuffer.ts`) paints the op into the
live overlay buffer, its preview mirror, *and* the paper-space accumulation buffer — each at
`CRAYON_DEFAULTS.passes.length` density passes, so six pattern-filled stroked paths per `draw()`. On
a runner whose canvas has no GPU acceleration, that is the whole 60–67 s.

### What a parallel split would actually buy

Projected from run B's measured segments, holding job overhead (47.6 s) and the shared per-job
build/launch cost constant:

| Job                     | Projected                 |
| ----------------------- | ------------------------- |
| `multi-finger` only     | ~74 s                     |
| `crayon-scribbles` only | ~140 s                    |
| **Wall clock (max)**    | **~140 s vs 148 s today** |

Run A projects the same way: ~149 s against 155 s. So the split saves **5–10 s (4–6%)**, not the ~55
s the estimate assumed, because the estimate implicitly treated the two scenarios as comparably
sized when they differ by 10×.

At ~140 s the gate would still sit well above the e2e shards (82–118 s), so it stays the wall-clock
floor and the follow-up shard-tuning lever stays out of reach.

## What was rejected, and why

* **Two parallel one-scenario jobs.** 5–10 s, for a per-scenario fast mode (`--suite=fast` currently
  rejects `--scenarios`), a relocated "the set covers encoding" invariant plus its drift test, and a
  second macOS runner on every pull request. The measurement, not the complexity, is what settles
  it.
* **Moving the job to `ubuntu-latest`.** ADR-0093 records an Ubuntu Actions measurement of the fast
  command exceeding the then-184-second Tests job. Ubuntu's WebKit has only got relatively cheaper
  if macOS got slower, and nothing here suggests it closed a 184 s → 100 s gap.
* **Build/setup trimming.** Checkout, `npm ci`, and the browser cache restore are already warm and
  total 30 s; the app build is 13–16 s. Even eliminating the build entirely leaves the job above the
  e2e shards.
* **Cheaper `collectMeasures`.** Real, but 3.7–4.3 s combined — under 3% of the job — for churn in a
  module every perf script shares.

## The one lever left, and its cost

`crayon-scribbles`'s draw cost is linear in `LONG_OPS` (1,200 points per stroke), while what the
gate actually reads — `engine.commit` P95 over 22 samples — is not obviously linear in it: the
scribble is a piecewise-linear triangle wave, closed crayon passes travel to the fold as prerendered
`crayonPassRaster` ops, and the number and extent of those rasters is set by the shape's eight
sweeps rather than by point density along them.

If that holds, cutting the scenario's points per stroke would cut the draw phase near-proportionally
while leaving the committed pixels and the commit sample count alone. It is **unverified**, and the
costs are real: it changes the shape ADR-0093's 25 ms threshold was calibrated against, it would
have to be a per-scenario op count (`LONG_OPS` is global and `crayon-squiggles` shares the geometry
helpers), and it invalidates the committed fast-set history seed, whose headroom ratios are only
comparable across runs of the same scenario.

Worth noting alongside it: run B measured `crayon-scribbles` at **21 ms raw commit P95 and 30 ms
commit max against a 25 ms gate**, green only because the 5.7× renderer normalization pulled it to
3.7 ms. The raw signal on this runner class now sits at the threshold, which is its own question
independent of wall clock.

## Outcome

Neither lever above was taken. The original
[ADR-0100](../adrs/0100-split-the-commit-gate-by-what-each-half-can-decide.md) decision resolved
this by splitting the gate on what each half can decide rather than by making the run cheaper: the
#635 defect class was a *count* — an `engine.encode` measure inside the commit window — which any
engine could read, so it moved pre-merge onto Chromium on Ubuntu, while the millisecond P95 that
genuinely needs WebKit and a quiet host moved to pushes on `main`.

ADR-0100's 2026-08-11 amendment records the later tiled-renderer consolidation. Tiled history has no
cold blob-encoding path or `engine.encode` measure, so the structural Chromium half and its
encode-coverage invariant retired with the legacy renderer instead of remaining as a vacuous gate.
The post-merge WebKit timing half remains active.

That removes the macOS job from the pull-request path entirely, so a PR run drops to the e2e shard
floor. The numbers above stop being a wall-clock problem and become the standing cost of the
post-merge tier, where they no longer gate anyone's iteration. The op-count lever remains available
and remains unverified if that cost ever needs to come down.
