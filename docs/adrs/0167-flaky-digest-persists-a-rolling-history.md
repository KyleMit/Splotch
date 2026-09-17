# ADR-0167: The Flaky Digest Persists a Rolling History on a Schedule

**Status:** Active **Date:** 2026-09

## Context

`web/playwright-flaky-reporter.ts` writes a `flaky.json` record into every Playwright report
artifact the Tests workflow uploads, so masked flakes (tests that passed only on retry, ADR-0078)
can be summed across runs. Those artifacts are retained for 7 days. A digest that reads them has to
beat that expiry, or it silently samples a shrinking window and reports the missing days as nothing.

Three shapes were weighed:

* **Re-read the live window on every run.** Simplest, and needs no state. Rejected for its request
  cost: a workflow's `GITHUB_TOKEN` allows 1,000 Actions API requests an hour, each report zip is
  one request, and one measured week held 381 Tests runs and 3,735 shard records. A full re-read
  cannot fit one run's budget, and a local run with a personal token spends most of an hour's
  allowance.
* **Commit the history to the repository.** Durable and diffable, but it needs a write token in a
  scheduled job and turns a CI digest into a stream of commits on `main`.
* **Carry the history forward as an artifact on a schedule.** Each run starts from the previous
  run's history artifact, reads only what it has not read, and uploads the result.

## Decision

Take the third shape. `.github/workflows/flaky-digest.yml` runs every three hours with
`actions: read`. `tools/flaky-digest/gen-flaky-digest.mjs` downloads the newest
`flaky-digest-history` artifact, relists the Tests runs in the report retention window with each new
or re-run run's jobs and artifacts, reads the unread report artifacts soonest-expiring first until
the Actions rate limit reaches `RATE_LIMIT_RESERVE_REQUESTS`, and writes `flaky-history.json` plus
the digest. The workflow uploads all three and appends the Markdown digest to its job summary.
`tools/flaky-digest/README.md` is the operating reference.

Invariants a change must keep:

* **A missing input is a gap, never a clean run.** The digest pairs every report job execution
  (deduplicated across re-run attempts) with the artifact it uploaded and names each job that did
  not yield a counted record: pending, expired unread, unreadable, no record, unsupported schema,
  interrupted or timed-out status, no artifact, replaced by a later attempt, job cancelled, jobs
  unavailable, or run in progress.
* **Schema versions are checked, not assumed.** The record reader holds its own
  `READABLE_FLAKY_RECORD_SCHEMA_VERSION`, which a test pins to the producer's constant, so a
  producer bump fails CI until the reader learns the new shape. An unknown history `schemaVersion`
  is fatal rather than restarted, since restarting would drop records whose artifacts have expired.
* **A new history is deliberate.** With no history artifact the run fails and asks for the `fresh`
  dispatch input.
* **`main` and branch results stay apart.** Counts split into `trunk` (`main` outside pull requests)
  and `branch`, and every occurrence keeps run id, attempt, branch, event, SHAs, date, and shard.
* The job names and artifact names the harvester matches, report retention, and the history artifact
  name are pinned against both workflows by
  `tools/flaky-digest/tests/flaky-digest-workflow.test.mjs`.

## Consequences

* \+ The digest window is bounded by `HISTORY_RETENTION_DAYS`, not by report retention, and a
  scheduled run costs a few hundred requests.
* \+ A late or failed run only delays reading: the next run relists the retention window, and an
  outage longer than retention is listed back to the last harvest so its losses appear as gaps.
* − The history is a chain. If the schedule stops for longer than the history artifact's 30-day
  retention, the chain breaks and needs a `fresh` start that cannot recover what expired.
* − The first harvest of a fresh history may not read a busy week within its budget; the remainder
  is read by later runs while it lives, and whatever expires first is reported as `expired-unread`.
* − Artifacts replaced by a re-run's upload are unrecoverable; they are counted as
  `replaced-by-later-attempt` rather than sampled.
