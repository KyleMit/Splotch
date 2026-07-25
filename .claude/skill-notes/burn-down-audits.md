# `burn-down-audits` — design notes

Design history and open questions for the bulk audit burndown: the
[`burn-down-audits`](../../.ruler/skills/burn-down-audits/SKILL.md) skill, the driver under
`scripts/audit-burndown/`, the role prompts in `scripts/audit-burndown/prompts/`, and the two
compaction hooks in `.claude/hooks/`.

Read [`README.md`](./README.md) first if you are wondering why this file is here rather than in
`docs/adrs/`. **The skill does not link here, deliberately** — do not add a pointer to it.

Current as of **2026-07-25**. The skill is young: it was born on 2026-07-24 and nearly everything
below was earned by two live runs on the following two days.

## The invariants

Four things have been true since the first commit and everything else is negotiable. If a change
would break one of these, it is a redesign rather than a tweak.

1. **One-shot `claude -p` subprocesses, not subagents.** The orchestrator is a Node script, so the
   "main context" is process state. Nothing accumulates in a conversation, which is what lets a run
   go 600 findings deep.
2. **State is `docs/AUDIT.md` plus git.** A finding's entry is deleted in the *same commit* as its
   fix, so the file is always an exact record of what remains and a crash leaves nothing to
   reconcile. Everything in `.audit-work/` is disposable.
3. **Three roles, and the reviewer is blind.** verify → implement → adversarial review → fix. The
   reviewer is deliberately not told how the author intended to fix the problem, and it is a
   separate process, not the implementer checking itself.
4. **The driver's gates are deterministic.** Type-check, unit tests, lint, named E2E specs. These
   are exit codes, not model judgement, and they are what makes an unattended overnight run safe.

## Recurring principles

Five lessons that have each been re-learned from more than one direction. If you are about to change
something here, check it against these first — the detail behind each is in the history below.

1. **A confident statement that was never checked is worse than an absent one.** Applies to anything
   a later session reads and cannot verify: the compaction snapshot, `run.log` lines, deferral
   reasons, PR comments. Four separate defects came from asserting things that had not been
   measured.
2. **Tooling failure must never be recorded as a model verdict.** A capped reviewer is not a
   rejection; a missing optional field is not a failed implementation. Attributing them that way
   lies to whoever triages the deferral months later.
3. **Duplicated knob lists drift silently and late.** Three recurrences after the original fix, one
   of them *after* the lists were consolidated. The failure is invisible at launch because preflight
   inherits the full environment — only the driver inside tmux runs without the knob.
4. **Trust the driver's own environment, not the observer's.** `ps`/argv could not recover the
   launch command, and `${BRANCH:-…}` read the supervising session's environment rather than the
   run's. Both were replaced by having the driver record what it knows about itself.
5. **A budget set too tight doesn't save money.** It converts finished work into a deferral and pays
   for it again on the re-run. `BUDGET_VERIFY` and `BUDGET_REVIEW` were both raised for this reason.

## Design history

Grouped by theme rather than strictly by date, because the same lesson kept arriving from different
directions. Each entry names the failure that earned the rule — that is the part which is expensive
to reconstruct.

### Origin — the port (PR #533, 1df27d7e)

Ported from an external "audit-burndown kit" written in bash. The port was not a literal
translation:

* Bash orchestration became Node `.mjs` under `scripts/audit-burndown/`, because ADR-0017 rejected
  bash for `scripts/`. Registered as `audit:*` npm scripts with `scripts-info` entries per ADR-0019.
* The runbook became a skill in `.ruler/skills/`, registered in `skills-guide`, `audit-conventions`,
  the knowledge map, and the `scripts/` orientation.
* The verifier prompt reads the pin SHA from each finding instead of the kit's hardcoded `f934d43`.
* `pop.mjs` keeps the excision seam dprint-clean, because CI runs `dprint check` on `AUDIT.md`.
* `jq` was dropped entirely — Node parses the `claude -p` envelopes.
* The kit's deny rules for destructive git ops were merged into `.claude/settings.json`, and
  `.audit-work/` was gitignored.

**Deliberately not ported: the kit's in-session subagent variant.** `/fix-audits` already covers the
interactive path, and having two ways to do the same thing at different scales was the thing worth
avoiding. This is still the right call — the two skills have genuinely different shapes, not just
different sizes.

**`npm run test:scripts` exists because of this PR's review.** The reviewer pointed out that
`getEntry`/`countEntries`/`deleteFirstEntry` were documented as the only things allowed to touch the
19k-line `AUDIT.md`, and that the header comment called hundreds of sequential edits "a corruption
risk" — yet the entry-boundary parsing and seam-collapse logic had no committed test, only manual
exercise against a scratch copy. The response created `scripts/tests/audit-burndown-lib.test.mjs` +
`scripts/vitest.config.mjs`, wired as `npm run test:scripts` into `npm test` and its own CI step.
The whole repo-script test suite traces back to that one comment.

### The gate ladder — why type-checking was never enough

The single most-revised area. It grew one rung at a time, each one added after something got
through.

* **Type-check only** (original). A fix that type-checks but breaks a unit test would commit green,
  unattended, 600 times.
* **Two-tier: `TEST_CMD` + `PUSH_TEST_CMD`** (9b975335), from a PR #533 review calling this *"the
  main silent-defect path for a 600-finding overnight run, and the cheapest gap to close"*. The
  reviewer explicitly ruled out simply running `npm test` per finding — it drags in Playwright — and
  sketched the split that shipped. The response went one step further than asked: the driver re-runs
  the fast unit tests **itself** after the review approves, **rather than trusting the role prompts
  to have done it**. Once per batch before every push it runs the full `npm test` (including the
  slow E2E and asset-gen suites), holding the push on red so nothing red leaves the machine.
* **Conditional per-finding E2E** (9fb02e59). Full-suite E2E on every finding is unaffordable; no
  E2E at all means a behavioural regression is caught in CI hours later, unattributed. So the
  verifier classifies each finding's runtime surface and emits `e2e_specs`, and the driver gates
  that finding on exactly those specs. A pure refactor names none and pays nothing. **The spec
  strings are LLM-authored and reach a shell**, so they are sanitized to spec-path shape
  (`/^[\w./-]+$/`) — anything with whitespace or shell metacharacters is dropped.
* **Lint gate** (aed45eb7). A fix can type-check and still ship an `any` or a raw `Map` in a
  `.svelte.ts` and redden CI. `eslint` now runs on each fix's changed files.
* **E2E retry** (401820f5). One flaky E2E failure red-lit a whole batch and held the push; the
  re-run was fully green. `--retries=1` lets a genuine flake clear while a real regression still
  fails twice.
* **Gates moved *before* the review** (1f825972). Previously the reviewer ran, then the gates. That
  meant the reviewer re-ran the same suite the driver was about to run, and a red gate discarded a
  finished, reviewed finding. Now the gates run at the top of every round, on the very commit the
  reviewer then reads — so a red gate becomes a recoverable fix round, and the reviewer lost `npm`
  and `npx` from its tool scope entirely. This is why `reviewer.md` can state "the commit you are
  reading is already green."

Related, from the same review: **the reviewer is given the original finding, not only the verifier's
acceptance criteria.** Until then the reviewer *"graded the diff against the same frame that
produced it"* — the verifier is the sole authority on what "done" means and the one role with no
independent check, so a mis-scoped finding could pass every stage while being wrong. The review
called this *"the hardest failure to catch after the fact"*. The finding was already on disk at
`.audit-work/current-issue.md`, so including it cost nothing: most of the benefit of a second
verifier without paying for one. A diff that ticks every acceptance box while missing what the
finding asked for is `CHANGES_REQUIRED`.

### Tooling failure must never be recorded as a model verdict

A recurring class, worth naming because it keeps reappearing in new places. When something breaks
for mechanical reasons, the driver used to record it as though a model had judged the work — which
lies to whoever triages the deferral months later.

* **A capped reviewer was recorded as `CHANGES_REQUIRED`** (85a1be1c), so a fix nothing had looked
  at rolled back and filed under "failed adversarial review". Now defers as `reviewer unavailable`.
  `BUDGET_REVIEW` went `2.00` → `3.00` at the same time.
* **A committed fix was discarded over a missing SHA** (e98cc383). `sha` is optional in
  `SCHEMA_IMPL` because a `success=false` return has no commit to point at — but two findings in one
  run finished the entire job while omitting the field, and a complete, test-passing fix was reset
  away. One had cost roughly $4 of Opus work. `resolveImplSha` now trusts git over the envelope:
  HEAD past the base means it committed, whatever it remembered to report.
* **Fix rounds never got that same fallback** (1f825972), and a failed fix round deferred as "failed
  adversarial review". `deferralReason()` in `lib.mjs` now names the role that actually failed,
  locked by unit tests.
* **A dropped-invalid finding incremented `done`** (54caf9a2), so `finished: N done` conflated fixes
  with drops and the closeout `AUDIT-LOG` row was wrong *in the flattering direction*. Drops now
  count separately.

The budget knobs belong to this theme too. `BUDGET_VERIFY` went `1.00` → `3.00` (aed45eb7) after
tight caps clipped complex findings and clustered deferrals toward the three-consecutive-deferral
halt. The general rule, now in the skill: **a budget set too tight doesn't save money — it converts
finished work into a deferral and pays for it again on the re-run.**

### The PR is the fragile part; the commits are not

* **Per-commit PR comments** replaced a batch dump (aed45eb7). Each pushed fix gets its own comment
  carrying the issue, the implementer's summary, and any adversarial catch. Rendering lives in
  `comment.mjs` so it is unit-testable and shared.
* **Dangling code fences** in a truncated finding snippet made the rest of a comment render as one
  code block (fa51bd0b). Truncation now cuts at a line boundary and closes the fence.
* **SHAs are bare, never backticked** (6646f9db). GitHub's native linker only turns a plain-text SHA
  into a link; inside a code span it is dead monospace text — the wrong outcome for a comment whose
  whole job is pointing at a commit. This got promoted to a repo-wide rule in the root instructions,
  alongside the mirror-image rule for escaping `#`-numbers.
* **A failed `gh pr create` was swallowed** (a40f534f), so an unattended run would push all night
  with no PR and no hint. Now logged, with unpostable comments spilled to
  `.audit-work/pending-comments.jsonl`. Read the **last** line of `gh`'s output when diagnosing — it
  emits warnings ahead of the real error.
* **A cached `pr-number` outlived its PR** (a40f534f). The driver prefers that file over
  rediscovery, so a number from a run whose PR had since merged would post this run's comments onto
  a landed PR. It now self-heals, but only when the lookup actually succeeded, so a network blip
  cannot throw away a good number and open a duplicate.
* **`backfill-comments.mjs`** (732c6b60) reconstructs lost comments from `run.log` + the role
  envelopes + the `AUDIT.md` deletion inside each fix commit. One trap it had to solve: **iteration
  log names restart at `iter0001` every run**, so a shorter run leaves the previous run's
  `iter0002.fix1.json` beside this run's `iter0002.impl.json` — the first capture attributed a fix
  from the previous run to the wrong commit. Capture now dates each iteration by its own
  `verify.json` mtime.
* **The "Fix" section described a superseded commit** (6ec397a8). `fixSummary` was read once from
  the first implementer call, but `impl` is reassigned on every fix round and the comment is
  published against the final commit. Now accumulated per round and rendered by `renderFix()`.

### Resumability

Made fully resumable in 8845f470: a run is reconstructable from git + the draft PR + `docs/AUDIT.md`
alone, so a dead session — or a fresh clone on another machine with no `.audit-work/` — picks up
where it stopped.

The sharp edge that forced it: **a plain `git switch -c <branch>` on a fresh clone forked from
`main` and silently abandoned the entire run**, because the clone had `origin/<branch>` but no local
branch. The driver now creates the local branch *from* the remote, and fast-forwards to adopt
progress another machine pushed without clobbering local commits.

### Env knobs vanishing under tmux — the same bug three times

`tmux new-session` does not reliably inherit the caller's environment, so `overnight.mjs` bakes the
run's knobs into the job command. The list of which knobs those are has now been wrong **three
times**, and each time the failure was silent and late:

1. **All of them** (70cabfac) — the original fix, adding the forwarding at all.
2. **`MODEL_IMPL_MINOR`** (a40f534f) — added to the driver in 6646f9db without a forwarding entry.
3. **`EFFORT_*`** (d755a0b6) — same, which is what finally moved the list into `lib.mjs` as
   `LAUNCH_KNOBS`, shared by both consumers.
4. **`AUDIT_FILE`** (6e735b87) — missed even after the consolidation, because it is read via
   `auditFile()` in `lib.mjs` rather than declared beside the other knobs.

Why it keeps failing silently: `preflight.mjs` is spawned directly and **inherits the full
environment**, so it passes. Only the driver inside tmux runs without the knob. `AUDIT_FILE` is the
worst case — the run burns down the wrong file and commits entry deletions to it, unattended.

**If you add a knob, add it to `LAUNCH_KNOBS` in the same commit.** There is a unit test for
`launchCommand`; extend it.

### Surviving the context window

An unattended run is 13–16 hours and outlives any supervising context, even Opus 5's 1M-token
window. The design response is that the driver needs *none* of the conversation, so the supervising
agent must hold no orchestration state.

* **The "Surviving the context window" section** (70cabfac) — write the relaunch command, PR number,
  and closeout tasks to a durable file immediately; compaction is then lossless.
* **`PreCompact` snapshot hook** (b1a9a6b7) — writes `.audit-work/compact-snapshot.md` at the moment
  those facts are about to get lossy. Never blocks compaction (every path exits 0, because a hook
  bug that wedges an unattended session is worse than the problem). Writes only inside gitignored
  `.audit-work/`, because the driver's rollback runs `git reset --hard` and would eat a tracked
  file. Also records that **`ps` is authoritative for live monitors, not `TaskList`** — `TaskList`
  was observed empty while a monitor was still alive, and the duplicate that mistake armed
  double-reported for an hour.
* **The launch command cannot be scraped from `ps`** (d755a0b6). `overnight.mjs` runs
  `env VAR=… node …`, and `env` **execs** node, so the assignments live in the environment and never
  enter argv. macOS only appeared to work because the `caffeinate` parent incidentally retains the
  string in its own argv — and Linux drops caffeinate. The driver now records its own environment.
* **`SessionStart` companion hook** (2f508555). `PreCompact` has no `additionalContext` support, so
  its stdout reaches the transcript and never the model — the one line engineered to tell a
  memoryless session that the snapshot exists was invisible to precisely that session.
  `SessionStart` with the `compact` matcher does inject stdout, and fires on automatic and manual
  compaction alike.
* **The snapshot is point-in-time, not live** (93d66a73, then a9550627). "Cannot be stale"
  overclaimed in the harmful direction: it is rewritten when *compaction* fires, not when run state
  changes. The driver now deletes it on clean finish, and the read hook requires either a live
  driver or a file under a day old.

The recurring principle across all of these, and worth keeping: **for a file whose whole purpose is
to be believed by a session that cannot verify it, a confident statement that was never checked is
worse than an absent one.** Four separate accuracy defects (9577548e) came from asserting things the
hook had not measured.

### Tuned for Opus 5

* **Explicit model pin** (ea4b3731). Impl and review are pinned to `claude-opus-5`, not the `opus`
  alias — the alias still resolved to `claude-opus-4-8` right after Opus 5 shipped, verified with an
  `--output-format json` probe. `sonnet` already resolved to Sonnet 5, so verify stays on the alias.
* **Impl-model tiering** (6646f9db). P4/P5 findings (dead code, renames, dedup) route to
  `MODEL_IMPL_MINOR` (`sonnet`); P1–P3 stay on Opus. An **untagged** title returns `null` from
  `findingPriority()` and keeps the stronger model rather than guessing a priority the finding never
  claimed. The Opus review still gates every fix.
* **Hard tool restriction** (1f825972). `--allowedTools` only pre-approves a tool; it does not
  remove one. Without `--tools`, every role could reach `Agent` and `Workflow` and fan out into
  subagents — and Opus 5 delegates markedly more readily. A role that starts spawning agents burns
  its whole `BUDGET_*` before doing any work.
* **`--effort` knobs** (1f825972). Effort governs tool calls as well as thinking depth, and
  wall-clock is what actually bounds a 600-finding run. Verify stays at `medium` because an
  `INVALID` verdict *deletes a finding permanently* — the one role whose mistakes are unrecoverable.
* **Scope and length gaps closed** (6096ff99). The implementer prompt was armored against widening
  the brief and silent about narrowing it, which is backwards here: an approved partial fix deletes
  the finding, so narrowing erases work irrecoverably while a deferral does not. The
  supervising-agent section gained a scope and delegation constraint. The reviewer gained a
  finding-length calibration. And `EFFORT_IMPL` must stay identical across `--resume`, because
  effort shapes the rendered prompt and a mismatch discards the cached prefix — which in that
  session is the entire first implementation pass.

**What the Opus 5 guidance explicitly did *not* change:** the three-role architecture. The guidance
about removing verification instructions targets a model re-checking its own work; the reviewer is a
blind, separate-process adversary returning a typed verdict the driver acts on, which the same
guidance endorses as a writer-verifier pattern. The role prompts contain no "verify your work"
instructions to remove — audited, zero hits. **Do not add them.**

### The skill doc self-heals from runs

A pattern worth continuing: after every real run, the retrospective goes back into `SKILL.md` rather
than into someone's memory (afa5d308, 54caf9a2, a40f534f, 85a1be1c). Rules earned this way include
never editing a tracked file mid-run (the rollback hard-resets the tree), when to pause on your own
initiative versus when not to, monitor hygiene in both directions, scoping every `run.log` read to
the current run, and taking closeout counts from `finished:` rather than from commit counts.

54caf9a2 also **removed** something: the canary checklist's "force a rejection" step, which no run
ever actually performed, replaced by reading a rejection the run produced on its own.

## Rejected, and why

Proposals that were considered on their merits and turned down. Each is here so it does not get
re-proposed as though it were new.

* **Multi-reviewer majority vote.** Raised in PR #533 as the higher-ceiling version of the "reviewer
  should see the original finding" fix: fan the review step out to several perspective-diverse
  reviewers and take a majority. Declined because *"it multiplies review cost, so I'd start with the
  near-free change above"* — giving the single reviewer the original finding got most of the benefit
  for no extra subprocess. Still unimplemented, and still the obvious escalation if review quality
  ever becomes the binding constraint rather than wall-clock.
* **Reading `/proc/$pid/environ` to recover the launch command.** Offered as the Linux fallback when
  `ps` scraping was found to recover nothing. Declined in favour of the source-level fix — the
  driver knows its own environment, so it writes `.audit-work/launch-command` itself. Platform-free,
  and it also gives the "no driver running" branch something concrete to say.
* **`.trigger` as the PreCompact payload field.** Suggested as the correction for the header always
  rendering `unknown`. The diagnosis was right and **the suggested field was also wrong** — the
  documented schema is `session_id`/`transcript_path`/`cwd`/`hook_event_name`/**`source`**, so
  `.trigger` would have kept rendering `unknown` under a new name. Went with `.source`.
* **A `gatesEverGreen` flag.** Offered as the stronger alternative to rewording "gates never went
  green". Declined: the line's job is to explain *this* rollback, and the final round is the one
  that caused it. Reworded to `gates red at the final round` instead of tracking new state.
* **Genericising the durable-checkpoint pointer.** The snapshot hook names an
  `audit-burndown-relaunch-command` memory, and a review found zero occurrences of that name in the
  repo. The grep was sound but the conclusion did not follow — **Claude Code memories live outside
  the repo**, under `~/.claude/projects/<slug>/memory/`. The real defect was narrower: it was
  missing from `MEMORY.md`, which is the only file loaded into context at session start, so the
  pointer resolved to a real file a fresh session would never be told about. Index line added; the
  named pointer kept rather than genericised, since it now resolves both ways.
* **Re-engineering the `PreCompact` echo into a working nudge.** It cannot be one — that hook group
  has no `additionalContext` support, so its stdout reaches the transcript and never the model. It
  was demoted to a one-line confirmation *with a comment recording why*, specifically so nobody
  rebuilds it later. The nudge lives in the `SessionStart` companion, registered as a **second**
  `SessionStart` block so it does not fire on ordinary session starts.
* **Ranking the snapshot and `audit:status` on one freshness axis.** The first version of the trust
  ordering did exactly that, and put the snapshot on top. Replaced rather than softened: the two
  answer *different questions* — `audit:status` is authoritative for what is true now, the snapshot
  is the only record of how the run was launched — and the doc now says so instead of implying one
  supersedes the other.

Two smaller corrections worth keeping, because both are cases where a review's *mechanism* was right
but its *consequence* did not reproduce:

* The caffeinate/pgrep finding correctly showed that both processes match an unanchored pattern, but
  the predicted "`head -1` picks the wrapper" did not reproduce — on this machine node consistently
  got the lower pid. Which is worse, not better: it worked by pid-assignment order, so the comment
  described an outcome the code did not actually cause. Anchored to `^node` with the comment
  rewritten to explain why anchoring is needed rather than claiming the old pattern excluded
  anything.
* PRs #535 and #540 carry **no reviews at all** — every one of their conversation comments is a
  driver-posted per-commit record. All of their design evolution came from in-run retrospective
  self-heal commits written while the run was live. Worth knowing when mining history: for those two
  PRs the commit messages *are* the review.

## Verified negative results

Things that were investigated and turned out to be **fine**. Recorded because a plausible suspicion
that nobody wrote down gets re-investigated, and each of these cost a real experiment.

* **`--tools` does not break `--json-schema`.** The obvious worry about hard-restricting the tool
  list is that structured output stops working. A live `claude -p` run with a restricted tool list
  still returned `"structured_output":{"status":"APPROVED","findings":[]}`. Unfounded.
* **The `^node` pgrep anchor is correct on all four launch paths** — tmux, the tmux-less fallback,
  direct `npm run`, and macOS `caffeinate`. `env` execs node, so the cmdline starts with `node`, and
  caffeinate's own argv does not.
* **`ps -axww -o pid=,command=` works on Linux**, not just BSD — the snapshot hook is portable.
* **`reviewer.md`'s "the commit you are reading is already green" is literally true.** `HEAD == sha`
  at the top of every round, and the review branch is unreachable while `gateRed` is non-null, so
  every `APPROVED` path is genuinely gated. Dropping `npm`/`npx` from `TOOLS_REVIEW` is enforced
  rather than merely requested — `--permission-mode dontAsk` denies rather than prompts.
* **The snapshot hook is fast enough.** 0.27s, well inside the 30s hook timeout — `audit:status`
  shells out to `pgrep`/`ps`/`git` but never to `gh`, which is what would have made it slow.
* **The hooks have no tests, and that is consistent.** No other hook in `.claude/hooks/` has tests
  either. Flagged in review and deliberately not acted on; if that convention changes, change it for
  the directory rather than for these two files.

## Open backlog — to validate

Not committed to. Each needs evidence before it lands, and the evidence is the point.

### 1. Reviewer `advisory[]` split — the report-everything-and-filter pass

**The problem.** `reviewer.md` ends with *"Only raise things that are wrong, incomplete, or risky… a
rejection over taste wastes a full fix round."* Anthropic's Opus 5 guidance calls this shape out
directly: *"If your review prompt says 'only report high-severity issues' or 'be conservative,' the
model may follow that instruction literally and report less; ask it to report everything and filter
in a separate pass instead."* It compounds with `EFFORT_REVIEW=medium`, which independently reduces
tool calls — two conservatism pressures on the one role whose job is catching what the gates cannot.

**Why the instruction exists.** `findings[]` does three jobs at once: the reject signal (drives
`CHANGES_REQUIRED` and a fix round), the fix-round instructions (fed verbatim to the resumed
implementer), and the PR comment's "catches". Because job one is expensive, the prompt has to
suppress jobs two and three to protect it.

**The proposal.** Add `advisory: { type: 'array', items: { type: 'string' } }` to `SCHEMA_REVIEW`.
`findings` stays blocking and narrow; `advisory` collects everything else and rides into the PR
comment for a human to filter at review time — the guide's "separate pass", at zero extra fix
rounds. Secondary win: observations that currently evaporate become free input for the next audit
cycle.

**Risks.** Longer comments on a PR that already has hundreds. Unfalsifiable in the short term — "the
reviewer says more things" is not evidence it says more useful things. And leakage into `findings[]`
would cost real fix rounds, the opposite of the current failure.

**Cost.** ~60–90 min: `SCHEMA_REVIEW`, the conservatism paragraph in `reviewer.md`, the collection
in `burndown.mjs` (critically, `status`/`feedback` must keep reading `findings` **only**), and
rendering + tests in `comment.mjs`. Plus a canary to confirm `findings[]` did not inflate.

### 2. Effort sweep, and `xhigh`

**Why.** Both the migration guide and the effort page say to re-sweep rather than carry settings
over: *"run a fresh effort sweep on your own evals rather than carrying over a setting tuned for an
earlier model."* The current `medium/high/medium` was reasoned from doc prose, not measured. And
`xhigh` is documented for exactly this workload — *"long-running agentic and coding tasks (over 30
minutes)"* — while `EFFORT_IMPL` is capped at `high` for every priority, even though the skill's own
timing table says a P1 refactor with two fix rounds runs 20–30 minutes.

**The trap.** Raising effort without raising budget makes quality look *worse*. `--max-budget-usd`
is a hard cap that terminates mid-work → deferral, and `BUDGET_IMPL` is `$4.00`. Higher effort means
more calls hit the cap, and the resulting deferral cluster reads as "xhigh is worse" when it is
budget truncation. **Any such experiment must raise `BUDGET_IMPL` in the same step.**

**Related capability gap, worth knowing before debugging:** the advisory task-budget countdown that
would let a role pace itself and finish gracefully is **not supported on Claude Code surfaces**. So
`--max-budget-usd` is a guillotine, not a warning — which is the mechanical reason budget caps are
this driver's main deferral source, and why the answer is always "raise the budget", never "tune the
prompt".

**Cost.** Mostly runtime. Add `EFFORT_IMPL_MAJOR` tiering parallel to `MODEL_IMPL_MINOR` (and *add
it to `LAUNCH_KNOBS`*), then two canaries on an identical pinned `AUDIT_FILE` slice differing only
in `EFFORT_IMPL`, comparing deferral rate, wall-clock, and `audit:cost` per role.

**Recommendation:** fold this into the next real 600-finding run rather than running it standalone.
A 20-finding sample is badly powered — findings are not homogeneous, and a canary that happens to
draw three P1 refactors is not comparable to one drawing P4 renames. A full run also re-baselines
the stale timing table for free.

### 3. Smaller, unvalidated

* **The acceptance-criteria slice is fragile** (`burndown.mjs`, the `acceptanceAt` block).
  `findIndex` matches the *first* line containing "acceptance" anywhere — including prose in an
  earlier bullet — so the window can start above the real section; and the window is a fixed 40
  lines, which truncates a long criteria section silently. Anchor on a heading match
  (`/^#+.*acceptance/i`) and slice to end-of-brief. Gets worse if `MODEL_VERIFY` ever moves to Opus
  5, which writes longer.
* **The timing table is stale** (`SKILL.md`, the "status" section). It carries its own warning: the
  figures were measured *before* the `EFFORT_*` knobs and the gate reordering existed, so they are a
  conservative ceiling rather than a norm. Re-baseline from the next long run.
* **A "thorough pass later" second review.** The Opus 5 guidance pairs a fast review pass with a
  more thorough one; the burndown only ever does the fast pass. The obvious free home is closeout —
  a `/leave-pr-review` sweep over the accumulated branch diff before `gh pr ready`. One review
  instead of 600.
* **If `MODEL_VERIFY` ever moves to Opus 5**, add a scope constraint to `verifier.md` in the same
  change. It authors "the concrete change to make" with nothing constraining it from widening a
  finding into a refactor, and the reviewer only catches that because it is handed the *original*
  finding.
* **Parallelism** — git worktrees per finding — is named in the skill as "a real redesign, not a
  knob". Still true, still unattempted.

## Timeline

| Date       | Commit   | What                                                                      |
| ---------- | -------- | ------------------------------------------------------------------------- |
| 2026-07-24 | 1df27d7e | Port the kit as a skill + Node scripts (PR #533)                          |
| 2026-07-24 | 9b975335 | Two-tier test gate; reviewer gets the original finding                    |
| 2026-07-24 | 9fb02e59 | Conditional per-finding E2E gate, with spec sanitizing                    |
| 2026-07-24 | aed45eb7 | Per-commit PR comments, lint gate, `BUDGET_VERIFY` 1→3                    |
| 2026-07-24 | 401820f5 | E2E `--retries=1` for flakes; concise fix summaries                       |
| 2026-07-24 | 70cabfac | Forward env knobs through the overnight launcher; context-window survival |
| 2026-07-24 | ea4b3731 | Mid-run control verbs; explicit `claude-opus-5` pin                       |
| 2026-07-24 | 8845f470 | Resumable from any fresh session or clone                                 |
| 2026-07-24 | 6646f9db | P4/P5 impl tiering; bare SHAs in comments                                 |
| 2026-07-24 | a40f534f | Harden the PR path; self-heal a stale `pr-number`                         |
| 2026-07-24 | 732c6b60 | Comment backfill tool                                                     |
| 2026-07-24 | e98cc383 | Stop discarding a committed fix over a missing SHA                        |
| 2026-07-24 | 85a1be1c | Honest deferral reasons; `BUDGET_REVIEW` 2→3                              |
| 2026-07-24 | 54caf9a2 | Count drops separately; run retrospective into the skill                  |
| 2026-07-24 | 1f825972 | Tune for Opus 5: `--tools`, `--effort`, gates before review               |
| 2026-07-24 | b1a9a6b7 | `PreCompact` snapshot hook                                                |
| 2026-07-24 | d755a0b6 | Record the launch command from the driver's own env; `LAUNCH_KNOBS`       |
| 2026-07-24 | 9577548e | Four accuracy defects in the snapshot                                     |
| 2026-07-24 | 2f508555 | `SessionStart` companion hook                                             |
| 2026-07-25 | 6e735b87 | `AUDIT_FILE` knob; shared `DEFAULT_MAX_ISSUES`                            |
| 2026-07-25 | edbcba52 | Only a started run records itself; pid cross-check                        |
| 2026-07-25 | a9550627 | Snapshot stops speaking for a finished run                                |
| 2026-07-25 | 6096ff99 | Opus 5 scope and length gaps in the role prompts                          |
| 2026-07-25 | 6ec397a8 | PR comment no longer describes a superseded commit                        |
