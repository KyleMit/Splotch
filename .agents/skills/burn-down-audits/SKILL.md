---
name: burn-down-audits
description: Drive the scripted bulk burndown of docs/AUDIT.md with isolated Codex subprocesses per role and finding (verify → implement → adversarial review → fix). Use when the staged audit backlog is too large to vet and file as individual GitHub issues, or when asked to launch, resume, supervise, pause, report on, or close out an audit burndown from Codex.
---

# Burn down audits with Codex

Drive `scripts/audit-burndown/burndown.mjs` with Codex as every model-backed role. Keep the driver
as the orchestrator: do not replace its one-shot subprocesses with in-session subagents.

Set `AGENT_RUNNER=codex` on every preflight, canary, and relaunch. The runner defaults are:

| Role               | Model           | Effort   |
| ------------------ | --------------- | -------- |
| Verify             | `gpt-5.6-terra` | `medium` |
| Implement P1–P3    | `gpt-5.6-sol`   | `high`   |
| Implement P4–P5    | `gpt-5.6-terra` | `high`   |
| Adversarial review | `gpt-5.6-sol`   | `medium` |

This is the GPT‑5.6 mapping of the Claude run: Terra owns the Sonnet-tier work; Sol owns the
Opus-tier work. Override with `MODEL_*` or `EFFORT_*` only when the run has a measured reason.

## Invariants

* One fresh `codex exec` thread per verifier, implementer, and reviewer. A fix round resumes the
  exact implementer thread with `codex exec resume <thread-id>`.
* The reviewer is blind to the implementer's intent and runs read-only. The verifier and implementer
  run in `workspace-write`; all calls use schema-constrained JSONL, no interactive approvals, and
  `multi_agent=false`.
* State is `docs/AUDIT.md` plus git. A finding's entry is deleted in the same commit as its approved
  fix. Everything under `.audit-work/` is disposable run state.
* Never read or edit `docs/AUDIT.md` directly at burndown scale. Use
  `scripts/audit-burndown/pop.mjs` for count/peek/delete operations; the driver owns deletion.
* The driver never talks to GitHub. It pushes commits and appends
  `.audit-work/pending-comments.jsonl`; the supervising Codex agent opens/updates the PR, posts
  comments through the GitHub connector, and watches CI.
* Never edit a tracked file while the driver is running. Its rollback path resets tracked changes to
  the finding base and removes untracked files introduced by that implementation. Pause first.

## Commands

Always carry the runner and branch:

```bash
AGENT_RUNNER=codex BRANCH=<branch> npm run audit:preflight
AGENT_RUNNER=codex BRANCH=<branch> npm run audit:burndown
AGENT_RUNNER=codex BRANCH=<branch> npm run audit:burndown:overnight -- 600
```

Other commands:

| Command                             | Purpose                                                       |
| ----------------------------------- | ------------------------------------------------------------- |
| `npm run audit:status`              | Campaign-wide counts, run state, current call, comments       |
| `npm run audit:cost`                | All retained Codex logs by role and projected remaining usage |
| `npm run audit:watch`               | Follow `run.log`; add `-- --dash` for a refreshing summary    |
| `pop.mjs --count`                   | Count remaining findings without loading the backlog          |
| `pop.mjs --peek N`                  | Print finding N without changing the backlog                  |
| `backfill-comments.mjs next`        | Print next pending fix comment                                |
| `backfill-comments.mjs done <sha>`  | Mark it posted, only after the GitHub call succeeds           |
| `backfill-comments.mjs capture ...` | Rebuild missing records from logs and commits                 |

`pop.mjs` also supports no argument to print the first finding and `--delete` to print and remove
it. The driver owns deletion. It has no `--help` or source-pruning mode; do not probe unsupported
flags or manually compensate by editing the backlog.

The important environment knobs are:

```bash
AGENT_RUNNER=codex
MAX_ISSUES=5
MAX_HANDLED=5
PUSH_EVERY=1
BRANCH=audit/burndown
CHECK_CMD='npm run check'
TEST_CMD='npm run test:unit'
E2E_CMD='npm run test:e2e -- --retries=1'
LINT_CMD='npx eslint'
PUSH_TEST_CMD=''
COMMENT_STORE=.audit-work/pending-comments.jsonl
MAX_DEFERRALS=3
RETRIES=3
MODEL_VERIFY=gpt-5.6-terra
MODEL_IMPL=gpt-5.6-sol
MODEL_IMPL_MINOR=gpt-5.6-terra
MODEL_REVIEW=gpt-5.6-sol
EFFORT_VERIFY=medium
EFFORT_IMPL=high
EFFORT_REVIEW=medium
```

`BUDGET_*` remains accepted for Claude compatibility but has no Codex CLI equivalent. Subscription
usage and wall-clock are the Codex run's practical limits.

## Deterministic gates

At the top of every review round the driver runs:

1. `CHECK_CMD`
2. `TEST_CMD`
3. The verifier-selected Playwright specs, if any
4. `LINT_CMD` on changed code files

The reviewer sees only a finding range that passed. It must not rerun tests; it reads the complete
`<finding-base>..<current-head>` diff for behavior smuggled into a refactor, incomplete renames,
missing runtime guards, and uncovered behavior. Reviewing only the latest fix-round commit can hide
the source change in its parent.

When a gate is red, the driver includes a bounded, ANSI-free tail of the command output in the
resumed implementer's feedback. Preserve that output: a nested Codex role cannot rerun a
listener-based E2E command, so a generic "Playwright is red" message makes it guess at a failure the
driver already observed.

The nested Codex workspace-write sandbox cannot bind Playwright's localhost listener or write Git
metadata. The implementer therefore runs type-check, unit, and scoped-lint checks, leaves its
changes uncommitted, and returns `success=true` with an empty `sha`. The outer driver rejects any
protected audit-state edit, stages the changed paths, creates the commit, then runs E2E before
review. A localhost `EPERM` or `.git/index.lock` denial inside a role is an environment boundary,
not an implementation verdict.

The default gates do not cover bespoke repository ratchets. For this repository use:

```bash
CHECK_CMD='npm run format:check && npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check'
TEST_CMD='npm run test:unit && npm run test:scripts'
```

Do not put `npm run ruler:check` in `CHECK_CMD`; it writes by reapplying Ruler. A finding that edits
`.ruler/**` must run `npm run ruler:apply` and commit the generated output itself.

Leave `PUSH_TEST_CMD` empty while actively supervising a draft PR: CI is the full-suite backstop. Do
not launch a Codex burndown nobody will supervise; a local full-suite gate cannot replace CI failure
handling, comment posting, or exact-head checkpoints. Keep `PUSH_EVERY=1`: every accepted finding
must reach origin before an ephemeral environment can be reclaimed.

## Before a run

1. Confirm no driver is active. Read process matches rather than trusting a count:

   ```bash
   pgrep -fl 'scripts/audit-burndown/(overnight|burndown)\.mjs'
   ```

   Run the lookup outside the workspace sandbox. `pgrep -af` is GNU-shaped and can print only a PID
   on macOS; use `pgrep -fl`, then confirm a match with `ps -p <pid> -o pid=,ppid=,etime=,command=`
   when needed.

2. Choose a fresh continuation branch from current `main`; do not reuse a historical burndown
   branch. Put the exact command, branch, gate overrides, `PR: pending`, initial backlog count,
   current `run.log` line count, state, and closeout tasks in `docs/handoff/audit-burndown-run.md`.
   The log baseline scopes closeout reconciliation to this run when `.audit-work/` contains
   historical segments. Commit and push this initial checkpoint before preflight.

3. Run preflight with the exact overrides:

   ```bash
   AGENT_RUNNER=codex \
   BRANCH='<branch>' \
   CHECK_CMD='npm run format:check && npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check' \
   TEST_CMD='npm run test:unit && npm run test:scripts' \
   npm run audit:preflight
   ```

   Require every check green. Read back `runner: codex`, `branch: ...`, `codex logged in`, origin
   reachable, and the parsed backlog count.

4. Open a draft PR before the canary. The initial checkpoint gives GitHub the diff required to open
   one. Replace `PR: pending` in the handoff with its number, commit, and push that second
   checkpoint before launching the canary.

5. Run a five-fix canary in the foreground with the same overrides and `MAX_ISSUES=5`. Deferrals and
   drops do not increment the limit, so it can process more than five findings.

6. Inspect every canary change without backlog churn:

   ```bash
   git log main..HEAD -p -- . ':(exclude)docs/AUDIT.md'
   ```

   Look especially for non-equivalent call sites unified by a dedup, coincidentally equal constants
   coupled as though intentional, and runtime guards erased while tests were cast around a narrowed
   type.

7. Check that each consumed finding deleted exactly one entry. A role may make intermediate fix
   commits with zero deletions, so reconcile per finding:

   ```bash
   for sha in $(git rev-list --reverse main..HEAD); do
     echo "$(git log -1 --format='%h %s' $sha | cut -c1-70) removed=$(git show $sha -- docs/AUDIT.md | grep -c '^-### ')"
   done
   ```

   Stop if any commit removed two entries.

8. Confirm resume actually worked when a fix round occurred. The `thread_id` in that iteration's
   `.impl.json` and `.fix1.json` `thread.started` events must be identical; reviewer thread ids must
   differ. If no canary finding needed a fix round, do not invent one—continue only after the driver
   unit tests and the committed resume probe remain green.

9. Check CI on the canary's final push and require green before a full run. Then run
   `npm run audit:cost` and sanity-check both wall-clock and tokens. Its scope is every retained
   role envelope under `.audit-work/logs`, not necessarily this continuation alone.

10. Launch the full run with the exact durable command:

    ```bash
    AGENT_RUNNER=codex \
    BRANCH='<branch>' \
    MAX_HANDLED=5 \
    CHECK_CMD='npm run format:check && npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check' \
    TEST_CMD='npm run test:unit && npm run test:scripts' \
    npm run audit:burndown:overnight -- 600
    ```

    `MAX_HANDLED` counts every terminal outcome—fixed, dropped, or deferred—rather than only
    accepted fixes. The detached driver exits cleanly after five outcomes so it cannot outrun the
    required CI and comment checkpoint while the supervising conversation is between turns. Record
    the segment start and 20-minute deadline when launching; the handled ceiling does not replace
    the time ceiling.

## Supervision

Monitor events, not by repeatedly loading every role envelope:

```bash
tail -f -n 0 .audit-work/logs/run.log | grep -E --line-buffered \
  "HALT|red at batch|red on the final|push failed|no impl session|DEFERRED|finished:|iter"
```

Treat CI supervision as independent from comment posting:

* After each pushed `DONE`, or at least every two minutes, inspect the newest completed Quality job.
  Track the last Quality-green SHA and the last fully-green SHA.
* Prefer a compact `gh pr checks <pr> --json name,state,link,bucket,event,workflow` poll every 30–60
  seconds. Reserve a streaming workflow watch or full job log for a near-terminal run or a failure
  diagnosis; repeatedly printing the unchanged job matrix consumes supervision context without
  adding evidence.
* Treat `cancelled` as inconclusive, not as a regression. A newer push can cancel a healthy run.
  Treat `failure` as red even when a newer run is queued or cancelled.
* On any failed job, create `.audit-work/STOP` immediately, let the in-flight finding finish, and
  diagnose the first failing SHA before resuming. At most one extra finding should land on the red
  base.
* `MAX_HANDLED=5` is the mechanical ceiling for each detached full-run segment. When it exits,
  require one workflow on the exact branch HEAD to finish fully green and drain every pending
  comment before relaunching. Never remove the boundary from a supervised run.
* Twenty minutes is still a manual ceiling because the driver cannot stop a role mid-finding. At the
  recorded deadline create `STOP` immediately, let the current finding finish, then apply the same
  exact-head checkpoint. Do not reset the deadline because a role or fix round is still active.
* Do not send a final response while the driver or a nested Codex role is active. A running burndown
  is ongoing work: give user-requested status in commentary, continue supervision, and yield only
  after the bounded segment has stopped. An explicit request to leave the process unattended is a
  scope change; explain that it gives up CI supervision rather than silently doing so.

Use `npm run audit:status` for counters and current work, then confirm detached liveness with a
process lookup outside the workspace sandbox. A sandboxed `pgrep` can report `idle` for the
unsandboxed overnight child; do not call a run idle or stopped from that label alone. A mid-priority
finding is normally under 15 minutes; 15–25 minutes merits one later recheck; over 25 minutes merits
diagnosis. Priority and fix rounds skew this: a P1 with two rounds can be healthy at 25 minutes.

```bash
pgrep -fl 'scripts/audit-burndown/(overnight|burndown)\.mjs'
```

For a liveness recheck, compare role-envelope counts—not HEAD or `run.log`, which the supervisor
also changes:

```bash
before="$(find .audit-work/logs -name 'iter*.json' | wc -l)"
# recheck later
after="$(find .audit-work/logs -name 'iter*.json' | wc -l)"
```

If the current nested `codex exec` is genuinely stuck, terminate that child only; the driver's retry
loop handles it. If the driver is alive with no nested Codex child and no new envelope for tens of
minutes, it is orphaned: stop the driver, restore the worktree to `origin/<branch>`, and resume from
the checkpoint. Do not kill the orchestrator for a merely slow finding.

Three consecutive deferrals halt the run. Before calling them model verdicts, inspect the matching
`.err` files for one shared mechanical error such as login loss, usage exhaustion, or sandbox
startup failure.

## Control messages

* **status** — run `npm run audit:status` plus the detached process check; do not touch `STOP`.
  Report `initial backlog - current remaining` as handled by this continuation and use only scoped
  post-baseline terminal events for its fixed/dropped/deferred split. Label the command's
  completed/deferred counters as campaign-wide; never present them as this run's outcomes. Keep
  supervising until the current bounded segment stops.
* **pause** — `touch .audit-work/STOP`; let the in-flight finding finish, wait for the driver to
  exit, push, drain comments, update the checkpoint, and leave `STOP` present.
* **resume / continue** — verify no driver exists, remove `STOP`, relaunch the exact checkpoint
  command, and supervise through its next bounded stop; do not relaunch and immediately hand back.
* **wrap up** — set `STOP`, let the finding land, complete closeout, and mark the PR ready even if
  findings remain.

Pause on your own initiative only after a demonstrated recurring mechanism is actively losing work
and the cause can be fixed. One cleanly rolled-back deferral is not enough.

## Per-commit PR comments

Drain comments in an at-least-once loop:

1. `node scripts/audit-burndown/backfill-comments.mjs next`
2. Post the body on the draft PR with the GitHub connector and append a short OpenAI Codex
   attribution footer: `Posted by OpenAI Codex while supervising the audit burndown.`
3. `node scripts/audit-burndown/backfill-comments.mjs done <sha>`
4. Repeat until empty.

Run `capture main..HEAD` before final drain and once after as a completeness check. Never wrap a
commit SHA in backticks in GitHub text; bare SHAs auto-link. Escape any `#`-number that is not an
intentional issue/PR reference.

Drain at every handled-count/CI checkpoint and do not relaunch with pending records. If an older run
left a large queue, post through the connector in batches of at most ten. When orchestration is
available, perform each batch in one execution cell to avoid round-tripping every body through the
supervising conversation. Preserve `next` → confirmed successful post → `done` for every record, and
abort the batch immediately on a connector error.

Iteration filenames restart at `iter0001` and drops can reuse a number within one run. Correlate by
the timestamped `run.log` line and file mtime, not by the number alone.

## Resume after a crash

The unattended launcher sets `RESUME=1`. It adopts `origin/<branch>`, fast-forwards when safe,
resets tracked crash residue and removes untracked crash files from a half-finished finding, clears
stale `STOP`, and starts with the same `docs/AUDIT.md` entry because deletion happens only inside an
approved commit.

Codex implementation and repair rounds are clean, driver-owned commits before gates and review. When
the exact `Audit:` finding is still present, resume rewinds that contiguous local-only commit chain
to the finding base before re-verifying it. It refuses to rewrite the chain if it has already been
published.

Before relaunching, commit or stash real work: `RESUME=1` treats a dirty tree as crash residue. The
exact launch command is in `.audit-work/launch-command` while that local state survives and in the
committed handoff across machines.

## Closeout

1. Stop cleanly and confirm no driver or nested Codex call remains.
2. Confirm `HEAD` equals `origin/<branch>`.
3. Run comment `capture`, drain every pending record, then run `capture` again.
4. Reconcile only the `finished:` lines after the handoff's `run.log` baseline. Prove
   `initial backlog - remaining = fixed + dropped + deferred`; a halt can omit its final summary, so
   reconcile any gap from terminal `DONE`/`INVALID`/`DEFERRED` events in that same scoped log. Do
   not use historical lines, the cumulative deferred list, or commit count: one finding can have
   several fix commits.
5. Verify the remaining count with `pop.mjs --count`. The driver owns individual deletion, and the
   helper has no safe source-pruning mode, so do not directly tidy empty `## Source:` sections while
   findings remain. Delete `docs/AUDIT.md` only when the count is zero.
6. Add the `burn-down-audits` row to `docs/AUDIT-LOG.md` with fixed/deferred/dropped counts and the
   PR link.
7. Run `npm run format:check`, the relevant quality checks, and the full test suite. Listener-based
   Playwright needs the outer command's local-server permission; a sandbox `listen EPERM` is an
   environment boundary, so rerun that unchanged gate with the required permission rather than
   calling it a regression.
8. Delete the consumed `docs/handoff/audit-burndown-run.md`.
9. Inspect the complete closeout diff, commit the audit-log/backlog/handoff changes together, and
   push. Confirm local `HEAD` now equals `origin/<branch>`.
10. Replace the canary-only PR body with final counts, themes, verification, deferred-work location,
    and visual-evidence applicability.
11. Confirm exact-head CI green on the pushed closeout commit, then mark the PR ready.

A deferral keeps its post-mortem in `docs/AUDIT-DEFERRED.md` and, when available, its rejected draft
under `docs/audit-deferred/`. Treat that patch as a starting point: deterministic gates passed, but
adversarial review did not.
