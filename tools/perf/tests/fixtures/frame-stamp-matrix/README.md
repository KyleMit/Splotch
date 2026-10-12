# Frame-stamp matrix fixtures

These are sanitized action slices from the full September 19, 2026 sweeps in the
[`coloring-coverage-r1` evidence](../../../../../docs/scratchpad/perf/2026-09-19-coloring-first-open/README.md).
They exercise the matrix generator; they are not sources for the September 7 published matrix, which
measures a different product commit. Each slice retains one warmup and three scored repeats of one
action. The fixture keeps every input the scorer reads for that action: activation, first frame,
readiness, raw post-action gaps, each post-action frame's scheduled and actual clock fields,
activity times, canvas mutation times, and measure times. Device identifiers, host URLs, trace
names, and absolute timestamps are omitted.

| Fixture                   | Full private source SHA-256                                        | Source and build identity                                                                                                                                                                                                                                                                                                                                                           | Recorded `frameStamps`                                                     |
| ------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `android-device-web.json` | `e6680736c4a17ecafe4d33ffc40bb066d0dd2db378f3fb614dacab5db27cbe01` | `a3-android-chrome-full-groups/actions.json`; [harness commit 3453f1f](https://github.com/KyleMit/Splotch/commit/3453f1f28b2f7b23560414700ebad04201d9c3af); web product tree at [1640c81](https://github.com/KyleMit/Splotch/commit/1640c81c607f26adbfdcdb0a566294a63020b344); `start.B76rsZ-2.js`, build digest `aa65ae9c6d8bf72b811748b1ab9aa5cd414522abea32b09487fdbf00441e7b02` | `clear drawing`: 380 scored frames, actual P95 38.8 ms, 50 hidden overruns |
| `ipad-device-web.json`    | `9cff8bc9ca85bc11a9e494ea9f8852c1587cd52a1ba15015195b62e5bc4a5a78` | `i1-ipad-safari-full-groups/actions.json`; same harness and served web build, page entry `start.B76rsZ-2.js`. The artifact does not carry a `productCommit` or build digest; the linked capture record supplies the build attribution.                                                                                                                                              | `change ink color`: 303 scored frames, actual P95 9 ms, 0 hidden overruns  |

The private originals remain at
`~/.splotch-rig/evidence/1870/coloring-coverage-r1/perf-profiles/coloring-coverage-r1/`. The fixture
action labels, repeat count, and scheduled and actual frame rows were copied from those originals
without rounding. `performance-matrix-frame-stamps.test.mjs` recomputes each full `frameStamps`
object from the sanitized inputs and checks it against the original artifact's summary. The source
hashes identify the originals without publishing their device metadata. The Android source's 50
hidden overruns make the distinction visible while its scheduled verdict stays PASS; the iPad source
verifies a zero-divergence cell. No performance or scoring policy follows from either fixture.
