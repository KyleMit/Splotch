---
name: burn-down-audits
description: Drive the scripted bulk burndown of docs/AUDIT.md — one one-shot `claude -p` subprocess per role per finding (verify → implement → adversarial review → fix), orchestrated by scripts/audit-burndown/ and built to run unattended. Use when the staged audit backlog is too large to vet-and-file as GitHub issues (hundreds of findings) and the user asks to burn it down in bulk, run the audit burndown, or launch/check on a run.
---

# Burn down audits

Progressive, adversarial burndown of a large `docs/AUDIT.md` backlog. Each finding goes through
verify → implement → review → fix, entirely inside one-shot `claude -p` subprocesses, so nothing
accumulates in a long-lived context window. The driver is `scripts/audit-burndown/burndown.mjs`;
this skill is the runbook for launching, watching, and closing out a run.

**This runs in a Claude Code cloud session.** Two facts shape everything below and are not
negotiable knobs:

* **The driver never talks to GitHub.** There is no usable github.com credential in the container,
  and `origin` is a local git proxy URL that `gh` rejects as a non-GitHub host — so `gh` cannot work
  here however it is authenticated. Opening the PR and posting the per-commit comments is **your**
  job, the supervising agent's, through the GitHub MCP tools.
* **The container is ephemeral.** It is reclaimed after a period of inactivity, mid-run, without
  warning. A commit that has not been pushed is work at risk, which is why the driver pushes after
  every single finding.

**When to use which consumer** (shared rules: `.claude/audit-conventions.md`): for a normal-sized
backlog (tens of findings), stay with the standard lifecycle — `/vet-audits` files survivors as
`type:audit` issues and `/fix-audits` clears them interactively with subagents. This skill is the
bulk path for a backlog where filing one GitHub issue per finding is impractical (hundreds of
findings, e.g. a whole-codebase `/code-audit` pass). It replaces both vet and fix: its verifier
subprocess *is* the adversarial vet, applied per finding at HEAD.

## Architecture — why subprocesses, not subagents

The orchestrator is a Node script, so the "main context" is process state, not a conversation. Three
consequences worth internalising before touching the driver:

* **`--resume` is the handoff, and the driver MINTS the session id it resumes.** Every fresh role
  call gets a `--session-id <uuid>` the driver generates; the implementer's is passed back on fix
  rounds, so it resumes with its full history — every prior tool call, result, and reasoning step —
  instead of re-deriving the change from review text. Sessions are addressed by ID, which sidesteps
  the name-collision problem of resuming hundreds of same-named subagents.

  **Minting rather than reading `session_id` off the envelope is the whole reason this works in the
  cloud.** Claude Code on the web pins `CLAUDE_CODE_SESSION_ID` in the container environment; every
  `claude -p` child inherits it, reports it as its own `session_id`, and appends to one shared
  transcript. `--resume <that id>` then resolves to whichever role wrote to that transcript last —
  at a fix round, the *reviewer* that just rejected the work, or even the supervising agent's own
  tool output. The 2026-07-25 canary confirmed both fix rounds resuming the reviewer's leaf, so the
  implementer held the critic's context instead of its own and the blind writer/verifier pairing was
  silently void, with nothing in any log to show for it. Unsetting the env var does not help. If you
  ever need to re-verify the mechanism: two `claude -p` calls with distinct `--session-id`s, plant a
  codeword in one, resume it and ask for the codeword back.
* **`--json-schema` replaces prose parsing.** Verdicts, SHAs, and review statuses come back typed in
  `.structured_output`; no regex ever touches a SHA.
* **State is `docs/AUDIT.md` plus git — on `origin`.** A finding's entry is deleted in the *same
  commit* as its fix, so the file is always an exact record of remaining work and a crash mid-run
  leaves nothing to reconcile. Re-running resumes where it stopped. Everything else (`.audit-work/`)
  is disposable working state — which cuts both ways: it is safe to delete and safe from the
  driver's `git reset --hard` rollback (being gitignored is what keeps pending comment records out
  of a rollback's blast radius), but it dies with the container, so nothing that *only* lives there
  (`compact-snapshot.md`, undrained comment records) can be the sole record of anything for long.
* **The driver's contract stops at `git push`.** No PR creation, no comments, no `gh`. It appends
  one JSON record per fix to `.audit-work/pending-comments.jsonl` and expects you to post it.

No agent — including you — should read or edit `docs/AUDIT.md` directly at burndown scale (~19k
lines): `scripts/audit-burndown/pop.mjs` is the only thing that touches it (`--count`, print,
`--peek N`, `--delete`). Role system prompts live in `scripts/audit-burndown/prompts/*.md`.

## Commands

| Command                            | Purpose                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| `npm run audit:preflight`          | Read-only go/no-go: deps, auth, clean tree, origin reachable, backlog, check |
| `npm run audit:burndown`           | The driver loop — canary default `MAX_ISSUES=5`                              |
| `npm run audit:burndown:overnight` | Preflight-gated unattended launch, spawned detached (`-- 600`)               |
| `npm run audit:status`             | Counts, progress bar, run state, unposted comments, recent `Audit:` commits  |
| `npm run audit:cost`               | Spend by role, per-issue average, projected total                            |
| `npm run audit:watch`              | `tail -f` the run log; `-- --dash` for a refreshing summary                  |

Draining the per-commit comments (there is no `gh`; you post these yourself):

| Command                                   | Purpose                                                       |
| ----------------------------------------- | ------------------------------------------------------------- |
| `…/backfill-comments.mjs next`            | Print the next pending record: its SHA, then the comment body |
| `…/backfill-comments.mjs done <sha>`      | Drop that record — call it *after* the MCP post succeeds      |
| `…/backfill-comments.mjs show`            | Print every pending comment, for a quick read-through         |
| `…/backfill-comments.mjs capture [range]` | Rebuild records from run.log + role envelopes + git           |

## Knobs

All environment variables on `audit:burndown`, all with defaults:

```bash
MAX_ISSUES=5          # how many to complete before stopping (canary default; unattended passes 600)
PUSH_EVERY=1          # push after every finding — the container is ephemeral (see below)
BRANCH=audit/burndown
CHECK_CMD='npm run check'      # per-finding type-check gate
TEST_CMD='npm run test:unit'   # per-finding fast-test gate (see the layered gate below)
E2E_CMD='npm run test:e2e -- --retries=1'  # per-finding targeted E2E (retry past flakes), UI findings only
LINT_CMD='npx eslint'          # per-finding lint gate, on the fix's changed files
PUSH_TEST_CMD=''      # local full-suite gate before a push — OFF; CI on the draft PR is the backstop
COMMENT_STORE=.audit-work/pending-comments.jsonl   # per-commit comment records awaiting your MCP post
MAX_DEFERRALS=3       # consecutive deferrals before halting
RETRIES=3             # retries per claude call before treating it as a deferral
MODEL_VERIFY=sonnet          # verification is mostly grep-and-confirm (`sonnet` alias → Sonnet 5)
MODEL_IMPL=claude-opus-5     # pinned id, not the `opus` alias — see below
MODEL_IMPL_MINOR=sonnet      # impl model for P4/P5 findings only — see Tuning & lessons
MODEL_REVIEW=claude-opus-5
BUDGET_VERIFY=3.00    # --max-budget-usd per call; verify is code-read-heavy — see Tuning & lessons
BUDGET_IMPL=4.00
BUDGET_REVIEW=3.00
EFFORT_VERIFY=medium  # --effort per role; the main wall-clock lever — see Tuning & lessons
EFFORT_IMPL=high
EFFORT_REVIEW=medium
```

### The layered test gate — why type-checking isn't enough

Unattended, the expensive failure is a fix that type-checks but breaks a test and commits green. So
verification is layered by cost, catching a regression as early — and as attributed to one finding —
as possible:

* **Every finding, at the top of every review round**, the driver itself runs `CHECK_CMD` **and**
  `TEST_CMD` (fast unit tests) **and** `LINT_CMD` on the files the fix changed — it does not trust
  the role prompts to have run them. Keep `TEST_CMD` fast (unit only). The lint gate exists because
  a type-check is a different axis from eslint: a fix can pass `CHECK_CMD` yet ship a stray `any`
  (`@typescript-eslint/no-explicit-any`) or a raw `Map` in a `.svelte.ts`
  (`prefer-svelte-reactivity`) — both slipped an early run onto the branch and reddened CI's Quality
  (lint) job.
* **UI-touching findings only**, at the same point, the driver also runs `E2E_CMD` against the
  Playwright spec(s) the verifier named for that finding (its `e2e_specs`). This catches a
  behavioural regression *before it commits*, attributed to the one finding that caused it, without
  paying full-suite E2E on all 600 findings — only the fraction with a runtime surface run E2E, and
  only their relevant spec. A pure refactor / script / doc finding names no specs and skips it. The
  verifier writes the specs into both `e2e_specs` and the acceptance criteria, so the implementer
  runs them too.
* **Cross-finding interactions the per-finding specs can't see are CI's job, not the driver's.**
  `PUSH_TEST_CMD` (the local full-suite gate) defaults to empty and does not run. Every finding is
  pushed to the draft PR, and the PR's CI runs the whole suite on that push — in parallel, off the
  critical path of the next finding. Running `npm test` locally too would add ~1–2 min per finding
  to learn the same thing *later* than CI does.

  The tradeoff is real and you are the one who absorbs it: a cross-finding regression no longer
  blocks a push, it turns a CI run red asynchronously, so **watching CI is part of supervising the
  run**. Set `PUSH_TEST_CMD='npm test'` to restore the old blocking behaviour when nobody will be
  watching.

  **CI coverage is per-push, not per-commit, and pushing every finding thins it.** `test.yml` sets
  `concurrency: cancel-in-progress: true`, so each push cancels the previous run if it is still
  going. A finding that lands 3 minutes after the last one (P4/P5 on the minor model routinely do)
  cancels a suite that needed longer, and only the newest push runs to completion. The last push
  always finishes, so "the branch is sound at the end" holds — but "every intermediate commit was
  green" does not, and bisecting a regression to one finding may mean re-running the suite at that
  commit by hand. Judge a run by the *final* CI result plus the per-finding gates, not by a green
  tick on every commit.

**The gates run *before* the review, not after it** — and that ordering does two jobs at once. A red
gate becomes a **fix round** the implementer can still recover from (it is holding the same session)
instead of discarding a finished finding at the very end; and the reviewer only ever sees a commit
that already passes, so it does not re-run any of this. Re-running was the single largest slice of
review wall-clock and could only ever confirm what the driver already knew. The reviewer therefore
has **no `npm`/`npx` in its tool scope at all** — the constraint is structural, not a request in the
prompt — and its brief is the part no test run can do: reading the diff for behaviour smuggled
inside a refactor, stragglers left by a rename, and changed behaviour that nothing covers.

The reviewer is also handed the **original finding**, not just the verifier's acceptance criteria,
so it can reject a fix that satisfies mis-scoped criteria while missing what the finding asked for —
the verifier is the one role with no independent check.

A deferral now names the role that actually failed: `fix broke the test suite` /
`fix broke a targeted E2E spec` / `fix introduced a lint violation` / `fix broke the type-check` for
a gate that never went green, `implementer failed to deliver a fix round`, `reviewer unavailable`,
and `failed adversarial review` **only** when a reviewer genuinely rejected the work.

### Per-commit PR comments

Each fix gets its own PR comment — the finding (issue), the implementer's own summary (how it was
solved), and any adversarial catch the reviewer forced before approval — so the PR reads as a
per-commit history rather than a batched dump. `scripts/audit-burndown/comment.mjs` renders them
(unit-tested in `scripts/tests/audit-burndown-comment.test.mjs`). Deferrals and drops stay in the
commit log only (they carry their reason in the commit message).

**The driver writes these records; you post them.** The instant a fix lands, one JSON line is
appended to `COMMENT_STORE` (default `.audit-work/pending-comments.jsonl`) — written immediately
rather than held in memory until a push, because an earlier version accumulated them in an array and
a kill between two pushes took every reviewer catch since the last one with it. Then, as often as
you can be bothered (and always at wrap-up), drain the store:

1. `node scripts/audit-burndown/backfill-comments.mjs next` — prints `SHA <sha>` then the rendered
   body.
2. Post it with `mcp__github__add_issue_comment` on the PR number, appending the Claude Code
   attribution footer.
3. `node scripts/audit-burndown/backfill-comments.mjs done <sha>` — drops that record.
4. Repeat until `next` says nothing is pending.

`done` comes **after** the post, deliberately: a crash between the two re-offers the same record, so
the loop is at-least-once. A duplicate comment is a triviality; a silently dropped one is the
reviewer's only written catch, gone.

`npm run audit:status` prints the unposted count, and `audit:preflight` warns about a non-empty
store, so an undrained backlog of comments is visible rather than discovered at closeout.

Point `COMMENT_STORE` at a **committed** path (`docs/AUDIT-PENDING-COMMENTS.jsonl`) for a long
unwatched run — `.audit-work/` dies with the container. It is gitignored by default for a reason
though: a tracked store sits inside the blast radius of the driver's `git reset --hard` rollback
paths. Delete the committed file in the same commit that drains it.

`backfill-comments.mjs capture [range]` rebuilds records for fixes whose comments were never
recorded at all (default range `main..HEAD`), reading run.log for the iteration→sha mapping, the
role envelopes for the summary and catches, and the commit's own `docs/AUDIT.md` deletion for the
finding text. Idempotent — it dedupes by SHA.

> **Iteration log names restart at `iter0001` every run**, so `.audit-work/logs/iter0002.fix1.json`
> may belong to an **earlier** run about a different finding — a shorter run does not clear the
> longer one's files. `capture` dates each iteration by its own `verify.json` mtime and ignores
> anything older. Anything else reading these logs by name (`audit:cost` totals every envelope it
> finds, across all runs) has the same hazard — **including you, reading one by hand.** Waiting on
> `[ -f iter0001.impl.json ]` returns instantly against the *previous* run's file, and the stale
> envelope it hands you looks exactly like a real one. Always filter by mtime against the run's
> start line: `find .audit-work/logs -name 'iter*.json' -newermt '<HH:MM>'`.

**Never wrap a SHA in backticks in GitHub-bound text.** GitHub's native linker turns a bare
plain-text commit SHA into a link to that commit (rendered as a short, hoverable reference); inside
a code span it stays dead monospace text, which is exactly the wrong outcome for a comment whose job
is to point at a commit. The renderer emits the heading as `### <sha12> — <title>` for that reason,
and a unit test pins it. The same applies to any SHA you write by hand into a PR body, PR comment,
or issue comment — leave it bare. (Backticks around *file paths and spec names* are still correct;
this is only about SHAs.)

## Before the full run

1. `npm run audit:preflight` — fix anything red. Then **open the draft PR** with
   `mcp__github__create_pull_request` (`draft: true`, head = `BRANCH`) and keep the number to hand:
   the driver will not create one, and without it the per-commit comments have nowhere to go and CI
   — the only full-suite gate in this configuration — never runs.
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
3. **Confirm the resume handoff actually fired.** Extra rounds happen on their own — a typical run
   logs `round 1: changes required` (a reviewer rejection) or `round 1: gates red — …` (a red gate,
   which is now also a recoverable round) every few findings — so read one instead of staging one.
   Find either line in the canary's log, open that iteration's `fix1.json`, and confirm the resumed
   implementer references its own earlier work rather than re-deriving the change from the feedback
   text. That handoff is the whole design. Only if the canary produced no extra round at all is it
   worth forcing one with a deliberately vague brief.
4. `npm run audit:cost` — multiply the per-issue average by the backlog before committing to a full
   run.
5. `npm run audit:burndown:overnight -- 600`.

## While it runs

* Stop gracefully with `touch .audit-work/STOP` (exits after the current finding; `rm` it before
  resuming). Stop hard with `pkill -TERM -f 'claude -p'`.
* **Never edit a tracked file while the driver is running.** Its rollback paths run
  `git reset -q --hard <baseSha>`, which wipes uncommitted working-tree edits with no warning and no
  reflog entry — and at a realistic deferral rate that fires within the hour. Committing mid-run is
  worse: you are racing the driver's own `git commit`/`--amend` on the same branch. If you find a
  bug in the driver worth fixing now, **pause first** (`touch .audit-work/STOP`, wait for exit),
  then edit. Writing to `.audit-work/`, to memory, or to a scratchpad is safe — those are outside
  the reset's blast radius.
* Transient API failures are retried with exponential backoff; a budget/turn cap is treated as a
  real answer and deferred, not retried. That is right for verify and impl (a cap means the role
  could not finish its work) but read the reviewer's cap differently: it produced *no verdict*, so
  the finding is deferred `reviewer unavailable`, never "failed adversarial review". Three
  *consecutive* deferrals halt the run — that shape means something systemic (auth, disk, a red
  tree), not three unlucky findings.
* **Watch CI, not just the run log.** With no local full-suite gate, a red CI run on the draft PR is
  the only signal that one finding broke something another finding's targeted specs don't cover.
  Check it when you drain comments; treat a red run as a reason to pause and diagnose rather than
  something to sweep up at the end, because every finding after it lands on a broken base.
* **The container can vanish mid-run** — reclaimed for inactivity, with no signal and no chance to
  flush. Nothing local prevents that; pushing every finding is what makes it survivable. When you
  come back to a dead container, everything that mattered is on `origin` and the run relaunches
  straight into the next finding. What you *do* lose is `.audit-work/`: the role envelopes, the run
  log, and **any comment records you had not yet posted**. That is the argument for draining the
  store as you go rather than at the end.

## Responding to control messages mid-run

The driver runs detached, so the user steers it by chatting with **you**, the supervising agent —
not by touching the process. Four verbs, each a fixed procedure. Never hand-edit `docs/AUDIT.md` or
the running process; only use the signals below. All four leave a resumable end state (state is
`docs/AUDIT.md` + git + the draft PR), so this session or a brand-new one can carry out any of them.

Do the verb you were given, at the scope it implies, and stop there — a status request is a status
report, not an investigation, and something adjacent you notice is worth one sentence in your reply
rather than a detour into fixing it. If the run's setup looks wrong or a better approach exists, say
so and carry out the verb as asked. Delegate to a subagent only to keep a large diagnostic read (a
multi-run `run.log` sweep, a per-finding envelope) out of this context — that is what protects the
window you are trying to conserve. Never delegate to double-check the driver, and never for work
that is a handful of tool calls.

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
caps normally terminate a runaway call on their own near these ceilings. **Priority skews this
hard** — with `MODEL_IMPL_MINOR` tiering on, P4/P5 findings land in 3–5 min while a P1 refactor that
takes two fix rounds runs 20–30 and is still healthy. Check the finding's `[P<n>]` tag before
reading a duration as slow; the table above describes a mid-priority finding, not every finding.

> These figures were measured **before** the `EFFORT_*` knobs and the gate reordering (which
> together cut a full suite run out of every review round), so they are now a conservative ceiling
> rather than a norm. Re-baseline them from the first long run under the new defaults and update
> this table.

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
pushes — then exits without starting the next finding. Wait for the process to exit, then confirm
the end state is resumable: no `burndown.mjs` / `claude -p` process left, `git rev-parse HEAD` ==
`origin/<branch>` (nothing unpushed), the comment store drained onto the PR, and the durable
checkpoint (memory / handoff) reflecting the new counts. **Leave the STOP file in place** — it holds
the pause; a stray relaunch would exit immediately. Stand down any run-log monitor while paused.

### "resume" / "continue" — start the next finding

Only after verifying **nothing is already in flight**: `pgrep -f audit-burndown/burndown.mjs` must
be empty (if it isn't, the run is already going — say so, don't launch a second). Read the matches
rather than counting them: `pgrep -f` matches whole command lines, so the launcher's `env … node …`
wrapper — and any shell whose own command line happens to mention the path, including the `pgrep`
call you just typed — matches too. Only a bare `node scripts/audit-burndown/burndown.mjs` line is
the driver. Then `rm .audit-work/STOP`, relaunch with the exact command from the durable checkpoint,
and re-arm the event-driven monitor. The launcher self-recovers even in a brand-new session that
never saw this run — see **Resuming a crashed run** below.

**Monitor hygiene, both directions.** A monitor tailing `run.log` does *not* reliably survive the
run it was watching, so after every relaunch confirm the new one is actually armed rather than
assuming it — a dead monitor is indistinguishable from a quiet run, and that silence reads as "all
is well" for hours. The mirror failure is just as easy: a monitor from a *previous* run can still be
alive and will double-report every event, so stop the old one before arming the new one instead of
stacking them.

### "wrap up" — finalize now and mark the PR ready

Terminal, unlike pause. `touch .audit-work/STOP` so the in-flight finding still lands (don't waste a
nearly-done fix), wait for exit, then run **Closing out a run** below: push anything unpushed, drain
the comment store, add the `docs/AUDIT-LOG.md` row, tidy any emptied `## Source:` sections, and mark
the PR ready (`mcp__github__update_pull_request` with `draft: false`). The backlog may still hold
findings — that's expected; wrap-up ships what's done and closes the run out.

### No verb — pausing on your own initiative

The four verbs above are user-initiated, but the user is usually away, and a run that is quietly
destroying work will keep doing so until someone stops it. **Pause without asking when the run is
actively losing work at a measurable rate and you can fix the cause.** `STOP` is designed to be
cheap and reversible — the in-flight finding lands, state stays durable, and a relaunch resumes — so
the downside of pausing wrongly is one relaunch, while the downside of waiting is hours of discarded
fixes.

The bar is *demonstrated recurrence*, not one bad finding. One deferral is noise; the same failure
twice with a mechanism you can point at is a rate. Establish the rate before acting (two hits in
fourteen findings is ~14%, and projecting that over the remaining backlog is the argument), then
pause, fix, relaunch, and report what you did and why — never narrate it as though the user approved
it. A background event is not a reply, and neither is your own earlier message proposing the action.

Do **not** self-pause for a failure that is merely *safe* — a deferral that rolls back cleanly and
labels itself honestly costs one finding and nothing else. Note it, keep running, and fix it at the
next natural boundary. Reserve the interrupt for work being silently lost.

## Surviving the context window (supervising a 100+-finding run)

A full run is many hours — longer than one supervising context, even on Opus 5's 1M-token window
(confirmed live: Claude Code reports `contextWindow: 1000000` for `claude-opus-5`, so the ceiling is
further off than it used to be, but a 13–16h run still outlasts it). Plan for the handover rather
than hoping to avoid it. The driver is a **subprocess** that needs none of your conversation: its
state is `docs/AUDIT.md` + git + `.audit-work/` + the draft PR, so it keeps running (and a fresh
context can take over) no matter what happens to yours. Exploit that — hold **no** orchestration
state in the conversation:

* The moment you know them, write everything needed to launch, monitor, and close out to a **durable
  file** and keep it current: the exact **relaunch command** (with every non-default override), the
  **PR number**, roughly what's done, and the **closeout tasks**. Use a `project`-type memory
  (Claude Code) or a `docs/handoff/` packet. A fresh or compacted context then resumes from that
  file + `npm run audit:status` — nothing is re-derived.
* **Record the *contents* of any helper script a knob points at, not just its path.** `.audit-work/`
  is gitignored and container-local, so a `PUSH_TEST_CMD` wrapper (e.g. one excluding specs that are
  flaky here) lives on exactly one disk that is going to disappear — the very scenario the resume
  story promises to survive. A checkpoint that says `PUSH_TEST_CMD='bash .audit-work/push-test.sh'`
  and nothing more is unrecoverable; the next session has to reconstruct it by grepping old
  `run.log` lines for the command that ran.
* Because all state is on disk, **compaction is lossless** — compact proactively (or let
  auto-compact fire) when the context fills, rather than letting the window overflow mid-run. Don't
  wait to be forced. A `PreCompact` hook (`.claude/hooks/precompact-burndown-snapshot.sh`) backstops
  this automatically: whenever a run is in flight or left work owed, it writes
  **`.audit-work/compact-snapshot.md`** — the relaunch command the driver recorded once its
  preflight gates passed, `audit:status`, which run-log monitors are actually running, and the
  current run's log tail. It no-ops otherwise and never blocks compaction. A companion
  `SessionStart` hook (matcher `compact`, `.claude/hooks/session-start-burndown-snapshot.sh`) is
  what actually *tells* the next session the snapshot is there — `PreCompact` has no
  `additionalContext` support, so its own stdout reaches the transcript but never the
  post-compaction model.
* **Read `.audit-work/compact-snapshot.md` first** when you come back to a burndown with no memory
  of starting it — after a compaction, or as a fresh session. It is the most concrete account of how
  the run was launched. But it is **point-in-time, not live**: it is rewritten only when compaction
  fires, never when the run's state changes. A clean finish deletes it, and the `SessionStart` hook
  stays quiet about one older than a day with no driver running — but a hard-killed run leaves a
  snapshot that can still assert "a run is IN FLIGHT" hours later. Check its header timestamp, and
  confirm any pid it names is still alive (`ps -p <pid>`) before acting on that claim. Its other
  limit: it lives in gitignored `.audit-work/`, so it is **container-local** and simply gone once
  the container is reclaimed. The order to trust:

  1. `npm run audit:status` + git + the PR — always authoritative for counts, what landed, and
     whether anything is actually running. Tells you nothing about *how the run was launched*.
  2. `.audit-work/compact-snapshot.md` — the most specific record of the launch, and the only one
     with the log tail; same container only, and only as of its timestamp.
  3. The durable checkpoint (`project` memory / `docs/handoff/` packet) — survives the container,
     but only as current as the last time someone updated it.

  The first two answer different questions, which is why the ordering flipped: ask `audit:status`
  what is true *now*, and the snapshot how the run was *started*.
* Keep the supervising context small so it lasts: monitor the run **event-driven** — not by polling
  `audit:status` in a loop, and don't read per-finding logs or the PR back unless you're diagnosing
  something specific. Watch for every terminal *and* degraded state, so silence really does mean
  "healthy and working":
  ```bash
  tail -f -n 0 .audit-work/logs/run.log | grep -E --line-buffered \
    "HALT|hit a cap|red at batch|red on the final|push failed|no impl session|DEFERRED|finished:|iter"
  ```
  `push failed` matters as much as a halt: the run keeps committing perfectly well against a remote
  it cannot reach, and every commit it makes after that is unprotected. `no impl session` means a
  fix round lost the resume handoff and re-derived the change from review text — one such line is
  tolerable, a pattern of them means the session minting is broken again.

  Whatever you arm, **confirm it is actually armed after every relaunch**, and stop the previous one
  first. This is not hypothetical bookkeeping: a `Monitor` clamps to a 30-minute timeout no matter
  what you request, so a long run silently outlives its own monitor, and the silence that follows is
  indistinguishable from a healthy run.

## Resuming a crashed run (or a brand-new session)

The whole run is reconstructable from git + the draft PR + `docs/AUDIT.md`, so a session that dies
mid-run — or a completely fresh container with no `.audit-work/` at all — can pick up exactly where
it stopped. **If the container survived, start by reading `.audit-work/compact-snapshot.md`** (see
above) — it carries the launch command verbatim, which is the one thing the git/PR/`AUDIT.md` triad
cannot tell you. Then relaunch with the unattended launcher
(`npm run audit:burndown:overnight -- <n>`), which sets `RESUME=1`; startup then reconciles state
before touching a finding:

* **Latches onto the real branch** — it creates the local branch *from* `origin/<branch>` when a
  fresh container has only the remote (a plain `git switch -c` would fork from `main` and silently
  abandon the run), and fast-forwards to `origin/<branch>` to adopt progress another session pushed
  (keeping local commits when it's ahead).
* **Clears crash residue** (`RESUME=1` only) — resets a dirty tree left by a half-done finding back
  to HEAD and removes a stale `STOP`. The reset loses no accepted work: a finding's `docs/AUDIT.md`
  entry is deleted only *inside* its fix commit, so an interrupted finding is still listed and
  simply re-processed. `RESUME` is off for a bare `npm run audit:burndown`, so a canary in a dirty
  repo still halts rather than discarding real uncommitted changes.

Finding the PR again is **your** job, not the driver's: `mcp__github__list_pull_requests` filtered
by head branch. There is no cached PR number to go stale and no risk of the driver opening a
duplicate, because it never opens one.

`npm run audit:preflight` (the launcher runs it for you) prints a **resume target** block — the
branch state it will latch onto, and whether origin is reachable — so a fresh session can confirm
it's continuing the real run, not forking a new one, *before* it starts. One self-healing edge: if a
crash lands between a fix's commit and the `docs/AUDIT.md` fold, that finding is re-verified at
HEAD, found already fixed, and dropped as invalid — one extra drop commit, no lost work. **Before
relaunching, commit or stash any real work in progress** — `RESUME=1` treats a dirty tree as crash
residue and resets it.

A container that died also lost every comment record you had not posted.
`backfill-comments.mjs
capture` rebuilds them from the pushed commits, but only for what is still
reconstructable from `run.log` and the role envelopes — both of which died too. In practice: what
you did not post before the container went, you write from the commit diffs or not at all.

## Tuning & lessons

Notes from real runs — set these before a large run rather than discovering them at 3am:

* **Verify is the slowest role and the main halt risk.** It reads a lot of code to confirm a finding
  at HEAD (~150s median on this repo) and occasionally needs more than $1. The old
  `BUDGET_VERIFY=1.00` clipped complex findings (`error_max_budget_usd` → deferral), and a cluster of
  those nearly tripped the three-consecutive-deferral halt. Default is now `3.00`; don't drop it
  below ~$2.50 for a big run. `BUDGET_REVIEW` was raised from `2.00` to `3.00` for the same reason:
  a cap mid-verdict costs the *whole finding*, since the fix rolls back unreviewed. A budget knob
  set too tight doesn't save money — it converts finished work into a deferral and pays for it again
  on the re-run.
* **On a Claude subscription the `audit:cost` dollars are notional** — no API bill; the real ceiling
  is your usage window. A big run self-pauses when the window is exhausted (retries fail → deferrals
  → halt) and resumes cleanly on relaunch. Size a run by wall-clock and usage, not the dollar
  figure.
* **Scoping is correct; the wall-clock is inherent.** verify=Sonnet 5 (cheap confirm + brief),
  impl=Opus 5, review=Opus 5 (adversarial). Most of a finding's elapsed time is three sequential LLM
  roles plus the driver's independent gates, and that shape is the design rather than overhead. What
  *was* overhead — the reviewer re-running the same suite the driver had just run — is gone; see the
  gate-ordering note above.
* **The loop is tuned for Opus 5 specifically** (per Anthropic's `prompting-claude-opus-5` guidance,
  2026-07). Three things follow from that model's documented behaviour, and all three are worth
  re-reading before swapping a role onto a different model:
  * **`--effort` is the wall-clock lever, and it governs tool calls too** — not just thinking depth,
    so a lower level also means fewer tool calls. Defaults: `EFFORT_VERIFY=medium`,
    `EFFORT_IMPL=high`, `EFFORT_REVIEW=medium`. Verify does not go lower because an `INVALID`
    verdict *deletes a finding permanently* — the one role whose mistakes are unrecoverable. Review
    sits at `medium` on the documented finding that Opus 5's review accuracy holds at reduced
    effort, with the deterministic gates as the backstop. Raise both to `high` for a run where
    correctness dominates and you are willing to pay the hours.
  * **Every role is hard-restricted with `--tools`.** `--allowedTools` only pre-approves a tool, it
    does not remove one: without `--tools`, every role could still reach `Agent` and `Workflow` and
    fan out into subagents — and Opus 5 delegates markedly more readily than earlier models. A role
    that starts spawning agents burns its whole `BUDGET_*` before doing any work, and budget caps
    are already this driver's main deferral source. (Verified empirically: with `--tools` set,
    `Agent`/`Workflow`/`WebFetch` are absent from the session's tool list entirely.)
  * **Don't re-add "verify your work" instructions to the role prompts.** Opus 5 self-verifies
    unprompted; explicit re-check instructions compound with that and cost tokens without improving
    results. The load-bearing part is telling a role *which* commands the driver gates on — it
    cannot guess `npm run test:unit` over `npm test` — not instructing it to check twice. The
    separate adversarial reviewer is a different thing and stays: it is a blind writer-verifier
    pair, which is a pattern Opus 5 is documented as good at, and unlike self-verification it
    returns a typed verdict the driver can actually act on.
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
  reliable; anything touching the GitHub API is not. That asymmetry is why the driver was taken out
  of the GitHub business altogether rather than being taught to retry: it used to create the draft
  PR and post comments with `gh`, and every failure mode was the same shape — a night of perfectly
  good commits on origin with no PR behind them and the comments swallowed. A 2026-07-24 run hit
  HTTP 500 on `gh pr create` for over 20 minutes with githubstatus.com green throughout; a
  2026-07-25 cloud run found `gh` structurally unusable (no github.com credential, and an `origin`
  the CLI won't recognise as GitHub). Treat "no PR yet" as an annoyance, never a reason to stop: the
  commits are pushed and are the durable artifact.
* **`docs/AUDIT-DEFERRED.md` is auto-formatted.** `defer()` runs `dprint fmt` on it before the
  commit, so a deferral no longer reddens CI's Quality (format) job — the file's header used to be
  wrapped narrower than dprint's width.
* **Retry E2E to survive transient flakes.** A single flaky E2E failure false-defers a good fix, so
  `E2E_CMD` carries `--retries=1`: a genuine flake clears on retry, a real regression still fails
  both attempts. Give `PUSH_TEST_CMD` the same treatment if you re-enable the local full-suite gate
  (`npm test` runs Playwright without retries).
* **Never let a tooling failure masquerade as a model verdict.** This bit twice in one day, in two
  different roles, and it is the single most expensive class of bug in this driver:
  * `sha` is optional in `SCHEMA_IMPL` (a `success: false` return has no commit to point at), and
    roughly one implementer in seven finished the entire job — committed, amended, wrote a full
    summary — while omitting the field. The driver read that as failure, `git reset --hard`-ed a
    complete tested fix away, and deferred the finding; ~$4 of Opus work in one case.
    `resolveImplSha` now falls back to `HEAD` when it moved past the base.
  * A reviewer that hit its budget cap was recorded as `CHANGES_REQUIRED` — so a fix nothing had
    looked at was rolled back and filed under "failed adversarial review", which is a lie to whoever
    triages `docs/AUDIT-DEFERRED.md` later. It now defers as `reviewer unavailable`, and the log
    reports the real fix-round count instead of a hardcoded "2".

  Two rules fall out. **An optional field in a role schema is a silent work-discard risk** — where
  an observable side effect exists (a commit, a file, a branch), check the side effect, because it
  cannot forget; reserve the envelope for what only the model knows. And **when a role fails to run,
  say so in the deferral reason.** Rolling back unreviewed work is right; calling it rejected is
  not. A deferral reason is read months later by someone deciding whether to re-stage the finding.
* **Scope every `run.log` grep to the current run.** `run.log` accumulates across runs and iteration
  numbers restart at `iter0001` each time, so a bare `grep iter0008` silently matches a different
  finding from hours ago. Anchor on the run's start line:
  `awk '/HH:MM:SS\] starting/{f=1} f' .audit-work/logs/run.log`. Unscoped reads also cost context: a
  `sed`/`grep` range over a multi-run log can dump hundreds of lines of unrelated history into the
  window you are trying to conserve. The per-iteration JSON envelopes collide the same way — see the
  blockquote under **Per-commit PR comments**.

## Closing out a run

* Verified fixes land one commit each on the branch (`Audit: <title>` trailer), pushed as they land,
  each with its own per-commit comment (see above). Invalid findings are dropped with a reasoned
  `chore(audit): drop invalid finding` commit. Un-fixable findings move to `docs/AUDIT-DEFERRED.md`
  (committed) — triage these by hand afterwards: re-stage, file as issues, or drop.
* When the backlog is fully drained, `docs/AUDIT.md` should be deleted per
  `.claude/audit-conventions.md` (a partial run may also leave emptied `## Source:` sections — tidy
  them in a final commit).
* Drain the comment store before marking the PR ready — `next` / post / `done` until empty, and
  `capture` first if any fix landed without a record. If `COMMENT_STORE` was pointed at a committed
  path, delete that file in the same commit that finishes draining it: a leftover
  `docs/AUDIT-PENDING-COMMENTS.jsonl` reads as work still owed.
* Confirm CI is green on the final push before marking the PR ready. It is the only full-suite gate
  in this configuration, so "the run finished" and "the branch is sound" are genuinely different
  claims here.
* Add one row to `docs/AUDIT-LOG.md` per `.claude/audit-conventions.md` §2 (date ·
  `burn-down-audits` · done/deferred/dropped counts + the PR link), then mark the PR ready with
  `mcp__github__update_pull_request` (`draft: false`). **Take the counts from each run's `finished:`
  line** (`N fixed, N dropped, N deferred`) and cross-check them against the commit record —
  `chore(audit): defer` and `drop invalid finding` subjects are one per finding, so they are exact.
  Do **not** count fix commits: a finding whose review demanded changes can land two or three
  commits, so commits-with-an-`Audit:`-trailer over-reports fixes. Ignore `audit:status`'s
  `of <total>` denominator here; it is derived from `completed.log` (which is gitignored,
  container-local, and accumulates across runs) plus a cumulative deferred file, so it drifts by a
  finding or two and is not an auditable figure. `remaining` is the trustworthy number.
* The deliberately-unported alternative: driving this loop with in-session subagents. Only worth it
  to watch and steer a handful of findings interactively — and that path already exists as
  `/fix-audits`.
