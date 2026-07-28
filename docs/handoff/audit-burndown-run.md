# Handoff — audit burndown run

> 2026-07-27 · branch `audit/burndown-20260727-codex-2` · PR pending · Burn down the staged audit
> backlog with the Codex driver

## Objective & non-goals

Drive the scripted audit burndown through isolated Codex verifier, implementer, and reviewer roles.
Supervise every bounded segment, require exact-head CI checkpoints, and close out the campaign
according to the `burn-down-audits` skill.

Do not replace the driver with in-session subagents, edit `docs/AUDIT.md` directly, or leave a
driver running without CI and comment supervision.

## State

| Item                   | Value                               |
| ---------------------- | ----------------------------------- |
| Branch                 | `audit/burndown-20260727-codex-2`   |
| Base                   | `main` at 63a7aa49ed34              |
| PR                     | pending                             |
| Initial backlog        | 45 findings                         |
| `run.log` baseline     | 2,221 lines                         |
| State                  | Initial checkpoint before preflight |
| Last Quality-green SHA | none                                |
| Last fully-green SHA   | none                                |

No burndown commit has landed on this continuation yet.

### Preflight command

```bash
AGENT_RUNNER=codex \
BRANCH='audit/burndown-20260727-codex-2' \
CHECK_CMD='npm run format:check && npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check' \
TEST_CMD='npm run test:unit && npm run test:scripts' \
npm run audit:preflight
```

### Canary command

```bash
AGENT_RUNNER=codex \
BRANCH='audit/burndown-20260727-codex-2' \
MAX_ISSUES=5 \
PUSH_EVERY=1 \
CHECK_CMD='npm run format:check && npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check' \
TEST_CMD='npm run test:unit && npm run test:scripts' \
npm run audit:burndown
```

### Durable continuation command

```bash
AGENT_RUNNER=codex \
BRANCH='audit/burndown-20260727-codex-2' \
MAX_HANDLED=5 \
PUSH_EVERY=1 \
CHECK_CMD='npm run format:check && npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check' \
TEST_CMD='npm run test:unit && npm run test:scripts' \
npm run audit:burndown:overnight -- 600
```

## Decisions made (and why)

* Started from current `main`, which exactly matched `origin/main` at 63a7aa49ed34.
* Chose a fresh continuation branch because all shorter date-based names already existed locally and
  on origin.
* Kept `PUSH_EVERY=1` and the repository-specific deterministic gates required by the skill.

## Unverified assumptions

* Codex CLI authentication is still valid.
* Origin is reachable from the audit subprocess host.
* The current 45-finding backlog parses cleanly in preflight.
* The GitHub Actions branch workflow is healthy on this continuation.

## Done & verified

* Confirmed the worktree was clean on `main`.
* Confirmed `main` and `origin/main` both resolved to 63a7aa49ed34.
* Confirmed no `overnight.mjs` or `burndown.mjs` process was active.
* Counted 45 findings through `pop.mjs --count`.
* Recorded the existing `.audit-work/logs/run.log` baseline at 2,221 lines.

## Risks & next 3 steps

1. Commit and push this checkpoint, then run preflight and require every check green.
2. Open a draft PR, replace `PR: pending` with its number, and push the second checkpoint.
3. Run and inspect the five-fix canary, require exact-head CI green, and only then launch bounded
   continuation segments.

## Closeout tasks

* Stop cleanly and confirm no driver or nested Codex call remains.
* Confirm local `HEAD` equals `origin/audit/burndown-20260727-codex-2`.
* Capture and drain every pending per-commit PR comment.
* Reconcile post-baseline terminal events against `initial backlog - remaining`.
* Verify the remaining count with `pop.mjs --count`; delete `docs/AUDIT.md` only if it reaches zero.
* Add the `burn-down-audits` result to `docs/AUDIT-LOG.md`.
* Run formatting, relevant quality checks, deterministic local tests, and exact-head CI.
* Delete this consumed handoff, inspect and commit closeout changes, push, update the PR body, and
  mark the PR ready.

## Reread first

* [Codex burn-down-audits skill](../../.agents/skills/burn-down-audits/SKILL.md)
* [Audit backlog](../AUDIT.md)
* [Audit log](../AUDIT-LOG.md)
* [Audit driver](../../scripts/audit-burndown/burndown.mjs)
