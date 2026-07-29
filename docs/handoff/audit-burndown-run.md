# Handoff — audit burndown

> 2026-07-29 · branch `audit/burndown-2026-07-29-codex-2` · PR
> [#656](https://github.com/KyleMit/Splotch/pull/656) · supervise the remaining staged audit backlog
> through bounded Codex segments

## Objective & non-goals

Burn down the staged findings in `docs/AUDIT.md` with the Codex-specific `burn-down-audits`
workflow. Keep the driver as orchestrator and require an exact-head CI and pending-comment
checkpoint between bounded segments. Do not convert the staged backlog into individual GitHub issues
or run a segment without active supervision.

## State

* Branch: `audit/burndown-2026-07-29-codex-2`
* PR: [#656](https://github.com/KyleMit/Splotch/pull/656)
* Initial backlog: 584 findings
* `run.log` baseline: 2582 lines
* Driver state at checkpoint: idle; no matching host process
* Runner: `codex`

The exact preflight and canary command is:

```bash
AGENT_RUNNER=codex \
BRANCH='audit/burndown-2026-07-29-codex-2' \
MAX_ISSUES=5 \
MAX_HANDLED=5 \
CHECK_CMD='npm run format:check && npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check' \
TEST_CMD='npm run test:unit && npm run test:scripts' \
npm run audit:burndown
```

The exact durable segment command is:

```bash
AGENT_RUNNER=codex \
BRANCH='audit/burndown-2026-07-29-codex-2' \
MAX_HANDLED=5 \
CHECK_CMD='npm run format:check && npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check' \
TEST_CMD='npm run test:unit && npm run test:scripts' \
npm run audit:burndown:overnight -- 600
```

## Decisions made

* Start from current `main` on a fresh continuation branch; do not reuse the merged historical
  burndown branch.
* Keep `PUSH_EVERY=1` and leave `PUSH_TEST_CMD` empty. GitHub CI is the full-suite backstop.
* Bound every segment to five terminal outcomes and twenty minutes, with clean-stop latency allowed
  for an in-flight finding.

## Unverified assumptions

* Codex login, origin reachability, and all deterministic preflight gates remain healthy.
* The canary exercises the required commit, review, push, and comment-capture paths, or a second
  bounded canary will be needed.
* Exact-head GitHub Actions can complete within each checkpoint.

## Done & verified

* `main` is clean and equals `origin/main` at 9f87f9754d237b988231eb8ce5f44716e9e3c891.
* `node scripts/audit-burndown/pop.mjs --count` reports 584.
* No matching `overnight.mjs` or `burndown.mjs` host process is active.

## Risks & next 3 steps

1. Commit and push this initial checkpoint, run the exact preflight, and open a draft PR.
2. Record the PR number here, push the second checkpoint, then run and inspect the bounded canary.
3. Continue only through exact-head green CI and drained-comment checkpoints.

## Closeout tasks

* Stop cleanly and prove no driver or nested Codex call remains.
* Reconcile post-baseline outcomes against the backlog delta.
* Capture and drain every per-commit PR comment.
* Add the run to `docs/AUDIT-LOG.md`; delete this consumed handoff.
* Run deterministic local gates, inspect and push the complete closeout diff.
* Replace the canary PR body, require exact-head CI green, and mark the PR ready.

## Reread first

* `.agents/skills/burn-down-audits/SKILL.md`
* `scripts/audit-burndown/`
* `docs/AUDIT.md`
* `docs/AUDIT-LOG.md`
