# Handoff — audit burndown run

> 2026-07-25 · branch `claude/burn-down-audit-skill-cb9nv1` · PR *(pending — fill in once opened)* ·
> Burn down the 465-finding `docs/AUDIT.md` backlog in bulk with the `burn-down-audits` driver.

This is the **durable checkpoint** for a live `burn-down-audits` run, per that skill's "Surviving
the context window" section. Any session — compacted, fresh, or on a brand-new container — should be
able to resume the run from this file plus `npm run audit:status`, with nothing re-derived.

## Objective & non-goals

* **Objective:** drive `docs/AUDIT.md` (465 findings at launch) through the scripted verify →
  implement → adversarial review → fix loop, one commit per finding, pushed as they land.
* **Non-goals:** filing GitHub issues per finding (that is `/vet-audits`, impractical at this size),
  hand-fixing anything, or touching `docs/AUDIT.md` by any route other than
  `scripts/audit-burndown/pop.mjs`.

## Relaunch command

The **exact** command, with every non-default override. `BRANCH` is the critical one: it defaults to
`audit/burndown`, and this session was assigned a `claude/<topic>` branch.

```bash
BRANCH=claude/burn-down-audit-skill-cb9nv1 \
CHECK_CMD='npm run check && npm run lint:tokens && npm run gen:tokens:check' \
npm run audit:burndown:overnight -- 600
```

Swap `audit:burndown:overnight -- 600` for `audit:burndown` (canary, `MAX_ISSUES=5`) when validating
a change. Everything else is at its default — see the knob table in the `burn-down-audits` skill.

**Before relaunching:** `pgrep -f audit-burndown/burndown.mjs` must show no bare
`node scripts/audit-burndown/burndown.mjs` line, `rm .audit-work/STOP` if a pause is being lifted,
and any uncommitted work must be committed or stashed (`RESUME=1` hard-resets a dirty tree).

### Why `CHECK_CMD` is overridden

The driver's four default gates (`check`, `test:unit`, `eslint`, targeted E2E) do not cover the
repo's bespoke ratchets, and a ratchet fails in **both** directions — an improvement reddens CI
exactly like a regression. CI's Quality job runs nine gates; these two are the ones a code fix can
realistically move, and they cost ~0.6s combined:

| Gate                                                          | Cost                        | In `CHECK_CMD`?                                       |
| ------------------------------------------------------------- | --------------------------- | ----------------------------------------------------- |
| `lint:tokens`                                                 | 0.3s                        | yes                                                   |
| `gen:tokens:check`                                            | 0.3s                        | yes                                                   |
| `format:check`                                                | 23s                         | **no** — see below                                    |
| `ruler:check`                                                 | slow, and it *writes* files | no                                                    |
| `img:audit:check`, `check:assets:manifest`, `scrapbook:check` | —                           | no — asset-pipeline gates, out of reach of a code fix |

`format:check` is excluded deliberately: 23s × 465 findings is ~3 hours, and the repo's
`format-edited-file.sh` `PostToolUse` hook already formats every file a role edits — it is
registered in `.claude/settings.json`, so it fires inside the `claude -p` subprocesses too. The
residual risk is a role editing a file through `Bash` rather than `Edit`/`Write`; CI on the draft PR
is the backstop for that.

## Closeout tasks

Run these when the backlog drains or the user says "wrap up" (`touch .audit-work/STOP` first, wait
for exit):

1. **Drain the comment store** — `node scripts/audit-burndown/backfill-comments.mjs next`, post with
   `mcp__github__add_issue_comment` (+ the Claude Code attribution footer), then `… done <sha>`.
   Repeat until empty. Run `… capture` first if any fix landed without a record, and again after the
   drain as a completeness check (it reports `skipped N already posted`).
2. **Confirm CI is green on the final push.** `PUSH_TEST_CMD` is empty in this configuration, so CI
   on the draft PR is the *only* full-suite gate — "the run finished" and "the branch is sound" are
   different claims here.
3. **Triage `docs/AUDIT-DEFERRED.md`** by hand — each entry carries its own post-mortem and, when a
   draft was committed before the rollback, a `docs/audit-deferred/<slug>.patch`.
4. **Tidy emptied `## Source:` sections** in `docs/AUDIT.md` (23 at launch); delete the file
   entirely if the backlog fully drains, per `.claude/audit-conventions.md`.
5. **Add one row to `docs/AUDIT-LOG.md`** (date · `burn-down-audits` · done/deferred/dropped + PR
   link). Take the counts from each run's `finished:` line, cross-checked against
   `chore(audit): defer` / `drop invalid finding` commit subjects. Do **not** count fix commits — a
   finding with a fix round lands two or three.
6. **Delete this handoff** and mark the PR ready (`mcp__github__update_pull_request`,
   `draft: false`).

## State

* **Branch:** `claude/burn-down-audit-skill-cb9nv1`, forked from `main` at 5560341 (PR #545).
* **Backlog at launch:** 465 findings — 30 P1, 111 P2, 161 P3, 136 P4, 27 P5 across 23 `## Source:`
  sections. 163 of them (35%) are P4/P5 and route to `MODEL_IMPL_MINOR` (`sonnet`).
* **Progress:** read it from `npm run audit:status` (`remaining` is the trustworthy number) and
  `git log main..HEAD`, never from this file — it is only as current as its last edit.

## Unverified assumptions

* That the `format-edited-file.sh` hook fires inside `claude -p` subprocesses. It is registered
  project-level in `.claude/settings.json`, which those subprocesses load, but this has not been
  observed end-to-end. A format-only CI red is the symptom; the fix is adding `npm run format:check`
  to `CHECK_CMD` and paying the 23s.
* That 465 findings is a multi-day campaign, not one overnight run. At the skill's ~9 min/finding
  average this is ~70 hours of wall-clock, so expect several relaunches from this command.

## Risks

* **The container is ephemeral** and is reclaimed on inactivity, mid-run, without warning. Commits
  are safe (`PUSH_EVERY=1` pushes every finding); `.audit-work/` is not — the role envelopes, the
  run log, and **any undrained comment records** die with it. Drain comments as you go.
* **CI coverage is per-push, not per-commit.** `test.yml` sets `concurrency: cancel-in-progress`, so
  a fast finding cancels the suite still running for the one before it. Judge the run by the *final*
  CI result plus the per-finding gates.
* **Never edit a tracked file while the driver runs** — its rollback paths `git reset --hard` and
  will eat the edit with no reflog entry. Pause first.
* **The unsigned-commit session hook is a false positive here** and its suggested remedy
  (`--amend --reset-author`, `rebase --exec`) would race the driver's own `--amend`. Ignore it.

## Reread first

* `.claude/skills/burn-down-audits/SKILL.md` — the runbook; the "Responding to control messages
  mid-run" section is the one to read before acting on a user instruction.
* `.claude/audit-conventions.md` — shared audit-skill conventions.
* `scripts/audit-burndown/` — the driver, `pop.mjs` (the only thing that may touch `docs/AUDIT.md`),
  and `prompts/*.md` (the three role system prompts).
