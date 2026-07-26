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
* Driver: stopped; the prior run left `.audit-work/STOP`
* Commits: this checkpoint only
* Files touched: `docs/handoff/audit-burndown-run.md`

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
* The prior run's disposable `.audit-work` state will be safely replaced by fresh preflight state.

## Done & verified

* `git status --short --branch`: clean `main` at `origin/main`.
* `npm run audit:status`: `STOPPED`, 394 findings remaining.
* No active driver was reported by the burndown status command; OS process enumeration is blocked by
  the workspace sandbox.

## Risks & next 3 steps

1. Commit and push this checkpoint, open the draft PR, then replace “pending” with its PR link.
2. Run the exact preflight and five-fix canary; inspect all non-backlog diffs, deletion counts,
   resume thread IDs when applicable, cost, and final canary CI.
3. Launch the durable continuation, supervise events and CI, and drain per-commit PR comments.

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
