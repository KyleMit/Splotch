# E2E tuning tooling

This capability measures Playwright worker-count tradeoffs and renders the committed evidence page
behind ADR-0078. The sweep runner owns the measurement protocol; the report generator owns the
curated datasets and deterministic scrapbook presentation.

## Entry points

| Entry point             | Public command                      | Purpose                                     |
| ----------------------- | ----------------------------------- | ------------------------------------------- |
| `run-worker-sweep.mjs`  | Direct Node / Worker Sweep workflow | Measure repeated suites at one worker count |
| `gen-tuning-report.mjs` | `npm run gen:e2e-tuning-report`     | Regenerate the E2E tuning scrapbook page    |

## Worker sweep

Run a local measurement with explicit inputs:

```sh
node tools/e2e-tuning/run-worker-sweep.mjs --workers=4 --reps=12 --out=/tmp/sweep
```

If `--out` is omitted, reports go to the unignored repository-root `sweep-runs/` directory; remove
or relocate those untracked files before staging unrelated work.

The runner requires a built preview bundle, Node, and installed Playwright/Chromium dependencies. It
creates one fresh preview server per repetition, removes `CI` and `GITHUB_ACTIONS` from the suite
environment so retries and rebuilds do not contaminate the measurement, and writes raw Playwright
JSON report per repetition under `--out`. It prints the newline-delimited `SWEEPRESULT` and
`SWEEPTOTAL` records to the job log and appends a GitHub step summary when that environment is
available.

Each failed or missing report counts as a red repetition without abandoning completed work. A
preview server that never comes up is a red repetition too, so a sweep in which every rep failed
still exits zero — gate on `SWEEPTOTAL`'s `redRuns`, not on the exit status. Only invalid
`--workers`/`--reps` values or a failure to spawn the server process exit nonzero; individual test
failures remain measurement data. Use an unused host context for this capacity-sensitive full-suite
workflow—concurrent E2E runs invalidate the result.

`tests/worker-sweep.test.mjs` owns the pure report aggregation checks and holds the runner's
explicit server environment to `web/playwright.shared.ts`. Update both together whenever the app
gains a private environment variable.

## Tuning report

`gen-tuning-report.mjs` reads the measurement literals maintained at the top of that file and writes
`scrapbook/e2e-tuning/index.html`. It needs no network or external inputs and is deterministic.
After a re-tune, replace the curated datasets, regenerate the page, format it, and commit source and
output together. Do not hand-edit the generated page.

## Maintenance

The [Worker Sweep workflow](../../.github/workflows/worker-sweep.yml) provides CI hardware, builds
the instrumented preview once per matrix job, invokes the same runner for each worker count, and
uploads raw reports. Keep the repetition loop and aggregation in the runner so local and CI
measurements cannot drift into different protocols.

Run focused verification with:

```sh
npm run test:tools -- tools/e2e-tuning/tests/worker-sweep.test.mjs
npm run gen:e2e-tuning-report
npm run format
```
