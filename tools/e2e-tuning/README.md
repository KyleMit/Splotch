# E2E tuning tooling

This capability measures Playwright worker-count tradeoffs and renders the committed evidence page
behind ADR-0078. The sweep runner owns the measurement protocol; the report generator owns the
curated datasets and deterministic scrapbook presentation.

## Entry points

| Entry point             | Public command                  | Purpose                                     |
| ----------------------- | ------------------------------- | ------------------------------------------- |
| `run-worker-sweep.mjs`  | `npm run test:e2e:sweep`        | Measure repeated suites at one worker count |
| `gen-tuning-report.mjs` | `npm run gen:e2e-tuning-report` | Regenerate the E2E tuning scrapbook page    |

## Worker sweep

Run a local measurement with explicit inputs:

```sh
npm run test:e2e:sweep -- --workers=4 --reps=12 --out=/tmp/sweep
```

If `--out` is omitted, reports go to the unignored repository-root `sweep-runs/` directory; remove
or relocate those untracked files before staging unrelated work.

The runner needs Node and installed Playwright/Chromium dependencies. It builds the instrumented
preview bundle once up front (pass `--prebuilt` to skip that when the caller just built, as the CI
sweep smoke does), then runs one `playwright test` invocation per repetition with
`SPLOTCH_E2E_PREBUILT` set so each repetition's Playwright-owned web server serves that bundle
preview-only — one fresh server per repetition, env declared by `commonWebServer.env`. It removes
`CI` and `GITHUB_ACTIONS` from the suite environment so retries do not contaminate the measurement,
writes a raw Playwright JSON report per repetition under `--out`, and prints the newline-delimited
`SWEEPRESULT` and `SWEEPTOTAL` records to the job log plus a GitHub step summary when that
environment is available. `--grep=<pattern>` narrows a repetition to matching tests — that is what
`npm run test:sweep:smoke` uses to prove the harness end-to-end in CI.

Each failed, missing, or **empty** report counts as a red repetition without abandoning completed
work: a repetition whose report holds zero test executions (skipped rows are not executions, and a
stale report from a previous run at the same `--out` is deleted before the repetition starts, so it
cannot stand in for a missing one) is red with the report's own recorded error as its reason, so an
aborted run can never read as "0 failures" (issue 1044). A sweep in which some repetitions failed
still exits zero — gate on `SWEEPTOTAL`'s `redRuns`, not on the exit status. The exit code turns
nonzero only for invalid `--workers`/`--reps` values, a failed build, or a sweep in which **no**
repetition executed a single test — a harness that measured nothing must not exit as if it verified
something. Individual test failures remain measurement data. Use an unused host context for this
capacity-sensitive full-suite workflow—concurrent E2E runs invalidate the result.

`tests/worker-sweep.test.mjs` owns the pure report-aggregation checks (including the
zero-execution-is-red accounting) and drift-guards the `SPLOTCH_E2E_PREBUILT` handshake between the
runner and `web/playwright.config.ts`.

## Tuning report

`gen-tuning-report.mjs` reads the measurement literals maintained at the top of that file and writes
`scrapbook/e2e-tuning/index.html`. It needs no network or external inputs and is deterministic.
After a re-tune, replace the curated datasets, regenerate the page, format it, and commit source and
output together. Do not hand-edit the generated page.

## Maintenance

The [Worker Sweep workflow](../../.github/workflows/worker-sweep.yml) provides CI hardware, invokes
the same runner for each worker count, and uploads raw reports. Keep the build, repetition loop, and
aggregation in the runner so local and CI measurements cannot drift into different protocols.
`npm run test:sweep:smoke` runs one grepped repetition on every pull request (test.yml, shard 1) so
a Playwright-config change that breaks the harness surfaces immediately instead of at the next
re-tune.

Run focused verification with:

```sh
npm run test:tools -- tools/e2e-tuning/tests/worker-sweep.test.mjs
npm run gen:e2e-tuning-report
npm run format
```
