# Playwright pull-request shard timing (2026-08-19)

Evidence base for issue [#855](https://github.com/KyleMit/Splotch/issues/855) and PR
[#1154](https://github.com/KyleMit/Splotch/pull/1154). The source Playwright reports have seven-day
retention, so this note preserves the derived values after their artifacts expire.

## Three-shard inputs and count-based projections

The two source runs used 467 Chromium tests. For each run, the per-test JSON embedded in the three
`playwright-report-shard-N` artifacts was concatenated in Playwright order, then divided into the
same contiguous count partitions that `fullyParallel` sharding uses. These are summed per-test
durations, not job wall time; they preserve which count changes disperse or reconcentrate the heavy
tests.

| Source run                                                                                    | Actual e2e steps | Three-shard test sums | Four-shard projection | Five-shard projection | Eight-shard projection        |
| --------------------------------------------------------------------------------------------- | ---------------- | --------------------- | --------------------- | --------------------- | ----------------------------- |
| [31990017276](https://github.com/KyleMit/Splotch/actions/runs/31990017276), 2026-08-17 03:05Z | 106/139/93s      | 324/405/278s          | 280/218/353/155s      | 248/110/258/247/143s  | 182/99/67/154/162/187/66/89s  |
| [31984251977](https://github.com/KyleMit/Splotch/actions/runs/31984251977), 2026-08-17 01:12Z | 111/143/102s     | 327/403/308s          | 282/219/362/174s      | 250/111/259/258/161s  | 180/103/68/154/159/199/75/99s |

Four shards move the adjacent `flows-tile-history.spec.ts` stress tests without separating their
cost. Eight is the first measured candidate that approximately halves the worst summed load in both
runs without a hand-maintained assignment.

## Fixed build and preview cost

The e2e step does more than execute tests. In `Tests (2/3)` from run 31990017276, the step started
at 03:06:39.2, reported `Running 156 tests` at 03:06:56.3, and finished the tests at 03:08:57.8.
That separates the 138.6-second step into:

| Term                                   | Duration |
| -------------------------------------- | -------- |
| Svelte sync, production build, preview | 17.1s    |
| Test execution                         | 121.5s   |
| Full e2e step                          | 138.6s   |

The fixed 17.1 seconds does not shrink with shard test count. The heavy shard's 405 summed
test-seconds completed in 121.5 wall seconds on four workers, or 0.833 parallel efficiency. Applying
that efficiency only to the eight-way worst case gives `199 / (4 × 0.833) = 59.7s` of test time;
adding the fixed term projects a **76.8-second** slowest e2e step.

## First real eight-way run: warm caches

PR run [32258924629](https://github.com/KyleMit/Splotch/actions/runs/32258924629) executed commit
06d67c8a816e8782ff323577271f4c016b75d0ad. All eight e2e jobs passed. The workflow conclusion was red
because the independent asset-pipeline unit step failed; it did not execute inside or cancel any
shard.

| Shard | Playwright setup | E2E step | Shard-only smokes | Whole job |
| ----- | ---------------- | -------- | ----------------- | --------- |
| 1/8   | 9s               | 77s      | 24s               | 137s      |
| 2/8   | 11s              | 47s      | —                 | 86s       |
| 3/8   | 10s              | 37s      | —                 | 75s       |
| 4/8   | 13s              | 58s      | —                 | 103s      |
| 5/8   | 9s               | 65s      | —                 | 101s      |
| 6/8   | 22s              | 75s      | —                 | 131s      |
| 7/8   | 10s              | 48s      | —                 | 85s       |
| 8/8   | 19s              | 49s      | —                 | 100s      |

The observed 77-second maximum matches the fixed-term projection. The slowest complete test job was
shard 1 at 137 seconds because it also owns the app-driver and worker-sweep smokes, down from the
roughly 203-second critical shard in both three-way source runs.

This run is warm-cache evidence only. Representative fast and slow setup logs (shards 1 and 6)
confirm primary-key hits for both the Chromium browser cache and the runner-image-specific apt
package cache. The eight jobs landed across more than one runner-image version, and every inspected
key was already populated.

## Unmeasured cold-cache risk and observation plan

Eight simultaneous cache misses would run eight independent `playwright install-deps` and browser
downloads instead of the offline restore path. This change does not have a cold-key run on real
runners, so the warm 9–22-second setup range cannot bound that contention. The failure mode is
documented in the neighbouring [setup-timing note](playwright-setup-timing-2026-08-18.md): even with
three shards, sibling runners once received radically different download bandwidth.

The existing `warm-playwright-cache.yml` workflow mitigates the risk by populating default-branch
browser and apt keys daily, on Playwright/action changes, and incidentally through successful main
test runs. The next runner-image rotation is the first required observation point:

1. Inspect the first warming and pull-request runs using the new image key.
2. Record cache-hit state plus all eight Playwright setup-step durations in this note.
3. Compare the cold-key distribution with the 9–22-second warm range above.
4. If concurrent downloads starve, repair the warming path before reducing test coverage or
   hand-pinning shard assignments.
