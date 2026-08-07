# Handoff — audit burndown run

> 2026-08-07 · branch `audit/burndown-20260807-2` · PR pending · burn down the staged audit backlog
> with isolated Codex roles

## Objective & non-goals

Burn down `docs/AUDIT.md` through the scripted verify → implement → adversarial-review → fix
workflow. Do not bypass driver-owned finding deletion, protected state, deterministic gates,
exact-head CI checkpoints, or per-commit PR comments.

## State

* Branch: `audit/burndown-20260807-2`
* PR: pending
* Initial backlog: 40 findings
* `run.log` baseline: 2853 lines
* Driver state at campaign start: stopped; `.audit-work/STOP` present
* Starting commit: 42ed9a8a6f741ee1d711696c9a78a674e994997e

## Exact commands

Preflight:

```bash
AGENT_RUNNER=codex \
  BRANCH='audit/burndown-20260807-2' \
  CHECK_CMD='npm run format:check && npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check' \
  TEST_CMD='npm run test:unit && npm run test:scripts' \
  npm run audit:preflight
```

Canary:

```bash
AGENT_RUNNER=codex \
  BRANCH='audit/burndown-20260807-2' \
  MAX_ISSUES=5 \
  MAX_HANDLED=5 \
  PUSH_EVERY=1 \
  CHECK_CMD='npm run format:check && npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check' \
  TEST_CMD='npm run test:unit && npm run test:scripts' \
  npm run audit:burndown
```

Bounded continuation segment:

```bash
AGENT_RUNNER=codex \
  BRANCH='audit/burndown-20260807-2' \
  MAX_HANDLED=5 \
  PUSH_EVERY=1 \
  CHECK_CMD='npm run format:check && npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check' \
  TEST_CMD='npm run test:unit && npm run test:scripts' \
  npm run audit:burndown:overnight -- 600
```

## Decisions made (and why)

* Use a fresh continuation branch because historical burndown branches must not be reused.
* Keep `PUSH_EVERY=1`, `PUSH_TEST_CMD` empty, and `MAX_HANDLED=5` so each accepted finding reaches
  origin and each segment stops for exact-head CI and comment checkpoints.

## Unverified assumptions

* Preflight and every deterministic base gate are green at the starting commit.
* The draft PR can be opened after this initial checkpoint reaches origin.
* Isolated Codex role calls remain authenticated and within subscription limits.

## Done & verified

* Confirmed no audit driver process was active.
* Confirmed `main` was clean and matched `origin/main` at 42ed9a8a6f741ee1d711696c9a78a674e994997e.
* Confirmed 40 findings remained and recorded the 2853-line log baseline.
* Received campaign-scoped approval to send isolated role prompts and repository files read by those
  roles to OpenAI.

## Risks & next 3 steps

1. Commit and push this checkpoint, run preflight, then verify every base gate independently.
2. Open the draft PR, replace `PR: pending` with its number, and push the second checkpoint.
3. Run the bounded canary, inspect all changes and deletions, require exact-head CI green, drain
   comments, and assess cost before continuation.

## Closeout tasks

* Stop cleanly and prove no driver or nested role remains.
* Prove local `HEAD` equals `origin/audit/burndown-20260807-2`.
* Capture and drain all per-commit comments, then capture again.
* Reconcile post-baseline handled counts against fixed, dropped, and deferred outcomes.
* Verify the remaining backlog with `pop.mjs --count`; delete `docs/AUDIT.md` only if zero.
* Add the campaign entry to `docs/AUDIT-LOG.md`.
* Run final formatting, quality, and deterministic local tests.
* Delete this consumed handoff, inspect and push closeout, update the PR body, require exact-head CI
  green, and mark the PR ready.

## Reread first

* `.agents/skills/burn-down-audits/SKILL.md`
* `scripts/audit-burndown/burndown.mjs`
* `scripts/audit-burndown/backfill-comments.mjs`
* `docs/AUDIT.md`
* `docs/AUDIT-DEFERRED.md`
