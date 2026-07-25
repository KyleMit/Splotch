# Handoff — audit burndown run

> 2026-07-25 · branch `claude/burn-down-audit-skill-qd23tg` · PR (opened at first push — find with
> `mcp__github__list_pull_requests` filtered by head branch) · drive the scripted bulk burndown of
> the 506-finding `docs/AUDIT.md` backlog to completion.

This is the **durable checkpoint** for a `burn-down-audits` run, per that skill's "Surviving the
context window" section. It exists so a compacted or brand-new session can take over without
re-deriving anything. Delete it when the run is closed out.

## Objective & non-goals

Burn down `docs/AUDIT.md` (506 findings at launch) with `scripts/audit-burndown/burndown.mjs` —
verify → implement → adversarial review → fix per finding, one commit each, pushed as they land.

Non-goals: fixing the driver itself, re-auditing the codebase, triaging `docs/AUDIT-DEFERRED.md`
(that is hand-work *after* the run).

## Relaunch command

The run uses a **non-default `BRANCH`** — the session is required to develop on
`claude/burn-down-audit-skill-qd23tg`, not the driver's default `audit/burndown`. Every relaunch
must carry that override or it will fork a second run onto the wrong branch:

```bash
BRANCH=claude/burn-down-audit-skill-qd23tg npm run audit:burndown:overnight -- 600
```

Canary (5 findings, attended) is the same override on `npm run audit:burndown`.

No other knob is overridden — everything else is the committed default in the skill's Knobs table
(`PUSH_EVERY=1`, `PUSH_TEST_CMD=''`, `MODEL_IMPL=claude-opus-5`, `MODEL_IMPL_MINOR=sonnet`,
`BUDGET_VERIFY/IMPL/REVIEW=3/4/3`, `EFFORT_VERIFY/IMPL/REVIEW=medium/high/medium`). No helper script
backs any knob, so there is nothing container-local to reconstruct.

## State

* Launch base: `59b50abb6339` (== `origin/main` at launch).
* Backlog at launch: 506 findings; `docs/AUDIT-DEFERRED.md` already exists from earlier work.
* Commits land on the branch as `Audit: <title>`; drops as `chore(audit): drop invalid finding`;
  deferrals as `chore(audit): defer`.

## Unverified assumptions

* That the pre-existing stale `origin/audit/burndown` branch (at 54caf9a2) is unrelated to this run
  — preflight reported "first run" for it. Nothing here writes to it.

## Done & verified

* `npm run audit:preflight` → PREFLIGHT OK (deps, auth, clean tree, origin reachable, 506 parsed,
  `npm run check` passes).

## Risks & next 3 steps

1. Drain `.audit-work/pending-comments.jsonl` onto the PR regularly —
   `node scripts/audit-burndown/backfill-comments.mjs next` → post via
   `mcp__github__add_issue_comment` → `done <sha>`. The store is container-local; what is not posted
   before the container is reclaimed is lost.
2. Watch CI on the draft PR. `PUSH_TEST_CMD` is empty, so CI is the **only** full-suite gate.
3. Closeout: `docs/AUDIT-LOG.md` row (counts from each run's `finished:` line), tidy emptied
   `## Source:` sections, mark the PR ready.

## Reread first

* `.claude/skills/burn-down-audits/SKILL.md` — the runbook, especially "Responding to control
  messages mid-run" and "Closing out a run".
* `.claude/audit-conventions.md` — shared audit-skill conventions.
* `.audit-work/compact-snapshot.md` — if the container survived, the launch record + log tail.
