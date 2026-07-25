# Handoff — audit burndown run

> 2026-07-25 · branch `claude/audit-burn-down-skill-3u35d2` · PR
> [#545](https://github.com/KyleMit/Splotch/pull/545) · Bulk-burn the 475-finding `docs/AUDIT.md`
> backlog with the `burn-down-audits` driver.

This is the **durable checkpoint** for a live `burn-down-audits` run, per that skill's "Surviving
the context window" section. A fresh or compacted session resumes from this file plus
`npm run audit:status` — nothing here should need re-deriving.

## Objective & non-goals

* **Objective:** drive `scripts/audit-burndown/burndown.mjs` through the staged `docs/AUDIT.md`
  backlog (475 findings at launch), one commit per finding, on this branch.
* **Non-goals:** no hand-fixing of findings outside the driver, no edits to tracked files while the
  driver is running (its rollback runs `git reset --hard`), no `gh` usage (unavailable in this
  container — the supervising agent owns the PR and comments via GitHub MCP tools).

## Relaunch command — use this verbatim

```bash
BRANCH=claude/audit-burn-down-skill-3u35d2 npm run audit:burndown:overnight -- 600
```

**`BRANCH` is the one non-default override and it must ride on every relaunch.** The driver defaults
to `audit/burndown`; without the override the run's commits land on a branch nobody is watching and
every per-commit comment has nowhere to go. Everything else is at its documented default (see the
skill's Knobs table): `PUSH_EVERY=1`, `PUSH_TEST_CMD=''` (CI on the draft PR is the full-suite
backstop), `MODEL_IMPL=claude-opus-5`, `MODEL_IMPL_MINOR=sonnet`, `MODEL_VERIFY=sonnet`,
`EFFORT_VERIFY=medium` / `EFFORT_IMPL=high` / `EFFORT_REVIEW=medium`.

No knob points at a helper script, so there is no script body to record here.

Canary (first 5 findings, foreground) was:

```bash
BRANCH=claude/audit-burn-down-skill-3u35d2 npm run audit:burndown
```

## State

| Fact              | Value                                                            |
| ----------------- | ---------------------------------------------------------------- |
| Branch            | `claude/audit-burn-down-skill-3u35d2` (forked from `main`)       |
| PR                | **[#545](https://github.com/KyleMit/Splotch/pull/545)** (draft)  |
| Backlog at launch | **475** findings (`node scripts/audit-burndown/pop.mjs --count`) |
| Base commit       | `daa0752` (merge of PR #544)                                     |

Progress is not tracked in this file — `npm run audit:status` and `git log` are authoritative for
counts and for what landed. This file exists for the things they cannot tell you: how the run was
launched, and what still has to happen to close it out.

## Closeout tasks

Run these when the backlog drains, or on a "wrap up" instruction (`touch .audit-work/STOP`, wait for
exit, then):

1. Push anything unpushed; confirm `git rev-parse HEAD` ==
   `origin/claude/audit-burn-down-skill-3u35d2`.
2. **Drain the comment store** — `node scripts/audit-burndown/backfill-comments.mjs next`, post with
   `mcp__github__add_issue_comment` (+ Claude Code attribution footer), then `… done <sha>`. Repeat
   until empty. Run `… capture` afterwards as a completeness check.
3. Triage `docs/AUDIT-DEFERRED.md` by hand — read each `#### What was tried` before re-staging.
4. Tidy any emptied `## Source:` sections in `docs/AUDIT.md`; delete the file entirely if the
   backlog fully drained (per `.claude/audit-conventions.md`).
5. Confirm CI is green on the **final** push — it is the only full-suite gate in this configuration.
6. Add one row to `docs/AUDIT-LOG.md` (date · `burn-down-audits` · fixed/dropped/deferred + PR
   link). Take counts from each run's `finished:` line, cross-checked against `defer —` /
   `drop invalid finding` commit subjects. Do **not** count fix commits.
7. Mark the PR ready — `mcp__github__update_pull_request` with `draft: false`.
8. Delete this handoff file.

## Unverified assumptions

* The `SessionStart` hook suggests a `feat/*` branch convention; the task assigned
  `claude/audit-burn-down-skill-3u35d2`. Taking the **assigned** branch, per the skill's step 1.
* Commits will land unsigned (`%G? = N`) because the container ships a zero-byte signing key. The
  stop-hook nag about this is expected and its suggested `--amend`/`rebase` remedy must **never** be
  run mid-run — it would race the driver's own `--amend`.

## Done & verified

* `npm run audit:preflight` → `PREFLIGHT OK` (deps, auth, clean tree, origin reachable, 475 findings
  parsed, `npm run check` passes, branch echoed back as the assigned one).

## Risks & next 3 steps

1. Open the draft PR against this branch and record its number in **State** above.
2. Canary 5 findings, then run the skill's post-canary checks — read the code diff
   (`git log main..HEAD -p -- . ':(exclude)docs/AUDIT.md'`), **count entry deletions per commit
   (must be exactly one)**, and confirm the `--session-id` resume handoff fired on a fix round.
3. `npm run audit:cost`, then launch the unattended run with the relaunch command above.

Standing risks: the container is ephemeral and can be reclaimed mid-run (everything that matters is
pushed after every finding); a cross-finding regression shows up as red CI asynchronously rather
than blocking a push, so watching CI is part of supervising this run.

## Reread first

* `.claude/skills/burn-down-audits/SKILL.md` — the runbook; read "Responding to control messages
  mid-run" before acting on any user instruction.
* `.claude/audit-conventions.md` — shared audit-skill conventions and the `AUDIT-LOG.md` row format.
* `.audit-work/compact-snapshot.md` — written by the `PreCompact` hook; container-local and
  point-in-time, so check its header timestamp and any pid it names before trusting it.
