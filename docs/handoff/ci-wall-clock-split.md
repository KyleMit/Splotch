# Handoff — CI wall-clock: split the Tests job and the macOS perf gate

> 2026-08-04 · branch `claude/playwright-deps-cache-5h1zp3` · PR
> [#756](https://github.com/KyleMit/Splotch/pull/756) · PR 756 is **green and ready to merge**; the
> remaining work is cutting PR wall clock further by sharding the Tests job, then unblocking the
> macOS WebKit perf gate that becomes the floor.

## Objective & non-goals

Cut the wall clock a contributor waits on before merging. The user's stated priority: **runner
minutes are free on this public repo, wall clock is not** — so prefer spending extra runners over
sharing work between jobs.

**Non-goals:** reducing billable minutes (explicitly not a constraint); touching what the tests
*assert*; and re-litigating PR 756's approach — the trimmed-apt-list alternative was tried,
measured, and rejected (see Decisions).

## State

PR 756 is green, conflicts with `main` resolved, all review threads resolved. **Merge it first** —
the work below is a separate PR. A merged PR cannot track new work, so start from a fresh branch off
the new `main`.

| sha     | what                                                                           |
| ------- | ------------------------------------------------------------------------------ |
| 693c105 | trimmed WebKit apt list — **superseded**, its net diff is gone (see Decisions) |
| 19982a4 | WebKit smoke moved to a job parallel to Tests                                  |
| d46bf07 | `.github/actions/setup-playwright` composite action, `browsers` input          |
| 8043190 | tag-based engine routing + `test:webkit:smoke` naming                          |
| 7d328b0 | `scripts/tests/e2e-engine-tags.test.mjs` guard (from review)                   |
| c832798 | merge `origin/main` (87 commits)                                               |
| a4c24ac | `svelte-kit sync` before Playwright in `scripts/web.mjs`                       |

Files this branch touched: `.github/workflows/test.yml`, `.github/actions/setup-playwright/`,
`scripts/web.mjs`, `scripts/tests/e2e-engine-tags.test.mjs`, `web/playwright.config.ts`,
`web/tests/tags.ts`, `web/tests/webkit-smoke.spec.ts`, `package.json`, `.claude/rules/testing.md`,
`.ruler/skills/testing/SKILL.md`, `docs/AUDIT.md`, `docs/DEPENDENCIES.md`.

## Measured baseline (green run

[30906895057](https://github.com/KyleMit/Splotch/actions/runs/30906895057), a4c24ac)

| Job                              | Duration  |
| -------------------------------- | --------- |
| Tests                            | 3m50s     |
| WebKit commit gate (fast, macOS) | 2m35s     |
| WebKit smoke                     | 1m24s     |
| Quality                          | 1m15s     |
| Release build                    | 33s       |
| **run wall clock**               | **3m53s** |

Tests job internals: checkout + `npm ci` + Playwright setup ≈ 44s · unit + asset-gen + repo-script ≈
43s · **e2e ≈ 114s** · driver smoke 8s.

macOS gate internals: setup ≈ 30s · **the perf run itself 1m58s** (so it is real work, not setup).

## Decisions made (and why)

* **Parallel job, not a trimmed dependency list.** The first approach hand-listed the WebKit apt
  packages (181 → 72). Measured slower (est. 3m08s vs 2m55s) *and* pinned ~23 soname/`t64` package
  names that break when `ubuntu-latest` moves to 26.04 — which Playwright already ships a list for.
  Reverted within the branch; its net diff is absent from PR 756. **Do not revive it.**
* **A job, not a separate workflow file.** Every GHA *job* already gets its own runner — verified:
  Tests ran on runner `1000005357`, WebKit smoke on `1000005358`, same workflow. A separate workflow
  buys only per-`paths` filtering, at the cost of duplicating `on:`/`concurrency`/`permissions`.
* **Do not build once and share the artifact across shards.** Counterintuitive but measured: a build
  job serializes shards behind `needs:` (≈81s + tests) versus each shard building concurrently
  (≈69s + tests). When runners are free, duplicated parallel work beats shared serial work.
* **`--shard`, not semantic tags, for wall clock.** Playwright's `--shard` self-balances as tests
  are added; a hand-balanced `@hot-path` split is the same silent-drift maintenance tax the apt list
  was rejected for. Tags remain the right tool for *fast signal* (run critical path first), a
  different goal.
* **Engine routing by tag** (`web/tests/tags.ts`) replaced two filename regexes that were not
  complements — a spec named `webkit-*.spec.ts` matched neither project and ran under Chromium
  silently. Resolves the P5 audit finding "webkit-smoke partition regex is declared twice", which
  was removed from `docs/AUDIT.md`.

## Unverified assumptions

* **The ~25s app-build share of the 114s e2e step is inferred, not measured.** Playwright reports
  "250 passed (1.9m)" which includes webServer startup; the build was never timed separately. Every
  shard estimate below inherits this. **Measure it first** — it drives whether 3 shards or 4 is
  right.
* **Shard balance is assumed even.** Playwright shards by file weighted by test count;
  `flows-tile-history.spec.ts` alone holds a 40.8s and a 33.1s test, so one shard may skew long.
  Check actual per-shard durations before claiming a number.
* **Splitting the macOS gate is believed possible but is not a flag flip.** `undo-scenarios.mjs`
  supports `--scenarios=a,b`, but line 588 rejects combining it with `--suite=fast`, and
  `suite === 'fast'` also drives `normalizeSharedRunnerCrayon` (line 692) and the `evaluateFastSet`
  verdict computed over the fast set *as a set*. Read ADR-0093 before assuming the set can be
  evaluated in halves.
* Estimates below (Unit ~1m07s, each e2e shard ~1m39s) are arithmetic from the baseline table, not
  observed.

## Done & verified

* PR 756 CI **green** on a4c24ac — all six checks.
* Full suite locally: **256 passed** (250 Chromium + 6 WebKit).
* `npm run check` (1095 files, 0 errors) · `test:scripts` (584) · `lint` · `lint:dead` ·
  `format:check` · `ruler:check` — all clean.
* Playwright setup step in Tests measured **63s → 20s** (the change PR 756 actually delivers).
* The tag guard fails on a hand-written `@webkti-only` probe and passes clean.
* `svelte-kit sync` fix verified both ways: with `web/.svelte-kit` deleted `test:webkit:smoke` syncs
  and passes 6; with it present, sync is skipped.
* Jobs confirmed to run on **separate runners** (ids above).

## Risks & next 3 steps

Risk: the Tests job measured 3m30s and 3m50s across two runs, and `main` grew the suite 230 → 250
Chromium tests mid-branch. **Job-level numbers are noise-dominated** — quote the step-level
measurement, and re-baseline before/after rather than against numbers in this file.

1. **Merge PR 756**, then branch fresh from the new `main`.
2. **Phase 1 — split the Tests job.** Move unit + asset-gen + repo-script into their own job (they
   need no browser and no build, and currently drag ~43s through a job that pays Playwright setup) —
   this alone is worth doing and needs no sharding. Then add a `strategy.matrix.shard: [1,2,3]` over
   `npm run test:e2e -- --shard=${{ matrix.shard }}/3`, keeping the driver smoke on shard 1. Reuse
   `./.github/actions/setup-playwright` with `browsers: chromium`. Expect wall clock ≈ **2m35s**,
   then bounded by the macOS gate. Report merging (`playwright merge-reports`) is needed if the
   combined HTML report matters; artifact names must differ per shard.
3. **Phase 2 — the macOS gate**, only if the last ~55s is wanted. Read ADR-0093 first (see
   Unverified assumptions). Would take the floor to ≈1m29s and wall clock to ≈**1m40s**.

Beyond that the floor is ~1m15–1m30s: each job carries ~44s of checkout + `npm ci` + browser setup,
so more shards stop paying after 3–4.

## Reread first

* `.github/workflows/test.yml` — the six jobs and the two-tier WebKit gate comment at the top
* `.github/actions/setup-playwright/action.yml` — the shared browser cache + `install-deps`
* `web/playwright.config.ts:163` — the `grep`/`grepInvert` project partition; worker count is
  derived from `availableParallelism()` (ADR-0078), which matters when sizing shards
* `web/tests/tags.ts` + `scripts/tests/e2e-engine-tags.test.mjs` — engine routing and its guard
* `scripts/perf/undo-scenarios.mjs:587-592` (the `--suite=fast` / `--scenarios` rejection) and
  `:691` (`normalizeSharedRunnerCrayon`) — what blocks a naive macOS split
* `docs/adrs/0093-two-tier-webkit-commit-gate-in-ci.md` and
  `docs/adrs/0078-playwright-worker-count-and-flake-tuning.md`
* `testing` skill — CI triggers, the WebKit smoke subset, flake-resistance rules
