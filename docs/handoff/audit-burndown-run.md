# Handoff — audit burndown run

> 2026-07-26 · branch `codex/audit-burndown-20260726-2` · PR
> [#550](https://github.com/KyleMit/Splotch/pull/550) · burn down the remaining staged audit
> findings with isolated Codex roles

## Objective & non-goals

Continue the scripted `docs/AUDIT.md` burndown from clean `main`, processing findings through
verification, implementation, deterministic gates, adversarial review, and repair. Keep the driver
as orchestrator; do not replace its subprocess roles with in-session subagents or move findings to
GitHub Issues.

## State

* Branch: `codex/audit-burndown-20260726-2`
* Base: `main` at 8ebfa534
* Draft PR: [#550](https://github.com/KyleMit/Splotch/pull/550)
* Starting backlog: 394 of 511 findings remaining; 88 completed and 29 deferred in prior runs
* Current backlog: 384 findings remaining; the canary fixed 5, dropped 5, and deferred 0
* Driver: idle after the successful foreground canary
* Commits: checkpoint plus the canary history in `main..HEAD`
* Files touched: 27 non-backlog files, chiefly the typed storage-key registry and its callers/tests

## Exact commands

Preflight:

```bash
AGENT_RUNNER=codex \
BRANCH='codex/audit-burndown-20260726-2' \
CHECK_CMD='npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check' \
TEST_CMD='npm run test:unit && npm run test:scripts' \
npm run audit:preflight
```

Five-fix canary:

```bash
AGENT_RUNNER=codex \
BRANCH='codex/audit-burndown-20260726-2' \
MAX_ISSUES=5 \
CHECK_CMD='npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check' \
TEST_CMD='npm run test:unit && npm run test:scripts' \
npm run audit:burndown
```

Durable continuation:

```bash
AGENT_RUNNER=codex \
BRANCH='codex/audit-burndown-20260726-2' \
CHECK_CMD='npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check' \
TEST_CMD='npm run test:unit && npm run test:scripts' \
npm run audit:burndown:overnight -- 600
```

## Decisions made (and why)

* Use a fresh branch from current `main`; historical burndown branches are already merged or retain
  old run state.
* Leave `PUSH_TEST_CMD` empty while supervised; per-finding gates and final GitHub Actions are the
  backstops.
* Keep the default Codex GPT-5.6 role mapping because this run has no measured reason to override
  it.

## Unverified assumptions

* Codex CLI authentication is still valid.
* Origin is reachable for fetch and push.
* The 600-finding overnight launcher can recover cleanly from the successful canary state.

## Done & verified

* `git status --short --branch`: clean `main` at `origin/main`.
* `npm run audit:status`: `STOPPED`, 394 findings remaining.
* No active driver was reported by the burndown status command; OS process enumeration is blocked by
  the workspace sandbox.
* Exact Codex preflight: passed with all repository-specific gates, authentication, origin, branch,
  and 394 parsed findings green.
* Five-fix canary: 5 fixed, 5 dropped, 0 deferred, 384 remaining in 44 minutes.
* Canary deletion reconciliation: each completed/dropped finding removed exactly one entry;
  intermediate repair commits removed zero.
* Resume invariant: iteration 4's implementer/fix thread ID matched; iteration 5's
  implementer/fix1/fix2 thread ID matched; all reviewer IDs were distinct.
* Manual non-backlog diff inspection: passed.
* GitHub Actions: Tests run 30207539666 passed for bc7cc18da494.
* Per-fix comments: all 5 posted to PR #550; capture completeness check found nothing pending.
* Cumulative projection from `npm run audit:cost`: about 102M tokens for the remaining 384 findings.

## Risks & next 3 steps

1. Launch the exact durable continuation and confirm its detached PID/log paths.
2. Supervise finding events and final-push CI, pausing only for a demonstrated recurring mechanism
   that is losing work.
3. Drain per-commit PR comments in the at-least-once loop and keep this checkpoint current at
   pauses.

## Closeout tasks

* Stop cleanly and confirm no driver or nested Codex call remains.
* Confirm `HEAD` equals `origin/codex/audit-burndown-20260726-2`.
* Capture and drain every pending per-commit PR comment, then capture once more.
* Reconcile fixed, deferred, and dropped counts from every `finished:` log line.
* Tidy empty source sections or delete `docs/AUDIT.md` if empty.
* Add the run summary and PR link to `docs/AUDIT-LOG.md`.
* Run relevant final checks, require final CI green, and mark the PR ready.
* Delete this consumed handoff.

## Reread first

* `.agents/skills/burn-down-audits/SKILL.md`
* `.agents/skills/testing/SKILL.md`
* `scripts/audit-burndown/burndown.mjs`
* `scripts/audit-burndown/status.mjs`
