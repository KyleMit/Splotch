# Flaky digest

Sums the masked flakes that CI retries hide. `web/playwright-flaky-reporter.ts` writes a
`flaky.json` record into every Playwright report artifact the Tests workflow uploads; this
capability reads those records back, keeps them past the artifacts' expiry, and ranks the tests that
passed only on retry.

## Entry point

```bash
npm run gen:flaky-digest
```

`tools/flaky-digest/gen-flaky-digest.mjs` does one harvest and writes one digest:

| Flag                  | Default                     | Meaning                                                                     |
| --------------------- | --------------------------- | --------------------------------------------------------------------------- |
| `--out <dir>`         | `test-results/flaky-digest` | Where the three output files go                                             |
| `--history <file>`    | —                           | Continue this local `flaky-history.json` instead of the CI history artifact |
| `--fresh`             | off                         | Start an empty history                                                      |
| `--days <n>`          | `7`                         | Ranking window, at most `HISTORY_RETENTION_DAYS`                            |
| `--repo <owner/name>` | `KyleMit/Splotch`           | Repository to read                                                          |

Auth comes from `GITHUB_TOKEN`, then `GH_TOKEN`, then `gh auth token`. The token needs read access
to Actions. Reading an artifact runs the system `unzip`, which macOS and the Ubuntu runners both
ship.

Locally, the default continues the newest `flaky-digest-history` artifact the scheduled workflow
uploaded, so a run only downloads the report artifacts created since that harvest.

## Outputs

* `flaky-history.json` — the persisted history: every Tests run listed, its report job executions
  (deduplicated across re-run attempts), and every report artifact with the outcome of reading it
  and the record it held.
* `flaky-digest.json` — the ranking and coverage for the window. Each ranked test carries total,
  `trunk`, and `branch` event counts and every occurrence with run id and URL, attempt, branch,
  event, record SHA and head SHA, date, shard, and artifact name. `trunk` is `main` outside pull
  requests; `branch` is everything else, so debt on `main` is never mixed with a flake a branch
  introduced.
* `flaky-digest.md` — the same digest as Markdown. The workflow also appends it to its job summary.

## Retention strategy: a persisted history on a schedule

Report artifacts expire after 7 days, and a digest over only the live artifacts would quietly shrink
its window whenever it ran late. The decision here is to **persist what is read** rather than to
re-read the live window on each run:

* `.github/workflows/flaky-digest.yml` runs every three hours. Each run downloads the previous run's
  `flaky-digest-history` artifact, reads the report artifacts it has not read yet, and uploads the
  rolled-forward history again (with the digest beside it).
* The history keeps `HISTORY_RETENTION_DAYS` of runs regardless of how long one history artifact is
  retained; the artifact's 30-day retention only bounds how long the chain survives the schedule
  stopping.
* Re-reading the live window every time was rejected for rate limits, not simplicity. A workflow's
  `GITHUB_TOKEN` allows 1,000 requests an hour, every report zip costs one, and a busy week holds
  several thousand report artifacts. Reading only what is new keeps a scheduled run to a few
  hundred.
* Committing the history to the repository was rejected: it needs a write token in a scheduled job
  and turns a CI digest into commits on `main`.

The harvester stops downloading when the remaining rate limit falls to
`RATE_LIMIT_RESERVE_REQUESTS`, or at the first rate-limited download, saves what it read, and leaves
the rest pending for the next run, soonest-expiring first. The budget it watches is the one every
`/actions` endpoint and artifact zip draws on, read from those responses' headers;
`gh api rate_limit` does not report it, so a local run can exhaust it while that endpoint still
shows the full allowance.

## What is and is not a sample

A **sample** is a report job whose `flaky.json` was read, has the schema version this reader
understands (`READABLE_FLAKY_RECORD_SCHEMA_VERSION`), and finished `passed` or `failed`. Every
report job in the window that is not a sample is listed as a **gap** with its reason — never counted
as a clean run:

| Reason                                  | Meaning                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| `pending`                               | Listed but not read yet (rate-limit budget)                                    |
| `expired-unread`                        | Expired before any harvest read it                                             |
| `unreadable`                            | Download or parse failed; retried next harvest while the artifact lives        |
| `no-record`                             | The report zip holds no `flaky.json`                                           |
| `unsupported-schema-<n>`                | A record version this reader does not understand; bump the reader, never guess |
| `status-interrupted`, `status-timedout` | The run was cut short, so its record would read as a small clean sample        |
| `no-artifact`                           | The job reached a verdict but no artifact of its name exists                   |
| `replaced-by-later-attempt`             | A re-run's upload replaced this attempt's artifact                             |
| `job-cancelled`, `job-skipped`, …       | The job never reached its upload step                                          |
| `jobs-unavailable`                      | The run's job list could not be read                                           |
| `run-in-progress`                       | The run had not finished at the latest harvest                                 |

The digest also warns when the history does not reach back to the window start, when two harvests
are further apart than artifact retention, when the latest harvest is stale, and on any per-item
error from the latest harvest.

## Failure behavior

* Per-item failures (one download, one run's job or artifact list) and a rate limit reached while
  listing a run's jobs and artifacts or downloading are recorded in the history and the digest, and
  the run still succeeds, so what was read is persisted.
* A rejected token, or a rate limit exhausted while listing the Tests runs, is fatal. The workflow
  then uploads nothing, and the previous history artifact stays the newest.
* A history with an unknown `schemaVersion` is fatal rather than restarted, since restarting would
  discard records whose artifacts have expired.
* With no history artifact at all, the run fails and asks for `--fresh` (the workflow's `fresh`
  dispatch input). A new history is a deliberate act, and its digest says how far back it reaches.

## Maintenance

* `lib/flaky-history.mjs` owns the record and history contracts and the job-name → artifact-name
  mapping; `tests/flaky-digest-workflow.test.mjs` fails if `test.yml` renames a report job or
  artifact, changes report retention, or `flaky-digest.yml` renames the history artifact.
* A reporter `FLAKY_RECORD_SCHEMA_VERSION` bump fails `tests/flaky-history.test.mjs` until
  `classifyRecordText` understands the new record.
* `lib/github-actions-api.mjs` is the only module that touches the network; the harvest and digest
  tests substitute a fake.
