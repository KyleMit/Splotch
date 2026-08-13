# Audit burndown tooling

This capability turns the staged findings in `docs/AUDIT.md` into independently verified fixes. The
driver gives each finding to isolated verifier, implementer, and adversarial-review sessions, then
commits and pushes accepted outcomes one finding at a time. The runner-specific `burn-down-audits`
skill is the operational runbook and must be read before launching or changing the workflow.

## Entry points

| Entry point             | Public command                     | Purpose                                      |
| ----------------------- | ---------------------------------- | -------------------------------------------- |
| `check-preflight.mjs`   | `npm run audit:preflight`          | Validate a run without changing tracked data |
| `run-burndown.mjs`      | `npm run audit:burndown`           | Process a bounded set of staged findings     |
| `launch-overnight.mjs`  | `npm run audit:burndown:overnight` | Launch the driver as a detached process      |
| `show-status.mjs`       | `npm run audit:status`             | Summarize backlog and live-run state         |
| `show-cost.mjs`         | `npm run audit:cost`               | Report recorded model usage and projections  |
| `watch-run.mjs`         | `npm run audit:watch`              | Follow the run log or refreshing status      |
| `pop-finding.mjs`       | Internal runbook command           | Read or remove one finding deterministically |
| `backfill-comments.mjs` | Internal closeout command          | Rebuild and drain per-commit PR feedback     |

The `audit:*` npm commands are the stable public surface. Direct `node tools/audit-burndown/...`
calls are reserved for the skill's supervised recovery and comment-drain procedures.

## Inputs and outputs

The input backlog is `docs/AUDIT.md`, or the explicit `AUDIT_FILE` override documented by the skill.
Accepted fixes, invalid drops, and deferrals become Git commits; deferrals also update
`docs/AUDIT-DEFERRED.md`. Runtime state, role envelopes, logs, launch metadata, and pending PR
comments live under the gitignored `.audit-work/` directory unless a run deliberately assigns a
durable `COMMENT_STORE`.

`prompts/` owns the runner-neutral role contracts. `lib/agent-runner.mjs` owns Claude Code and Codex
invocation, authentication probes, session resume, and output normalization; `lib/burndown-core.mjs`
owns the shared state and backlog operations; and `lib/comment-sync.mjs` owns GitHub-bound comment
rendering. These support modules are not standalone commands.

## Prerequisites and failure behavior

A run needs a clean Git worktree, reachable `origin`, installed project dependencies, a valid audit
backlog, and an authenticated supported agent runner. `check-preflight.mjs` verifies those
conditions and exits nonzero on a blocking failure. The driver rolls an unsuccessful finding back,
preserves accepted work in commits, and stops after repeated systemic failures; the skill defines
the exact pause, resume, monitoring, comment-drain, and closeout procedures.

Never edit tracked files while a burndown is running: its rollback paths may discard concurrent
work. Never bypass `pop-finding.mjs` for backlog surgery at burndown scale, and keep the Claude and
Codex `burn-down-audits` provider packages independently maintained when behavior or paths change.

Focused verification:

```sh
npm run test:tools -- tools/audit-burndown/tests
npm run format:check
```
