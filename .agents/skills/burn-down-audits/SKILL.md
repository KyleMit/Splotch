---
name: burn-down-audits
description: Drive the scripted bulk burndown of docs/AUDIT.md — one one-shot `claude -p` subprocess per role per finding (verify → implement → adversarial review → fix), orchestrated by scripts/audit-burndown/ and built to run unattended overnight. Use when the staged audit backlog is too large to vet-and-file as GitHub issues (hundreds of findings) and the user asks to burn it down in bulk, run the audit burndown, or launch/check on an overnight run.
---

# Burn down audits

Progressive, adversarial burndown of a large `docs/AUDIT.md` backlog. Each finding goes through
verify → implement → review → fix, entirely inside one-shot `claude -p` subprocesses, so nothing
accumulates in a long-lived context window. The driver is `scripts/audit-burndown/burndown.mjs`;
this skill is the runbook for launching, watching, and closing out a run.

**When to use which consumer** (shared rules: `.claude/audit-conventions.md`): for a normal-sized
backlog (tens of findings), stay with the standard lifecycle — `/vet-audits` files survivors as
`type:audit` issues and `/fix-audits` clears them interactively with subagents. This skill is the
bulk path for a backlog where filing one GitHub issue per finding is impractical (hundreds of
findings, e.g. a whole-codebase `/code-audit` pass). It replaces both vet and fix: its verifier
subprocess *is* the adversarial vet, applied per finding at HEAD.

## Architecture — why subprocesses, not subagents

The orchestrator is a Node script, so the "main context" is process state, not a conversation. Three
consequences worth internalising before touching the driver:

* **`--resume` is the handoff.** The implementer's `session_id` is captured from the `claude -p`
  JSON envelope and passed back on fix rounds, so it resumes with its full history — every prior
  tool call, result, and reasoning step — instead of re-deriving the change from review text.
  Sessions are addressed by ID, which sidesteps the name-collision problem of resuming hundreds of
  same-named subagents.
* **`--json-schema` replaces prose parsing.** Verdicts, SHAs, and review statuses come back typed in
  `.structured_output`; no regex ever touches a SHA.
* **State is `docs/AUDIT.md` plus git.** A finding's entry is deleted in the *same commit* as its
  fix, so the file is always an exact record of remaining work and a crash mid-run leaves nothing to
  reconcile. Re-running resumes where it stopped. Everything else (`.audit-work/`) is disposable,
  gitignored working state.

No agent — including you — should read or edit `docs/AUDIT.md` directly at burndown scale (~19k
lines): `scripts/audit-burndown/pop.mjs` is the only thing that touches it (`--count`, print,
`--peek N`, `--delete`). Role system prompts live in `scripts/audit-burndown/prompts/*.md`.

## Commands

| Command                            | Purpose                                                              |
| ---------------------------------- | -------------------------------------------------------------------- |
| `npm run audit:preflight`          | Read-only go/no-go: deps, auth, clean tree, backlog parses, check    |
| `npm run audit:burndown`           | The driver loop — canary default `MAX_ISSUES=5`                      |
| `npm run audit:burndown:overnight` | Preflight-gated unattended launch under caffeinate + tmux (`-- 600`) |
| `npm run audit:status`             | Counts, progress bar, run state, recent `Audit:` commits             |
| `npm run audit:cost`               | Spend by role, per-issue average, projected total                    |
| `npm run audit:watch`              | `tail -f` the run log; `-- --dash` for a refreshing summary          |

## Knobs

All environment variables on `audit:burndown`, all with defaults:

```bash
MAX_ISSUES=5          # how many to complete before stopping (canary default; overnight passes 600)
PUSH_EVERY=10         # batch pushes and draft-PR comments
BRANCH=audit/burndown
CHECK_CMD='npm run check'      # per-finding type-check gate
TEST_CMD='npm run test:unit'   # per-finding fast-test gate (see the layered gate below)
E2E_CMD='npm run test:e2e --'  # per-finding targeted E2E, only for UI-touching findings
PUSH_TEST_CMD='npm test'       # full suite once per batch, before each push
MAX_DEFERRALS=3       # consecutive deferrals before halting
RETRIES=3             # retries per claude call before treating it as a deferral
MODEL_VERIFY=sonnet   # verification is mostly grep-and-confirm
MODEL_IMPL=opus
MODEL_REVIEW=opus
BUDGET_VERIFY=1.00    # --max-budget-usd per call
BUDGET_IMPL=4.00
BUDGET_REVIEW=2.00
```

### The layered test gate — why type-checking isn't enough

Unattended, the expensive failure is a fix that type-checks but breaks a test and commits green. So
verification is layered by cost, catching a regression as early — and as attributed to one finding —
as possible:

* **Every finding**, after the adversarial review approves, the driver itself re-runs `CHECK_CMD`
  **and** `TEST_CMD` (fast unit tests) — it does not trust the role prompts to have run them. A red
  result rolls the fix back and defers the finding rather than committing it. Keep `TEST_CMD` fast
  (unit only).
* **UI-touching findings only**, at the same point, the driver also runs `E2E_CMD` against the
  Playwright spec(s) the verifier named for that finding (its `e2e_specs`). This catches a
  behavioural regression *before it commits*, attributed to the one finding that caused it, without
  paying full-suite E2E on all 600 findings — only the fraction with a runtime surface run E2E, and
  only their relevant spec. A pure refactor / script / doc finding names no specs and skips it. The
  verifier writes the specs into both `e2e_specs` and the acceptance criteria, so the implementer
  and reviewer run them too; a red spec rolls the fix back and defers it.
* **Every batch**, right before the push, the driver runs `PUSH_TEST_CMD` (the full `npm test`,
  including the whole E2E suite) as a catch-all for cross-finding interactions the per-finding specs
  can't see. A red batch is **not pushed** — the commits stay local and the push retries at the next
  boundary, so a flaky E2E clears on retry and a real regression surfaces in `audit:status` instead
  of shipping. (When pushing to a draft PR whose CI already runs the full suite per push, you can
  set `PUSH_TEST_CMD` to the fast suites and let CI be the E2E backstop.)

The reviewer is also handed the **original finding**, not just the verifier's acceptance criteria,
so it can reject a fix that satisfies mis-scoped criteria while missing what the finding asked for —
the verifier is the one role with no independent check.

## Before the full run

1. `npm run audit:preflight` — fix anything red.
2. **Canary:** `npm run audit:burndown` (5 findings) and read the commits it makes.
3. **Force a rejection** to exercise the path a happy-path canary won't: write one deliberately
   vague brief so the reviewer returns `CHANGES_REQUIRED`, then check `.audit-work/logs/*.fix1.json`
   to confirm the resumed implementer references its own earlier work rather than starting over.
   That handoff is the whole design.
4. `npm run audit:cost` — multiply the per-issue average by the backlog before committing to a full
   run.
5. `npm run audit:burndown:overnight -- 600`.

## While it runs

* Stop gracefully with `touch .audit-work/STOP` (exits after the current finding; `rm` it before
  resuming). Stop hard with `pkill -TERM -f 'claude -p'`.
* Transient API failures are retried with exponential backoff; a budget/turn cap is treated as a
  real answer and deferred, not retried. Three *consecutive* deferrals halt the run — that shape
  means something systemic (auth, disk, a red tree), not three unlucky findings.
* macOS overnight gotchas: `caffeinate -s` only holds on AC power (stay plugged in; closed lid
  additionally needs `sudo pmset -a disablesleep 1`, then `... 0` afterwards), automatic macOS
  updates can reboot at 3am (turn off "Install macOS updates"), and a closed terminal SIGHUPs a
  non-tmux run (hence tmux).

## Closing out a run

* Verified fixes land one commit each on the branch (`Audit: <title>` trailer), batch-pushed to a
  draft PR. Invalid findings are dropped with a reasoned `chore(audit): drop invalid finding`
  commit. Un-fixable findings move to `docs/AUDIT-DEFERRED.md` (committed) — triage these by hand
  afterwards: re-stage, file as issues, or drop.
* When the backlog is fully drained, `docs/AUDIT.md` should be deleted per
  `.claude/audit-conventions.md` (a partial run may also leave emptied `## Source:` sections — tidy
  them in a final commit).
* Add one row to `docs/AUDIT-LOG.md` per `.claude/audit-conventions.md` §2 (date ·
  `burn-down-audits` · done/deferred/dropped counts + the PR link), then mark the PR ready.
* The deliberately-unported alternative: driving this loop with in-session subagents. Only worth it
  to watch and steer a handful of findings interactively — and that path already exists as
  `/fix-audits`.
