# Handoff — audit burndown run

> 2026-07-27 · branch `audit/burndown-20260727` · PR
> [#554](https://github.com/KyleMit/Splotch/pull/554) · burn down the staged audit backlog with
> supervised Codex roles

## Objective & non-goals

Run the Codex audit-burndown driver through bounded, CI-supervised segments until the current
`docs/AUDIT.md` backlog is exhausted or the user asks to pause or wrap up.

Do not replace the driver with in-session agents, edit `docs/AUDIT.md` directly, run without exact-
head CI supervision, or change tracked files while the driver is active.

## State

* Branch: `audit/burndown-20260727`, created from `main` at
  `63b94e91fcd1ab6d01aaf94b0b8c240098559006`.
* PR: [#554](https://github.com/KyleMit/Splotch/pull/554), draft.
* Initial backlog: 183 findings, measured with `node scripts/audit-burndown/pop.mjs --count`.
* Historical `run.log` baseline: 1,206 lines. Reconcile only later `finished:` and terminal-event
  lines.
* Run state: initialized; no driver process is active. A historical `.audit-work/STOP` is present
  and must be cleared only by the launch/resume path.

| SHA      | What                                 |
| -------- | ------------------------------------ |
| 7d6320a5 | Initial checkpoint and launch packet |
| pending  | Record draft PR and green preflight  |

Files touched so far: `docs/handoff/audit-burndown-run.md`.

## Decisions made (and why)

* Use a fresh date-scoped continuation branch rather than reusing any historical burndown branch, as
  required by the Codex runbook.
* Keep `PUSH_EVERY=1`, an empty `PUSH_TEST_CMD`, and `MAX_HANDLED=5`; CI and GitHub comment
  checkpoints remain mandatory between bounded segments.
* Use the repository-specific deterministic gates and the default GPT-5.6 Codex role mapping.

## Exact commands

Preflight and canary:

```bash
AGENT_RUNNER=codex \
BRANCH='audit/burndown-20260727' \
CHECK_CMD='npm run format:check && npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check' \
TEST_CMD='npm run test:unit && npm run test:scripts' \
npm run audit:preflight

AGENT_RUNNER=codex \
BRANCH='audit/burndown-20260727' \
MAX_ISSUES=5 \
CHECK_CMD='npm run format:check && npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check' \
TEST_CMD='npm run test:unit && npm run test:scripts' \
npm run audit:burndown
```

Durable bounded launch:

```bash
AGENT_RUNNER=codex \
BRANCH='audit/burndown-20260727' \
MAX_HANDLED=5 \
CHECK_CMD='npm run format:check && npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check' \
TEST_CMD='npm run test:unit && npm run test:scripts' \
npm run audit:burndown:overnight -- 600
```

## Unverified assumptions

* The canary has not yet established that the remaining findings can pass deterministic gates,
  adversarial review, push, exact-head CI, and comment backfill on this branch.

## Done & verified

* `git fetch origin`: succeeded.
* `git rev-parse HEAD` and `git rev-parse origin/main`: both
  `63b94e91fcd1ab6d01aaf94b0b8c240098559006` before branch creation.
* Host process lookup for `scripts/audit-burndown/(overnight|burndown).mjs`: no active driver.
* Worktree was clean before this handoff was added.
* Initial backlog count and historical log baseline were measured without reading `docs/AUDIT.md`
  directly.
* `npm run audit:preflight`: passed with Codex CLI 0.145.0 logged in, runner `codex`, branch
  `audit/burndown-20260727`, origin reachable, 183 findings parsed, and the complete configured
  build gate green.
* Draft PR [#554](https://github.com/KyleMit/Splotch/pull/554) is open against `main`.

## Risks & next 3 steps

1. Commit and push this PR/preflight checkpoint, then run the five-fix foreground canary.
2. Inspect every canary diff and deletion count and confirm any fix-round thread resume.
3. Require exact-head CI green, drain pending comments, review cost, then start one bounded full
   segment.

Closeout must stop all driver and nested Codex processes; prove local `HEAD` equals the remote;
capture and drain all comments; reconcile the 1,206-line run baseline; tidy the backlog; add the
`burn-down-audits` row to `docs/AUDIT-LOG.md`; run formatting, relevant quality gates, and the full
test suite; delete this handoff; push; finalize the PR body; require exact-head CI green; and mark
the PR ready.

## Reread first

* [Codex burn-down skill](../../.agents/skills/burn-down-audits/SKILL.md)
* [Burndown driver](../../scripts/audit-burndown/burndown.mjs)
* [Comment backfill helper](../../scripts/audit-burndown/backfill-comments.mjs)
* [Handoff conventions](CLAUDE.md)
