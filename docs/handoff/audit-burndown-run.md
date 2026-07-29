# Handoff — audit burndown run

> 2026-07-29 · branch `audit/burndown-20260729-codex` · PR
> [#632](https://github.com/KyleMit/Splotch/pull/632) · clear the staged audit backlog through
> bounded Codex-driven verification, implementation, and adversarial review

## Objective & non-goals

Burn down the findings staged in `docs/AUDIT.md` through the Codex audit-burndown driver. Each
finding must be independently verified, implemented when valid, reviewed adversarially, and gated
before it is accepted. This campaign does not bypass review, delete findings manually, or run
unbounded unattended segments.

## State

| Field              | Value                                               |
| ------------------ | --------------------------------------------------- |
| Branch             | `audit/burndown-20260729-codex`                     |
| PR                 | [#632](https://github.com/KyleMit/Splotch/pull/632) |
| Initial backlog    | 584 findings                                        |
| `run.log` baseline | 2582 lines                                          |
| Runner             | `codex`                                             |
| Campaign state     | Preflight green; ready for canary                   |

No finding commits have landed in this continuation.

## Commands

Preflight:

```bash
AGENT_RUNNER=codex \
BRANCH='audit/burndown-20260729-codex' \
CHECK_CMD='npm run format:check && npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check' \
TEST_CMD='npm run test:unit && npm run test:scripts' \
npm run audit:preflight
```

Foreground canary:

```bash
AGENT_RUNNER=codex \
BRANCH='audit/burndown-20260729-codex' \
MAX_ISSUES=5 \
MAX_HANDLED=5 \
CHECK_CMD='npm run format:check && npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check' \
TEST_CMD='npm run test:unit && npm run test:scripts' \
npm run audit:burndown
```

Bounded full segment:

```bash
AGENT_RUNNER=codex \
BRANCH='audit/burndown-20260729-codex' \
MAX_HANDLED=5 \
CHECK_CMD='npm run format:check && npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check' \
TEST_CMD='npm run test:unit && npm run test:scripts' \
npm run audit:burndown:overnight -- 600
```

`PUSH_EVERY=1` and an empty `PUSH_TEST_CMD` remain at their runbook defaults.

## Decisions made (and why)

The campaign uses the Codex runner defaults from `.agents/skills/burn-down-audits/SKILL.md`.
Detached segments remain capped at five handled outcomes so exact-head CI and PR comments can be
checkpointed before each relaunch.

## Unverified assumptions

* SSH push access to `origin` is available even though the local `gh` token is stale.
* The Codex CLI remains logged in for nested role calls.
* The connected GitHub app can create and update the draft PR and post per-commit comments.

## Done & verified

* `main` was clean and exactly matched `origin/main` at dca8e7557dc6246d11156b0b69fc11c31da91910.
* No audit-burndown driver process was active.
* `node scripts/audit-burndown/pop.mjs --count` reported 584.
* The connected GitHub app reported admin permission for `KyleMit/Splotch`.
* The exact Codex preflight passed, including origin reachability and deterministic quality gates.
* Draft PR [#632](https://github.com/KyleMit/Splotch/pull/632) is open.

## Risks & next 3 steps

1. Commit and push this PR-number checkpoint.
2. Remove the stale stop sentinel and run the bounded foreground canary.
3. Inspect the full canary diff and deletion accounting, then require exact-head CI green.

## Closeout tasks

* Stop cleanly and prove no driver or nested Codex role remains.
* Reconcile scoped fixed, dropped, and deferred outcomes against the backlog delta.
* Capture and drain all pending per-commit PR comments.
* Update `docs/AUDIT-LOG.md`; delete `docs/AUDIT.md` only if its finding count is zero.
* Delete this consumed handoff and commit the closeout changes together.
* Push, update the PR body with final counts and verification, require exact-head CI green, and mark
  the PR ready for review.

## Reread first

* `.agents/skills/burn-down-audits/SKILL.md`
* `.agents/skills/testing/SKILL.md`
* `.agents/skills/pr-screenshots/SKILL.md`
* `docs/handoff/AGENTS.md`
