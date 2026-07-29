# Handoff — audit burndown run

> 2026-07-29 · branch `audit/burndown-2026-07-29-codex` · supervise a bounded Codex audit burndown

## Objective & non-goals

Burn down `docs/AUDIT.md` through the scripted Codex verifier, implementer, and adversarial-review
pipeline. Keep every segment bounded by five terminal outcomes and a 20-minute manual deadline.

Do not bypass the driver, edit the backlog directly, leave a segment unsupervised, or replace the
driver's isolated `codex exec` roles with in-session subagents.

## State

* Branch: `audit/burndown-2026-07-29-codex`
* PR: pending
* Initial backlog: 593 findings
* `run.log` baseline: 2511 lines
* Driver state: idle; no matching host process before branch creation
* Commits: initial checkpoint pending
* Files touched: `docs/handoff/audit-burndown-run.md`

Durable relaunch command:

```bash
AGENT_RUNNER=codex \
  BRANCH='audit/burndown-2026-07-29-codex' \
  MAX_HANDLED=5 \
  CHECK_CMD='npm run format:check && npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check' \
  TEST_CMD='npm run test:unit && npm run test:scripts' \
  npm run audit:burndown:overnight -- 600
```

Canary command:

```bash
AGENT_RUNNER=codex \
  BRANCH='audit/burndown-2026-07-29-codex' \
  MAX_ISSUES=5 \
  MAX_HANDLED=5 \
  CHECK_CMD='npm run format:check && npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check' \
  TEST_CMD='npm run test:unit && npm run test:scripts' \
  npm run audit:burndown
```

## Decisions made (and why)

* Start from current `main` at f0982b1f because it exactly matched `origin/main` after fetching.
* Use a fresh continuation branch because the previous campaign branch was closed and this run had
  no active handoff.
* Retain the repository-specific deterministic gates required by the Codex burndown runbook.

## Unverified assumptions

* Codex authentication and origin reachability will pass preflight.
* The first canary will exercise at least one accepted fix through commit, gates, review, push, and
  comment capture.
* GitHub Actions will accept and complete checks for the fresh branch.

## Done & verified

* `git fetch origin` completed successfully.
* `git status --short --branch` reported a clean `main` matching `origin/main`.
* `node scripts/audit-burndown/pop.mjs --count` reported 593.
* `wc -l .audit-work/logs/run.log` reported 2511.
* `pgrep -fl 'scripts/audit-burndown/(overnight|burndown)\.mjs'` found no active driver.

## Risks & next 3 steps

1. Commit and push this checkpoint, run preflight, then open the draft PR.
2. Record the PR number in this file, commit and push the second checkpoint, then run and inspect
   the bounded canary.
3. Require exact-head CI green, drain pending comments, inspect cost, and supervise bounded full-run
   segments.

Closeout must stop the driver cleanly, reconcile scoped outcomes from line 2512 onward, drain and
recapture comments, update `docs/AUDIT-LOG.md`, remove this handoff, push the closeout commit,
update the PR body, require exact-head CI green, and mark the PR ready.

## Reread first

* `.agents/skills/burn-down-audits/SKILL.md`
* `scripts/audit-burndown/burndown.mjs`
* `scripts/audit-burndown/overnight.mjs`
* `scripts/audit-burndown/status.mjs`
