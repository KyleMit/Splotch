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
* Run state: preflight passed; five-fix canary not yet run
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

## Risks & next 3 steps

1. Commit and push this updated checkpoint, then run and inspect the five-fix foreground canary.
2. Require canary CI green and drain its pending per-commit comments.
3. Inspect cost and launch the durable full-run command above under active supervision.

Closeout must stop cleanly, match local HEAD to origin, capture and drain all per-commit comments,
reconcile every `finished:` line, tidy the audit backlog, add the `burn-down-audits` row to
`docs/AUDIT-LOG.md`, run final quality and test suites, require final CI green, mark the PR ready,
and delete this handoff.

## Reread first

* `.agents/skills/burn-down-audits/SKILL.md`
* `docs/handoff/AGENTS.md`
* `scripts/audit-burndown/burndown.mjs`
* `scripts/audit-burndown/status.mjs`
