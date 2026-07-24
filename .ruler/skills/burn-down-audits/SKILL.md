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
E2E_CMD='npm run test:e2e -- --retries=1'  # per-finding targeted E2E (retry past flakes), UI findings only
LINT_CMD='npx eslint'          # per-finding lint gate, on the fix's changed files
PUSH_TEST_CMD='npm test'       # full suite once per batch, before each push
MAX_DEFERRALS=3       # consecutive deferrals before halting
RETRIES=3             # retries per claude call before treating it as a deferral
MODEL_VERIFY=sonnet          # verification is mostly grep-and-confirm (`sonnet` alias → Sonnet 5)
MODEL_IMPL=claude-opus-5     # pinned id, not the `opus` alias — see below
MODEL_IMPL_MINOR=sonnet      # impl model for P4/P5 findings only — see Tuning & lessons
MODEL_REVIEW=claude-opus-5
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

**Never wrap a SHA in backticks in GitHub-bound text.** GitHub's native linker turns a bare
plain-text commit SHA into a link to that commit (rendered as a short, hoverable reference); inside
a code span it stays dead monospace text, which is exactly the wrong outcome for a comment whose job
is to point at a commit. The renderer emits the heading as `### <sha12> — <title>` for that reason,
and a unit test pins it. The same applies to any SHA you write by hand into a PR body, PR comment,
or issue comment — leave it bare. (Backticks around *file paths and spec names* are still correct;
this is only about SHAs.)

## Before the full run

1. `npm run audit:preflight` — fix anything red.
2. **Canary:** `npm run audit:burndown` (5 findings) and read the commits it makes —
   `git log main..HEAD -p -- . ':(exclude)docs/AUDIT.md'` keeps the backlog churn out of the diff.
   Read for **behavior changes smuggled inside a refactor**, which is what this loop gets wrong when
   it gets anything wrong, and what a green type-check and test suite will not catch:
   * A dedup finding whose call sites were not actually identical — the classic is three sites where
     two were guarded and one was not, unified onto the guarded form. Establish that the guard is
     always satisfied at the third site (or that the difference was real) before accepting it.
   * A "derive this constant from that one" fix where the two happened to be equal by coincidence
     rather than by intent — check whether the source is pinned by anything (a comment, a test) or
     is free to drift.
   * A narrowed type whose invalid-input tests were made to compile with `as` casts; confirm the
     runtime guard those tests exercise still exists.
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

## Responding to control messages mid-run

The driver runs detached, so the user steers it by chatting with **you**, the supervising agent —
not by touching the process. Four verbs, each a fixed procedure. Never hand-edit `docs/AUDIT.md` or
the running process; only use the signals below. All four leave a resumable end state (state is
`docs/AUDIT.md` + git + the draft PR), so this session or a brand-new one can carry out any of them.

### "status" — report without interrupting anything

Read-only: do **not** touch the STOP file or the process. Run `npm run audit:status` and relay the
counts, run state, and — when a finding is in flight — the two elapsed figures it prints
(`in-flight <elapsed> <finding>` and `current claude call <etime>`). Then **gut-check the duration**
against these norms (from real runs on this repo):

| Signal                                       | Normal   | Watch     | Investigate |
| -------------------------------------------- | -------- | --------- | ----------- |
| whole finding (`in-flight`)                  | ≤ 15 min | 15–25 min | > 25 min    |
| single `claude` call (`current claude call`) | ≤ 10 min | 10–15 min | > 15 min    |

Verify is ~150s; impl/review are the long poles; an E2E-gated finding runs longer. Budget and turn
caps normally terminate a runaway call on their own near these ceilings.

* **Within normal** → just report it; do nothing.
* **Watch band (maybe too long)** → don't intervene yet. Schedule **one** re-check a few minutes out
  and see whether it *advanced* (HEAD moved or `run.log` grew). Run it as a background job so it
  reports back on its own:
  ```bash
  before="$(git rev-parse HEAD)$(wc -l < .audit-work/logs/run.log)"
  sleep 300
  after="$(git rev-parse HEAD)$(wc -l < .audit-work/logs/run.log)"
  [ "$before" = "$after" ] && echo "STALLED: no advance in 5m" || echo "ADVANCED"
  ```
  Advanced → all is well. Still identical → treat it as *investigate*.
* **Investigate (too long)** → decide whether remediation is warranted before acting. Check whether
  the current `claude` child is alive and *working* (`ps -o %cpu,etime -p <pid>`; is its role
  `.audit-work/logs/*.json` still growing?) versus hung (0% CPU, static log and envelope). A
  genuinely stuck call: `pkill -TERM -f 'claude -p'` kills only that one call — the driver's
  `RETRIES` re-attempt it or the finding defers; the orchestrator and every committed fix are
  untouched and state stays durable. Never kill `burndown.mjs` itself for a merely slow finding.

### "pause" — stop cleanly after the current finding

`touch .audit-work/STOP`. The driver checks it at the top of each iteration, so it **finishes the
entire in-flight workflow** — verify → implement → review → gates → commit, and the exit flush
pushes the batch and posts each fix's PR comment — then exits without starting the next finding.
Wait for the process to exit, then confirm the end state is resumable: no `burndown.mjs` /
`claude -p` process left, `git rev-parse HEAD` == `origin/<branch>` (nothing unpushed), and the
durable checkpoint (memory / handoff) reflects the new counts. **Leave the STOP file in place** — it
holds the pause; a stray relaunch would exit immediately. Stand down any run-log monitor while
paused.

### "resume" / "continue" — start the next finding

Only after verifying **nothing is already in flight**: `pgrep -f audit-burndown/burndown.mjs` must
be empty (if it isn't, the run is already going — say so, don't launch a second). Then
`rm
.audit-work/STOP`, relaunch with the exact command from the durable checkpoint (including the
env overrides that dodge the flaky palette snapshots), and re-arm the event-driven monitor. The
launcher self-recovers even in a brand-new session that never saw this run — see **Resuming a
crashed run** below.

### "wrap up" — finalize now and mark the PR ready

Terminal, unlike pause. `touch .audit-work/STOP` so the in-flight finding still lands (don't waste a
nearly-done fix), wait for exit, then run **Closing out a run** below: push anything unpushed, add
the `docs/AUDIT-LOG.md` row, tidy any emptied `## Source:` sections, and `gh pr ready <PR#>`. The
backlog may still hold findings — that's expected; wrap-up ships what's done and closes the run out.

## Surviving the context window (supervising a 100+-finding run)

A full run is many hours; you — the supervising agent — will not last it in one context window. But
the driver is a **subprocess** that needs none of your conversation: its state is `docs/AUDIT.md` +
git + `.audit-work/` + the draft PR, so it keeps running (and a fresh context can take over) no
matter what happens to yours. Exploit that — hold **no** orchestration state in the conversation:

* The moment you know them, write everything needed to launch, monitor, and close out to a **durable
  file** and keep it current: the exact **relaunch command** (with every non-default override), the
  **PR number**, roughly what's done, and the **closeout tasks**. Use a `project`-type memory
  (Claude Code) or a `docs/handoff/` packet. A fresh or compacted context then resumes from that
  file + `npm run audit:status` — nothing is re-derived.
* **Record the *contents* of any helper script a knob points at, not just its path.** `.audit-work/`
  is gitignored, so a `PUSH_TEST_CMD` wrapper (e.g. one excluding screenshot specs that are flaky on
  this machine) lives on exactly one disk and is invisible to a fresh clone — the very scenario the
  resume story promises to survive. A checkpoint that says
  `PUSH_TEST_CMD='bash .audit-work/push-test.sh'` and nothing more is unrecoverable; the next
  session has to reconstruct it by grepping old `run.log` lines for the command that ran.
* Because all state is on disk, **compaction is lossless** — compact proactively (or let
  auto-compact fire) when the context fills, rather than letting the window overflow mid-run. Don't
  wait to be forced.
* Keep the supervising context small so it lasts: monitor the run **event-driven** — not by polling
  `audit:status` in a loop, and don't read per-finding logs or the PR back unless you're diagnosing
  something specific. Watch for every terminal *and* degraded state, so silence really does mean
  "healthy and working":
  ```bash
  tail -f -n 0 .audit-work/logs/run.log | grep -E --line-buffered \
    "HALT|hit a cap|red at batch|red on the final|push failed|gh pr create FAILED|no PR to comment on|DEFERRED|finished:"
  ```
  `gh pr create FAILED` / `no PR to comment on` matter as much as a halt: the run keeps committing
  and pushing perfectly well with no PR behind it, so without that signal you find out hours later
  that a night of fixes has no PR and no per-commit comments.

## Resuming a crashed run (or a brand-new session)

The whole run is reconstructable from git + the draft PR + `docs/AUDIT.md`, so a session that dies
mid-run — or a completely fresh session, even a fresh clone on another machine with no
`.audit-work/` — can pick up exactly where it stopped. Relaunch with the overnight launcher
(`npm run audit:burndown:overnight -- <n>`), which sets `RESUME=1`; startup then reconciles state
before touching a finding:

* **Latches onto the real branch** — it creates the local branch *from* `origin/<branch>` when a
  fresh clone has only the remote (a plain `git switch -c` would fork from `main` and silently
  abandon the run), and fast-forwards to `origin/<branch>` to adopt progress another machine pushed
  (keeping local commits when it's ahead).
* **Rediscovers the draft PR** via `gh pr list --head <branch>`. `.audit-work/pr-number` is
  gitignored and won't survive a fresh clone, so without this the next push would open a
  **duplicate** draft PR.
* **Clears crash residue** (`RESUME=1` only) — resets a dirty tree left by a half-done finding back
  to HEAD and removes a stale `STOP`. The reset loses no accepted work: a finding's `docs/AUDIT.md`
  entry is deleted only *inside* its fix commit, so an interrupted finding is still listed and
  simply re-processed. `RESUME` is off for a bare `npm run audit:burndown`, so a canary in a dirty
  repo still halts rather than discarding real uncommitted changes.

`npm run audit:preflight` (the launcher runs it for you) prints a **resume target** block — the
branch state and the PR number it will latch onto — so a fresh session can confirm it's continuing
the real run, not forking a new one, *before* it starts. One self-healing edge: if a crash lands
between a fix's commit and the `docs/AUDIT.md` fold, that finding is re-verified at HEAD, found
already fixed, and dropped as invalid — one extra drop commit, no lost work. **Before relaunching,
commit or stash any real work in progress** — `RESUME=1` treats a dirty tree as crash residue and
resets it.

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
* **Scoping is correct; the wall-clock is inherent.** verify=Sonnet 5 (cheap confirm + brief),
  impl=Opus 5, review=Opus 5 (adversarial). ~8–10 min/finding is three sequential LLM roles plus
  independent test gates — and the reviewer running the tests *itself* rather than trusting the
  author is the whole point, so that redundancy stays. A ~100-finding chunk is ~13–16h.
* **The opus roles are pinned to the explicit `claude-opus-5` id, not the `opus` alias.** The `opus`
  alias can lag a fresh release (it still resolved to `claude-opus-4-8` right after Opus 5 shipped),
  so pinning the id is what actually puts impl/review on Opus 5; `sonnet` already resolves to Sonnet
  5, so verify stays on the alias. When a newer opus lands, re-probe
  (`claude -p --model
  <id> --output-format json 'ok'` → check `modelUsage`) and bump the pin.
* **Impl-model tiering is on by default, scoped to P4/P5.** Much of a `/code-audit` backlog is
  trivially mechanical (P4/P5 dead-code, rename, dedup), so the driver routes those findings to
  `MODEL_IMPL_MINOR` (default `sonnet`) and keeps P1–P3 on `MODEL_IMPL`. The Opus review still gates
  every fix, so the cheaper model buys wall-clock at a sliver of impl-correctness margin exactly
  where the stakes are lowest. The priority comes from the finding's leading `[P<n>]` tag
  (`findingPriority` in `lib.mjs`, unit-tested); a title with no tag is treated as unknown and stays
  on the stronger model. Set `MODEL_IMPL_MINOR=claude-opus-5` to switch tiering off for a run where
  correctness dominates. Bigger throughput (parallel git worktrees per finding) is a real redesign,
  not a knob.
* **The PR is the fragile part of the run; the commits are not.** Pushing is plain git and is
  reliable; *creating* the draft PR is a GitHub API call that can fail hard and stay failed — a
  2026-07-24 run hit HTTP 500 on `gh pr create` for over 20 minutes, on both the GraphQL and REST
  paths and on a freshly-named branch, with githubstatus.com green throughout. Treat "no PR" as an
  annoyance, not a reason to stop: the commits are pushed and are the durable artifact. `pushBatch`
  now logs the failure and spills the unpostable per-commit comments to
  `.audit-work/pending-comments.jsonl` (re-render them with `comment.mjs`) instead of losing them at
  exit. When diagnosing, read the **last** line of gh's output — it emits warnings ahead of the real
  error, so `head -1` shows you "Warning: N uncommitted changes" and hides the cause.
* **A cached `.audit-work/pr-number` can outlive its PR.** The driver prefers that file over
  rediscovery, so a number left by a previous run whose PR has since merged would send this run's
  per-commit comments onto a landed PR. Startup now discards a cached number that isn't the branch's
  open PR (only when the lookup actually succeeded — a network blip must not throw away a good
  number and cause a duplicate PR), and `audit:preflight` warns about the mismatch before you
  launch. Worth a glance at the preflight `resume target` block anyway whenever the last run's PR
  was merged.
* **`docs/AUDIT-DEFERRED.md` is auto-formatted.** `defer()` runs `dprint fmt` on it before the
  commit, so a deferral no longer reddens CI's Quality (format) job — the file's header used to be
  wrapped narrower than dprint's width.
* **Retry E2E to survive transient flakes.** A single flaky E2E failure red-lights an
  otherwise-green batch (holding the push) or false-defers a good fix. `E2E_CMD` and the batch
  `PUSH_TEST_CMD` both carry `--retries=1` so a genuine flake clears on retry; a real regression
  still fails both attempts. A batch hold isn't fatal regardless — the next boundary (or the exit
  flush) retries and pushes.

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
