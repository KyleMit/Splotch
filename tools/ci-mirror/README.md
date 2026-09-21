# CI mirror

Runs a CI job from `.github/workflows/test.yml` locally, with the same commands in the same order.
Each mirror is a local reproduction of one browser-free job, so a green local run predicts a green
job instead of a later red one.

## Entry points

| Command                    | Script                      | Mirrors the job                     |
| -------------------------- | --------------------------- | ----------------------------------- |
| `npm run check:quality`    | `run-quality-checks.mjs`    | `quality` ("Quality")               |
| `npm run test:browserless` | `run-browserless-tests.mjs` | `browserless` ("Browserless tests") |

Each script owns its command list (`QUALITY_COMMANDS`, `BROWSERLESS_TEST_COMMANDS`) and hands it to
`lib/job-mirror.mjs`. That module runs every command from the repository root and continues after a
failure, unlike CI, so one run reports every failing step instead of one step per push.

The browser jobs (the sharded Playwright `Tests`, the Firefox and WebKit smokes, page-load
performance) have no mirror here. Run their `test:*` commands directly. `npm test` does not mirror a
job: it adds the Playwright suite and omits `test:api:smoke`.

## Inputs and outputs

Both mirrors write only what their commands write. Output is the commands' own output, then a
summary line that names each failed command.

## Prerequisites

Installed dependencies (`pnpm install`). `test:browserless` ends with `test:api:smoke`, which starts
a throwaway Vite dev server on `SMOKE_PORT`. In a concurrent worktree, set `SMOKE_PORT` to an unused
port, for example `SMOKE_PORT=5287 npm run test:browserless`.

## Failure behavior

The exit code is nonzero when any command fails, and the summary lists every failed command. A
failure does not stop the run, so the steps after it still run and report.

## Maintenance

A workflow file cannot import from a Node module, so each command list is a copy of its job's `run:`
steps. `tests/run-quality-checks.test.mjs` and `tests/run-browserless-tests.test.mjs` read the job
steps from `test.yml` through `tests/workflow-job-steps.mjs`. Each test fails when its job or its
script gets, loses, or reorders a command. When you add a step to one of these jobs, add it to the
matching list. When you rename a job, update the job key in its test.

The parser reads single-line `run:` values only. A multi-line `run: |` step makes the guard fail, so
it cannot pass without checking the step.

```sh
npm run test:tools -- ci-mirror/tests
```
