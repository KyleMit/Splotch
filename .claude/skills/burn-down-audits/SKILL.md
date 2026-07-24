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
PUSH_EVERY=10         # push boundary; one per-commit PR comment per pushed fix (see below)
BRANCH=audit/burndown
CHECK_CMD='npm run check'      # per-finding type-check gate
TEST_CMD='npm run test:unit'   # per-finding fast-test gate (see the layered gate below)
E2E_CMD='npm run test:e2e --'  # per-finding targeted E2E, only for UI-touching findings
LINT_CMD='npx eslint'          # per-finding lint gate, on the fix's changed files
PUSH_TEST_CMD='npm test'       # full suite once per batch, before each push
MAX_DEFERRALS=3       # consecutive deferrals before halting
RETRIES=3             # retries per claude call before treating it as a deferral
MODEL_VERIFY=sonnet   # verification is mostly grep-and-confirm
MODEL_IMPL=opus
MODEL_REVIEW=opus
BUDGET_VERIFY=3.00    # --max-budget-usd per call; verify is code-read-heavy — see Tuning & lessons
BUDGET_IMPL=4.00
BUDGET_REVIEW=2.00
```

### The layered test gate — why type-checking isn't enough

Unattended, the expensive failure is a fix that type-checks but breaks a test and commits green. So
verification is layered by cost, catching a regression as early — and as attributed to one finding —
as possible:

* **Every finding**, after the adversarial review approves, the driver itself re-runs `CHECK_CMD`
  **and** `TEST_CMD` (fast unit tests) **and** `LINT_CMD` on the files the fix changed — it does not
  trust the role prompts to have run them. A red result rolls the fix back and defers the finding
  rather than committing it. Keep `TEST_CMD` fast (unit only). The lint gate exists because a
  type-check is a different axis from eslint: a fix can pass `CHECK_CMD` yet ship a stray `any`
  (`@typescript-eslint/no-explicit-any`) or a raw `Map` in a `.svelte.ts`
  (`prefer-svelte-reactivity`) — both slipped an early run onto the branch and reddened CI's Quality
  (lint) job.
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

### Per-commit PR comments

Each pushed fix gets its own PR comment — the finding (issue), the implementer's own summary (how it
was solved), and any adversarial catch the reviewer forced before approval — so the PR reads as a
per-commit history rather than a batched dump. `scripts/audit-burndown/comment.mjs` renders them
(unit-tested in `scripts/tests/audit-burndown-comment.test.mjs`); `pushBatch` posts them only after
a successful push, so a comment never references an unpushed SHA. Deferrals and drops stay in the
commit log only (they carry their reason in the commit message).

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
  additionally needs `sudo pmset -a disablesleep 1`, then `... 0` afterwards), and automatic macOS
  updates can reboot at 3am (turn off "Install macOS updates"). `tmux` is optional: when present it
  lets you `tmux attach`; without it `overnight.mjs` falls back to a detached `caffeinate` process
  (setsid) that still survives a closed terminal — `brew install tmux` only if you want to attach.

## Tuning & lessons

Notes from real runs — set these before a large run rather than discovering them at 3am:

* **Verify is the slowest role and the main halt risk.** It reads a lot of code to confirm a finding
  at HEAD (~150s median on this repo) and occasionally needs more than $1. The old
  `BUDGET_VERIFY=1.00` clipped complex findings (`error_max_budget_usd` → deferral), and a cluster of
  those nearly tripped the three-consecutive-deferral halt. Default is now `3.00`; don't drop it
  below ~$2.50 for a big run.
* **On a Claude subscription the `audit:cost` dollars are notional** — no API bill; the real ceiling
  is your usage window. A big run self-pauses when the window is exhausted (retries fail → deferrals
  → halt) and resumes cleanly on relaunch. Size a run by wall-clock and usage, not the dollar
  figure.
* **Scoping is correct; the wall-clock is inherent.** verify=sonnet (cheap confirm + brief),
  impl=opus, review=opus (adversarial). ~8–10 min/finding is three sequential LLM roles plus
  independent test gates — and the reviewer running the tests *itself* rather than trusting the
  author is the whole point, so that redundancy stays. A ~100-finding chunk is ~13–16h.
* **The one safe speed lever is impl-model tiering.** Much of a `/code-audit` backlog is trivially
  mechanical (P4/P5 dead-code, rename, dedup); routing those to `MODEL_IMPL=sonnet` (the opus review
  still gates them) shaves the long tail, at a sliver of impl-correctness margin — opt in per run,
  don't default it on when correctness dominates. Bigger throughput (parallel git worktrees per
  finding) is a real redesign, not a knob.
* **`docs/AUDIT-DEFERRED.md` is auto-formatted.** `defer()` runs `dprint fmt` on it before the
  commit, so a deferral no longer reddens CI's Quality (format) job — the file's header used to be
  wrapped narrower than dprint's width.

## Closing out a run

* Verified fixes land one commit each on the branch (`Audit: <title>` trailer), batch-pushed to a
  draft PR, each with its own per-commit comment (see above). Invalid findings are dropped with a
  reasoned `chore(audit): drop invalid finding` commit. Un-fixable findings move to
  `docs/AUDIT-DEFERRED.md` (committed) — triage these by hand afterwards: re-stage, file as issues,
  or drop.
* When the backlog is fully drained, `docs/AUDIT.md` should be deleted per
  `.claude/audit-conventions.md` (a partial run may also leave emptied `## Source:` sections — tidy
  them in a final commit).
* Add one row to `docs/AUDIT-LOG.md` per `.claude/audit-conventions.md` §2 (date ·
  `burn-down-audits` · done/deferred/dropped counts + the PR link), then mark the PR ready.
* The deliberately-unported alternative: driving this loop with in-session subagents. Only worth it
  to watch and steer a handful of findings interactively — and that path already exists as
  `/fix-audits`.
