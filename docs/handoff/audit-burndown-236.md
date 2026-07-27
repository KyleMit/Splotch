# Handoff — audit burndown (236 findings)

> 2026-07-27 · branch `claude/burn-down-audit-skill-hidj17` · PR (pending — record below) ·
> Bulk-burn the 236-finding `docs/AUDIT.md` backlog with the `burn-down-audits` driver.

## Objective & non-goals

Drive `scripts/audit-burndown/burndown.mjs` over the whole staged backlog: one commit per verified
fix, deferrals to `docs/AUDIT-DEFERRED.md`, invalid findings dropped. **Non-goals:** filing GitHub
issues per finding (that is `/vet-audits`, impractical at this size), and any hand-editing of
`docs/AUDIT.md` (only `pop.mjs` touches it).

## Relaunch command — use this verbatim

```bash
BRANCH=claude/burn-down-audit-skill-hidj17 \
CHECK_CMD='npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check && npm run img:audit:check && npm run check:assets:manifest' \
TEST_CMD='npm run test:unit && npm run test:scripts' \
npm run audit:burndown:overnight -- 600
```

Every other knob is at its default (`PUSH_EVERY=1`, `PUSH_TEST_CMD=''`, `MODEL_IMPL=claude-opus-5`,
`MODEL_IMPL_MINOR=sonnet`, `EFFORT_IMPL=high`, `EFFORT_VERIFY=medium`, `EFFORT_REVIEW=medium`,
budgets 3/4/3). No helper script backs any knob — the two overrides above are literal strings, so
nothing here depends on a file in gitignored `.audit-work/`.

**`BRANCH` is not optional.** The driver defaults to `audit/burndown`; this session was assigned
`claude/burn-down-audit-skill-hidj17`. Preflight echoes `branch: <name>` — read that line and match
it before launching.

### Why the two gate overrides

`CHECK_CMD` and `TEST_CMD` are widened past their defaults to cover the repo's bespoke CI gates,
which no per-finding type-check or unit run can see. Measured cost on this container:

| Gate                    | Cost  | Why it is in the gate                                          |
| ----------------------- | ----- | -------------------------------------------------------------- |
| `lint:tokens`           | 0.2 s | Raw-hex ratchet — fails on *improvement* as well as regression |
| `gen:tokens:check`      | 0.3 s | Token-generation drift                                         |
| `scrapbook:check`       | 0.2 s | Free                                                           |
| `img:audit:check`       | 1.0 s | Image ratchet                                                  |
| `check:assets:manifest` | 6.3 s | Asset-manifest drift                                           |
| `test:scripts`          | 1.0 s | A finding touching `scripts/` breaks this and nothing else     |

Deliberately **excluded**: `format:check` (~23 s; already covered by the `format-edited-file.sh`
PostToolUse hook firing inside each `claude -p`) and `ruler:check` (it *writes* files — a mutating
gate would land its output in the fix commit). A finding editing `.ruler/**` must run
`npm run ruler:apply` itself; nothing enforces that.

## State

* Base: 522970ba1e43 (`origin/main` at launch). Branch forked clean from it.
* Backlog at launch: **236** findings (`node scripts/audit-burndown/pop.mjs --count`).
* Preflight: OK — deps, auth, clean tree, origin reachable, all three role prompts present.

## Unverified assumptions

* That the canary's commits contain no behavior smuggled inside a refactor — must be read by hand, a
  green gate cannot show this.
* That every fix commit deletes **exactly one** `###` entry from `docs/AUDIT.md`.
* That the `--resume` handoff fires on fix rounds (implementer references its own prior work rather
  than re-deriving from review text).

## Done & verified

* `npm run audit:preflight` → PREFLIGHT OK, `branch: claude/burn-down-audit-skill-hidj17`.
* Every gate script above run at base and passing (exit 0), so a red gate mid-run is attributable to
  a finding rather than pre-existing.

## Risks & next 3 steps

1. Open the draft PR (`draft: true`, head = this branch) and **record its number in this file** —
   without it the per-commit comments have nowhere to go and CI never runs.
2. Canary (`MAX_ISSUES=5`), then audit it: read the diff, count deleted entries per commit, confirm
   a resume round fired, **confirm CI is green** before the full launch.
3. Launch the full run; re-arm the `run.log` monitor every ~30 min (Monitor clamps to 30 min
   regardless of the timeout requested) and drain the comment store as it fills.

Risks: the container is ephemeral and `.audit-work/` dies with it, so drain PR comments as you go;
CI is the *only* full-suite gate in this configuration, so a red run means pause and diagnose, not
sweep up later.

## Closeout tasks

* Drain `.audit-work/pending-comments.jsonl` (`backfill-comments.mjs next` → post → `done <sha>`),
  then run `capture` as a completeness check.
* Triage `docs/AUDIT-DEFERRED.md` by hand; each entry carries a post-mortem and often a
  `docs/audit-deferred/<slug>.patch`.
* Add one `docs/AUDIT-LOG.md` row (date · `burn-down-audits` · done/dropped/deferred + PR link),
  summing **every** `finished:` line this session produced (canary + full run), not just the last.
* Tidy any emptied `## Source:` sections in `docs/AUDIT.md`; delete the file outright if drained.
* Confirm CI green on the final push, then `mcp__github__update_pull_request` `draft: false`.

## Reread first

* `.claude/skills/burn-down-audits/SKILL.md` — the runbook.
* `.claude/audit-conventions.md` — shared audit-skill conventions (§2 is the log-row format).
* `scripts/audit-burndown/lib.mjs` — `LAUNCH_KNOBS` (which env vars survive a detached launch).
