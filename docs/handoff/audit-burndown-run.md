# Handoff — audit burndown run

> 2026-08-07 · branch `audit/burndown-20260807` · PR
> [#863](https://github.com/KyleMit/Splotch/pull/863) · burn down the staged audit backlog through
> bounded, supervised Codex segments

## Objective & non-goals

Burn down `docs/AUDIT.md` with the Codex audit driver, including verifier, implementer, adversarial
reviewer, deterministic gates, per-commit PR comments, and exact-head CI checkpoints. Do not bypass
the driver, edit the backlog directly, run an unsupervised unbounded segment, or fold unrelated work
into the campaign.

## State

* Branch: `audit/burndown-20260807`
* PR: [#863](https://github.com/KyleMit/Splotch/pull/863) (draft)
* Initial backlog: 40 findings
* `run.log` baseline: 2,853 lines
* Campaign state: preflight and base gates green; canary not yet run
* Required runner: `AGENT_RUNNER=codex`

Durable segment command:

```bash
AGENT_RUNNER=codex \
  BRANCH='audit/burndown-20260807' \
  MAX_HANDLED=5 \
  CHECK_CMD='npm run format:check && npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check' \
  TEST_CMD='npm run test:unit && npm run test:scripts' \
  npm run audit:burndown:overnight -- 600
```

## Decisions made

* Started from `main` at 42ed9a8a6f741ee1d711696c9a78a674e994997e, which matched `origin/main` with
  a clean worktree.
* Used a fresh dated branch so historical burndown state cannot be mistaken for this campaign.
* Kept `PUSH_EVERY=1` and left `PUSH_TEST_CMD` empty, as required for active supervision.

## Unverified assumptions

* The five-outcome canary exercises an accepted fix; if it does not, one additional bounded canary
  may be required.

## Done & verified

* Worktree was clean on `main`.
* `main`, `origin/main`, and `HEAD` matched at 42ed9a8a6f741ee1d711696c9a78a674e994997e.
* `node scripts/audit-burndown/pop.mjs --count` reported 40 findings.
* No active audit-burndown process was found.
* Codex preflight passed with the expected runner, branch, authentication, origin access, prompts,
  backlog count, and composed build gate.
* Base `format:check`, `check`, `lint:tokens`, `gen:tokens:check`, and `scrapbook:check` gates
  passed independently.

## Risks & next 3 steps

1. Commit and push this PR-number checkpoint, then run the bounded five-outcome canary.
2. Inspect canary commits, deletion counts, and thread reuse; require exact-head CI green.
3. Drain pending comments, record cost, and continue in supervised five-outcome segments.

## Closeout tasks

* Stop cleanly and confirm no driver or nested Codex call remains.
* Confirm local `HEAD` equals `origin/audit/burndown-20260807`.
* Capture and drain all pending per-commit comments, then capture again.
* Reconcile post-baseline fixed, dropped, and deferred outcomes against the remaining count.
* Update `docs/AUDIT-LOG.md`; delete `docs/AUDIT.md` only if no findings remain.
* Run final quality checks, delete this handoff, inspect and push the closeout commit.
* Replace the canary PR body with final counts and verification, require exact-head CI green, and
  mark the PR ready.

## Reread first

* `.agents/skills/burn-down-audits/SKILL.md`
* `scripts/audit-burndown/burndown.mjs`
* `scripts/audit-burndown/overnight.mjs`
* `docs/AUDIT.md` through `scripts/audit-burndown/pop.mjs` only
