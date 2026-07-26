# Handoff — audit burndown run

> 2026-07-26 · branch `claude/burn-down-audit-skill-zyb764` · PR
> [#547](https://github.com/KyleMit/Splotch/pull/547) · Burn down the 449-finding `docs/AUDIT.md`
> backlog with the `burn-down-audits` driver.

This is the **durable checkpoint** for a `burn-down-audits` run, written per that skill's "Surviving
the context window" section. A fresh or compacted session resumes from this file plus
`npm run audit:status` — nothing below should need re-deriving.

## Objective & non-goals

* **Objective:** drive `scripts/audit-burndown/burndown.mjs` through the `docs/AUDIT.md` backlog
  (449 findings at launch), one commit per fix, pushed after every finding.
* **Non-goals:** no hand-fixing of findings outside the driver; no editing `docs/AUDIT.md` directly
  (only `scripts/audit-burndown/pop.mjs` touches it); no PR opened for anything but this run.

## Relaunch command (exact — carries every non-default override)

```bash
BRANCH='claude/burn-down-audit-skill-zyb764' \
CHECK_CMD='npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check' \
TEST_CMD='npm run test:unit && npm run test:scripts' \
npm run audit:burndown:overnight -- 600
```

`BRANCH` **must** ride on every relaunch — it defaults to `audit/burndown`, and the driver takes
that default silently, landing the run's commits on a branch nobody is watching.

For a canary, swap the last line for `npm run audit:burndown` with `MAX_ISSUES=5` prefixed.

### Why those two overrides

The driver's four default gates (`CHECK_CMD`, `TEST_CMD`, `LINT_CMD`, `E2E_CMD`) do not cover this
repo's bespoke CI gates, and a **ratchet lint fails in both directions** — a fix that *improves*
`lint:tokens`' raw-hex count reddens CI exactly like a regression.

Measured on this container (all read-only; tree stayed clean after each):

| Script                          | Cost  | In `CHECK_CMD`?                                             |
| ------------------------------- | ----- | ----------------------------------------------------------- |
| `npm run lint:tokens`           | 0.2 s | yes — ratchet, fails both directions                        |
| `npm run gen:tokens:check`      | 0.3 s | yes — token drift gate                                      |
| `npm run scrapbook:check`       | 0.2 s | yes — cheap                                                 |
| `npm run test:scripts`          | 1.1 s | yes, via `TEST_CMD` — backlog will touch `scripts/`         |
| `npm run img:audit:check`       | 1.3 s | no — a code-quality backlog will not touch images           |
| `npm run check:assets:manifest` | 5.8 s | no — ~1 h over the backlog, asset changes unlikely          |
| `npm run format:check`          | ~23 s | no — the `format-edited-file.sh` PostToolUse hook covers it |
| `npm run ruler:check`           | —     | **never** — it re-applies ruler, i.e. it writes files       |

A finding that edits any `.ruler/` source must run `npm run ruler:apply` itself and commit the
regenerated output in the same commit. Nothing enforces this; CI catches it.

## State

* Branch forked from `origin/main` at 9c3fc7f (the merge of PR #546, the previous burndown run).
* Backlog at launch: **449** findings (`node scripts/audit-burndown/pop.mjs --count`).
* Commits land as `Audit: <title>`; deferrals as `chore(audit): defer —`; drops as
  `chore(audit): drop invalid finding`.

## Decisions made (and why)

* `PUSH_TEST_CMD` left empty (the default). CI on the draft PR is the only full-suite gate, so
  **watching CI is part of supervising this run** — a cross-finding regression turns a CI run red
  asynchronously rather than blocking a push.
* `MODEL_IMPL_MINOR=sonnet` left on (the default): P4/P5 findings route to the cheaper model, Opus
  review still gates every fix.
* Comment store left at the gitignored default. It is drained onto the PR as the run goes, not at
  the end — the container is ephemeral and takes undrained records with it.

## Unverified assumptions

* That the canary's CI run is green before the full run launches. **Verify this** — it is the
  cheapest step and the easiest to skip.
* That `scrapbook:check` never mutates the tree. Checked once on a clean tree; re-check if a finding
  starts failing `CHECK_CMD` for no visible reason.

## Done & verified

* `npm run audit:preflight` → `PREFLIGHT OK`, and it echoed
  `branch: claude/burn-down-audit-skill-zyb764` (the override took).
* All five bespoke check scripts run clean at HEAD and leave the tree clean.

## Closeout tasks (do all of these before calling the run finished)

1. `touch .audit-work/STOP`, wait for the driver to exit (anchored wait —
   `until ! pgrep -f '^node scripts/audit-burndown/burndown.mjs' >/dev/null; do sleep 15; done`; an
   unanchored `pgrep -f` loop matches itself and hangs forever).
2. Push anything unpushed; confirm `git rev-parse HEAD` == `origin/<branch>`.
3. Drain the comment store: `backfill-comments.mjs next` → post via `mcp__github__add_issue_comment`
   (with the Claude Code attribution footer) → `backfill-comments.mjs done <sha>`, until empty. Run
   `capture` first if any fix landed without a record, and again afterwards as a completeness check.
4. Add one row to `docs/AUDIT-LOG.md` per `.claude/audit-conventions.md` §2. **Take the counts from
   each run's `finished:` line and sum a canary + full run** — not from `audit:status`'s cumulative
   `deferred findings` list, and never from commit counts (one finding can land several commits).
5. Tidy any emptied `## Source:` sections in `docs/AUDIT.md`; delete the file entirely if the
   backlog drained.
6. Confirm CI green on the final push, then `mcp__github__update_pull_request` with `draft: false`.

## Risks & next 3 steps

1. ~~Open the draft PR~~ — done, PR #547 (draft).
2. Canary (`MAX_ISSUES=5`), then run the skill's canary checklist — especially the **entry-deletion
   count per commit must be exactly one**, and CI green on the canary's pushes.
3. Launch the full run and supervise it event-driven, re-arming the run-log monitor about every 30
   minutes.

## Reread first

* `.claude/skills/burn-down-audits/SKILL.md` — the runbook; do not run this from memory.
* `.claude/audit-conventions.md` — the audit-skill inventory and the `AUDIT-LOG.md` row format.
* `.audit-work/compact-snapshot.md` — if it exists and the container survived, the most concrete
  record of how the run was launched (point-in-time; check its header timestamp).
