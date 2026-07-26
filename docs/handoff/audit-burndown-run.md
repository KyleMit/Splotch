# Handoff — audit burndown run

> 2026-07-26 · branch `codex/audit-burndown-20260726-3` · PR
> [#551](https://github.com/KyleMit/Splotch/pull/551) · bulk-burn down the staged audit backlog

## Objective & non-goals

Continue the scripted Codex audit burndown from current `main`, using the repository driver for
isolated verify, implement, and adversarial-review roles. Do not replace the driver with in-session
subagents, edit `docs/AUDIT.md` directly, or mix unrelated work into the branch.

## State

* Branch: `codex/audit-burndown-20260726-3`
* PR: [#551](https://github.com/KyleMit/Splotch/pull/551) (draft)
* Start point: e8bb26563df15f5c4c1ef7181affe198be6185f5e
* Backlog at start: 362 remaining of 511 total
* Run state: repaired canary complete and fully green; full overnight launch pending
* Gate overrides:
  * `CHECK_CMD='npm run format:check && npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check'`
  * `TEST_CMD='npm run test:unit && npm run test:scripts'`
  * `PUSH_TEST_CMD=''`
  * `PUSH_EVERY=1`
* Durable full-run command:

  ```bash
  AGENT_RUNNER=codex \
  BRANCH='codex/audit-burndown-20260726-3' \
  CHECK_CMD='npm run format:check && npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check' \
  TEST_CMD='npm run test:unit && npm run test:scripts' \
  PUSH_TEST_CMD='' \
  PUSH_EVERY=1 \
  npm run audit:burndown:overnight -- 600
  ```

## Decisions made (and why)

* Start from current `origin/main` on a fresh branch because historical burndown branches must not
  be reused.
* Keep the repository-specific deterministic gates from the Codex skill so format, type, token,
  generated-token, scrapbook, unit, and script checks run before review.
* Keep `PUSH_TEST_CMD` empty while supervised; CI is the full-suite backstop.

## Unverified assumptions

* Codex CLI authentication and origin access pass the driver preflight.
* The five-fix canary passes deterministic gates, adversarial review, and branch CI.
* The previous `.audit-work/STOP` marker is disposable historical run state.

## Done & verified

* Confirmed `main` is clean and equals `origin/main` at e8bb26563df15f5c4c1ef7181affe198be6185f5e.
* Confirmed no audit burndown driver process is active.
* Confirmed 362 audit findings remain.
* Passed the exact Codex preflight with origin, authentication, backlog parsing, and build gates
  green.
* Opened draft PR [#551](https://github.com/KyleMit/Splotch/pull/551).
* First canary segment:
  * Fixed one finding after one adversarial repair round.
  * Dropped three invalid or already-fixed findings.
  * Deferred three findings after implementation failures.
  * Halted at the three-consecutive-deferral threshold with 355 findings remaining.
* Diagnosed one recurring mechanical cause: untracked tests from the first failed role contaminated
  the next two unit runs because `git reset --hard` does not remove untracked files.
* Committed and pushed 20c121b1, which removes only current-role untracked residue during rollback,
  treats untracked files as dirty in preflight/resume, and adds regression coverage.
* Verified the repair with the untracked-only preflight probe, the repository quality gate, 728 app
  unit tests, and 96 script tests.
* Repaired canary segment:
  * Fixed five findings, dropped two invalid findings, and deferred one finding.
  * Finished cleanly with 347 findings remaining.
* Canary totals across both segments: six fixed, five dropped, and four deferred.
* Inspected the complete code-only diff; no non-equivalent call sites, accidental constant coupling,
  or erased runtime guards found.
* Reconciled every branch commit: each consumed finding removed exactly one audit entry, and no
  commit removed two.
* Confirmed every current repair round resumed the exact implementer thread while each reviewer used
  a distinct thread.
* Posted all six pending per-fix comments to PR [#551](https://github.com/KyleMit/Splotch/pull/551).
* Required exact-head CI on 25ceeaaba7c958b1572df6fa0905d2d679151462: Quality and Tests both passed.
* Cost projection at the canary checkpoint: 347 findings, about 477 million tokens, and roughly 21
  hours at the observed rate.

## Risks & next 3 steps

1. Commit and push this updated checkpoint, then launch the durable full-run command above.
2. Supervise driver events, independent CI checkpoints, and per-fix comments; stop immediately on a
   completed CI failure.
3. Complete the recorded closeout tasks when the backlog drains or the user requests wrap-up.

Closeout must stop cleanly, match local HEAD to origin, capture and drain all per-commit comments,
reconcile every `finished:` line, tidy the audit backlog, add the `burn-down-audits` row to
`docs/AUDIT-LOG.md`, run final quality and test suites, require final CI green, mark the PR ready,
and delete this handoff.

## Reread first

* `.agents/skills/burn-down-audits/SKILL.md`
* `docs/handoff/AGENTS.md`
* `scripts/audit-burndown/burndown.mjs`
* `scripts/audit-burndown/status.mjs`
