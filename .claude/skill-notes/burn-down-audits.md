# `burn-down-audits` — design notes

Design history and open questions for the Claude Code bulk audit burndown: the `burn-down-audits`
skill (`.claude/skills/burn-down-audits/SKILL.md`), the driver under `tools/audit-burndown/`, the
role prompts in `tools/audit-burndown/prompts/`, and the two compaction hooks in `.claude/hooks/`.

This note and the Claude skill are maintained directly. The Codex implementation lives under the
parallel `.agents/` paths and is maintained independently; never synchronize either provider's
runbook from the other. **The skill does not link here, deliberately** — do not add a pointer to it.

Paths in this file are repo-root-relative and deliberately not links.

Current as of **2026-08-07**. The skill is young — born 2026-07-24 — and every section below was
earned by a live run rather than reasoned out in advance; the dated sections at the end are in
chronological order.

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
   are exit codes, not model judgement, and they are what makes an unattended run safe.

A fifth arrived with the cloud cutover (2026-07-25) and behaves like an invariant even though it is
younger: **the driver does not talk to GitHub.** It commits and pushes; the supervising agent owns
the PR and the comments. Every GitHub failure this project has hit — a 20-minute API outage, an
unusable CLI — was survivable precisely because the commits were independent of it.

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

* Bash orchestration became Node `.mjs` under `tools/audit-burndown/`, because ADR-0017 rejected
  bash for `tools/`. Registered as `audit:*` npm scripts with `scripts-info` entries per ADR-0019.
* The runbook became a skill, registered in `skills-guide`, `audit-conventions`, the knowledge map,
  and the `tools/` orientation.
* The verifier prompt reads the pin SHA from each finding instead of the kit's hardcoded `f934d43`.
* `pop-finding.mjs` keeps the excision seam dprint-clean, because CI runs `dprint check` on
  `AUDIT.md`.
* `jq` was dropped entirely — Node parses the `claude -p` envelopes.
* The kit's deny rules for destructive git ops were merged into `.claude/settings.json`, and
  `.audit-work/` was gitignored.

**Deliberately not ported: the kit's in-session subagent variant.** `/fix-audits` already covers the
interactive path, and having two ways to do the same thing at different scales was the thing worth
avoiding. This is still the right call — the two skills have genuinely different shapes, not just
different sizes.

**`npm run test:tools` exists because of this PR's review.** The reviewer pointed out that
`getEntry`/`countEntries`/`deleteFirstEntry` were documented as the only things allowed to touch the
19k-line `AUDIT.md`, and that the header comment called hundreds of sequential edits "a corruption
risk" — yet the entry-boundary parsing and seam-collapse logic had no committed test, only manual
exercise against a scratch copy. The response created
`tools/audit-burndown/tests/burndown-core.test.mjs` + `tools/vitest.config.mjs`, wired as `npm run
test:tools` into `npm test` and its own CI step. The whole repo-script test suite traces back to
that one comment.

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
* **The gate ladder still misses the repo's bespoke gates, and CI catches them hours later.** The
  2026-07-25 run reddened Quality on `npm run lint:tokens` — a *ratchet* lint that fails in **both**
  directions. One finding hoisted AdminConsole's hex literals into `--admin-*` properties, dropping
  its raw-hex count 49 → 34, and the ratchet demands the baseline be lowered to match; another
  extracted the overflow modal into a new `InviteMenu.svelte`, which carried four hexes into a file
  with no baseline entry at all. Both are correct fixes, and neither `CHECK_CMD`, `TEST_CMD`,
  `LINT_CMD` (eslint on changed files) nor a targeted E2E spec can see either. **A fix that improves
  a ratcheted metric fails CI exactly like a regression** — worth internalising, because the run log
  and the per-finding gates read fully green throughout. `CHECK_CMD='npm run check && npm run
  lint:tokens'` closes it for a run at the cost of a few seconds per finding; the same hazard
  applies to any other bespoke `npm run lint:*`/drift gate CI runs that the four default gates do
  not.
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
  adversarial review". `deferralReason()` in `lib/burndown-core.mjs` now names the role that
  actually failed, locked by unit tests.
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
  `lib/comment-sync.mjs` so it is unit-testable and shared.
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

`tmux new-session` does not reliably inherit the caller's environment, so `launch-overnight.mjs`
bakes the run's knobs into the job command. The list of which knobs those are has now been wrong
**three times**, and each time the failure was silent and late:

1. **All of them** (70cabfac) — the original fix, adding the forwarding at all.
2. **`MODEL_IMPL_MINOR`** (a40f534f) — added to the driver in 6646f9db without a forwarding entry.
3. **`EFFORT_*`** (d755a0b6) — same, which is what finally moved the list into
   `lib/burndown-core.mjs` as `LAUNCH_KNOBS`, shared by both consumers.
4. **`AUDIT_FILE`** (6e735b87) — missed even after the consolidation, because it is read via
   `auditFile()` in `lib/burndown-core.mjs` rather than declared beside the other knobs.

Why it keeps failing silently: `check-preflight.mjs` is spawned directly and **inherits the full
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
* **The launch command cannot be scraped from `ps`** (d755a0b6). `launch-overnight.mjs` runs `env
  VAR=… node …`, and `env` **execs** node, so the assignments live in the environment and never
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

### The reviewer talked the implementer into destroying findings (2026-07-25)

The fourth live run's canary lost **three findings out of five**, and every gate was green
throughout. The most expensive single bug this driver has had, and the one that came closest to
shipping — the run was five minutes from launching at 600.

The chain needed three independently reasonable things to line up:

1. The driver folds the `docs/AUDIT.md` excision into the fix commit by **amending, after the review
   approves**. So every *landed* burndown commit contains its entry deletion.
2. The reviewer reads the diff of the commit under review, and can see neighbouring commits on the
   branch. It observed that the previous two burndown commits excised their entry and this one did
   not, and rejected: *"The finding's entry was not deleted from docs/AUDIT.md — it is still present
   at docs/AUDIT.md:10, unlike neighboring burndown commits 86b98e5 and 6ee1fd4 which excise the
   entry in the same commit as the fix."* That is a genuinely good observation from a blind
   reviewer. It is also exactly wrong, and nothing in its prompt could have told it so.
3. The implementer complied — it ran `pop-finding.mjs --delete`, confirmed it was entry #1, and said
   so in its summary. Then the driver ran its own `deleteFirstEntry()`, which now pointed at the
   **next** finding, and amended it into the same commit.

Net effect per occurrence: one unrelated finding — never verified, never implemented, never reviewed
— deleted from the backlog inside a commit about something else. `finished: 5 fixed` was true and
the remaining count dropped by 8.

**Why nothing caught it.** The canary checklist reads the diff with `':(exclude)docs/AUDIT.md'`,
which is what makes the code reviewable and is also precisely what hides this. The counts look
consistent unless you difference them (506 → 505 → 503 → 502 → 500 → 498, and the drop-by-2s are the
tell). No log line, no deferral, no red gate. The `run.log` correlation — every finding that logged
`round 1: changes required` deleted two entries, and the two that did not deleted one — is what made
it findable at all.

**The fix is identity, not vigilance.** `deleteEntryByTitle(title)` at all three call sites (fix,
drop, defer). Positional deletion is only correct while the entry being worked on is still first,
and a role can invalidate that mid-finding; keying on the title makes a duplicated delete a no-op
instead of a data loss. The success path logs `entry already gone — a role edited the audit file`,
which is both the tripwire and the monitor grep. Both prompts were also corrected (reviewer: the
excision is the driver's job, never raise it; implementer: never edit the file or run
`pop-finding.mjs`, and push back if a round asks you to) — but those are the backstop, not the fix.
A prompt that asks a model not to do something is not a guarantee; the lib change is.

Two general lessons, both of which generalise past this bug:

* **A positional operation on shared mutable state is a bug waiting for a second writer.** The
  driver was the only thing that deleted entries right up until the moment a role could be talked
  into it, and `deleteFirstEntry` had no way to notice it was deleting the wrong thing. Anything the
  driver mutates by index should be keyed on identity if a role can touch the same file.
* **The reviewer's frame is the commit, and the commit is not the whole truth.** It cannot see the
  post-approval amend, so any convention the driver applies *after* review looks to the reviewer
  like a step the implementer skipped. If more post-approval driver behaviour is added, the reviewer
  prompt has to be told about it in the same change, or it will reject on the difference.

### The same data loss through a second door: a stale brief (2026-07-25)

The sibling of the bug above, and it survived the `deleteEntryByTitle` fix because it defeats it by
construction. The verifier writes `.audit-work/current-brief.md` itself; twice now it has returned
`VALID` **without writing one**, leaving the *previous* finding's brief on disk while
`current-issue.md` names the new finding. The implementer then opens a brief for work that has
already landed.

Both occurrences were caught only because the implementer noticed and refused to commit — the second
one reasoning that a commit "would be attributed to — and would delete by title — an unfixed
finding". Had it simply executed the stale brief, it would have committed a no-op or a duplicate and
the driver would have deleted *this* finding's entry on approval. `deleteEntryByTitle` is no
defence: the title it is handed really is the current finding's, and that entry really is present.
**The title-keyed delete fixed the case where a role deletes the wrong entry, not the case where the
driver deletes the right entry for the wrong work.**

Fixed by `briefIsStale(issueWrittenAtMs, briefMtimeMs)` in `lib/burndown-core.mjs`, checked between
the `VALID` verdict and the implementer call; a stale or missing brief defers as `verifier gave no
usable brief`.

**Why mtime rather than the identity check these notes originally proposed.** The obvious design —
have the verifier write the finding's title into the brief and have the driver compare — needs the
verifier's cooperation, and *a role that skipped writing the file would skip the title too*. The
guard would be absent in exactly the case it exists for. The driver writes `current-issue.md` itself
and the verifier only runs afterwards, so comparing the two mtimes uses facts the driver owns
outright. Equal timestamps count as stale: a false deferral is cheap, a mis-attributed commit is
not.

Note this was fixed **without** reproducing the root cause, reversing what these notes previously
recommended. Why the verifier skips the write on a `VALID` verdict is still unknown — but the guard
does not depend on knowing, and a second occurrence inside a five-finding canary (~14%) made waiting
for a reproduction the more expensive option. The root cause is still open; the data-loss path is
not.

### Smaller frictions from the same run (2026-07-25)

Three things that cost time without breaking anything, all fixed in the same pass:

* **The documented launch order was impossible.** Step 1 said "preflight, then open the draft PR
  (head = `BRANCH`)" — but a freshly-forked branch is byte-identical to `main`, and GitHub refuses
  to open a PR with no commits between them. Every run hits this and has to invent a way out. The
  resolution reorders rather than adds: write and commit the durable checkpoint *first* (it has to
  exist anyway, and the skill already demanded it), which gives the PR something to open against.
  The alternative — open the PR after the canary's first push — leaves the canary's commits with no
  CI and nowhere to comment.
* **`capture` re-armed already-posted comments.** It deduped against the store alone, and the store
  is empty exactly when the drain succeeded — so the natural closeout instinct ("did I miss any?")
  silently re-added all 9 posted records. Nothing distinguishes them from real work owed, so the
  next step would have been posting 9 duplicates. `done` now appends to
  `.audit-work/posted-comments.log` and `capture` skips those, reporting `skipped N already posted`.
  Kept in `.audit-work/` rather than beside a committed `COMMENT_STORE`: a dead container loses it
  and capture then re-offers, which is the at-least-once direction the drain loop already chose.
* **`BRANCH` is not the branch a cloud session is told to use.** It defaults to `audit/burndown`
  while a CCR session is usually assigned `claude/<topic>`, and the driver takes the default
  silently. The override then has to ride on every relaunch, which is a checkpoint concern, not a
  shell concern. Named in step 1 now.

The timing table was also re-baselined from this run's ten findings (it had carried a "measured
before the `EFFORT_*` knobs" warning). The finding worth keeping: **fix rounds dominate wall-clock,
and priority sets how many you get** — a finding that clears review first time lands in about a
third the elapsed time of one that doesn't, at the same priority. A perfectly healthy P2 with two
fix rounds took 26 minutes, past the table's own `> 25 min` investigate threshold, which is why the
priority caveat matters more than the thresholds do. Ten findings is a thin sample and the note says
so.

### A deferral used to throw away everything expensive about the attempt (2026-07-25)

`defer()` wrote the original finding and a one-line reason. Everything that cost real money to
produce evaporated: the reviewer's unresolved objections, the implementer's account of each round,
and the draft itself — `git reset --hard` leaves it reachable only through a reflog that dies with
the container. So `docs/AUDIT-DEFERRED.md` could not distinguish a fix rejected on one narrow point
(a wrong string literal in a new test fixture) from a brief that *cannot be executed at all*, and a
triager's only move was to re-stage and pay for the discovery again.

Two things made this concrete rather than theoretical on the run that fixed it:

* **Both `implementation failed` deferrals were briefs at fault, not models.** One proposed
  collapsing an import to `export type { X } from './y'`, which does not compile — a re-export
  statement creates no local type binding, so the `Exclude<X, …>` below it loses its reference. The
  implementer proved that, reverted, and *declined to substitute a different fix the brief did not
  ask for*. Re-staging that finding unchanged buys the identical failure. Nothing in the old
  deferral record said so.
* **Part of the record was already gone before anyone looked.** Recovering the reasoning by hand
  found `iter0002`'s envelopes were a *mix* — `review3`/`fix2` from the canary, `impl`/`review1`/
  `review2` overwritten by a later run's own `iter0002`. Which is the argument for capturing inside
  `defer()` rather than reading envelopes afterwards: by the time you want them, the iteration-name
  collision has eaten an arbitrary subset.

The draft is captured **before** the reset (afterwards its commits are unreachable) and the patch
filename suffixes on collision, because silently overwriting a draft is the exact loss the feature
exists to prevent. `renderDeferralNotes` and `draftPatchPath` live in `lib/burndown-core.mjs` with
unit tests; one of them pins that a single attempt is not numbered and that a deferral with no
commit gets no `#### Draft implementation` section at all — an empty pointer would be worse than
none.

**What was deliberately not done:** capturing a draft for a finding that was *interrupted* rather
than deferred. The run's last finding died to a container restart mid-fix-round; its entry was never
removed from `docs/AUDIT.md`, so a future run re-verifies it from scratch. Filing a stale patch
under `docs/audit-deferred/` for a finding that is not deferred would misrepresent the backlog.

### Supervising-agent friction, third cloud run (2026-07-25)

None of these touched the driver. They are all things the *supervising* session got wrong or wasted
time on, which is exactly the material that never makes it into a runbook because it feels like
operator error rather than design.

* **The liveness check was measuring itself.** The documented stall check compared `HEAD` and `wc -l
  < run.log` across five minutes. Both are surfaces the supervising agent writes to —
  `backfill-comments.mjs done` appends a line to `run.log`, and any `git reset` of your own moves
  HEAD — so it returned a confident `ADVANCED` for a driver that had been dead for half an hour. The
  envelope count in `.audit-work/logs/` is written only by role calls, which is why the check now
  uses it. Generalisation worth keeping: **a liveness probe must read a surface the observer cannot
  write.** The same instinct as principle 1, one level up.
* **A new terminal state: the orphaned driver.** The container restarted *without* being reclaimed —
  disk survived, the Node process survived, its in-flight `claude -p` child did not. The driver then
  waited forever on a child that would never report. What makes it nasty is that it emits nothing:
  no `HALT`, no `DEFERRED`, no log line, so an event-driven monitor is silent and silence is the
  designated "healthy" signal. This is the only case where killing `run-burndown.mjs` is right, and
  the diagnostic that identifies it is `pgrep -f 'claude -p'` returning nothing while the driver
  lives. Distinct from the documented "container reclaimed" case, which loses everything and is
  obvious.
* **`pkill -f 'audit-burndown/run-burndown.mjs'` kills your own shell too**, because `-f` matches
  whole command lines and the wrapper contains the pattern. Exit 144 reads like a failure; the kill
  had actually worked. It also took out a background waiter whose command line mentioned the same
  path.
* **Elapsed time was twice inferred from a monitor's death.** A `Monitor` times out 30 minutes after
  it was *armed*, which is unrelated to when the current finding started. Reading the timeout as
  "this finding has run 30 minutes" produced an investigate-band alarm for a P4 that was three
  minutes old, and the correction cost a round trip. The clamp itself was already documented; that
  it is not a clock was not.
* **The unsigned-commit hook fires every turn and its remedy is actively dangerous here.** The
  identity is already `Claude <noreply@anthropic.com>`, and its suggested `--amend --reset-author` /
  `rebase --exec` would race the driver's own `--amend` mid-run and, on a run with hundreds of
  pushed commits, demand a force-push. Worth documenting purely so the next session spends one
  sentence on it instead of investigating.

  **The mechanism recorded here on 2026-07-25 was wrong, and it is a clean instance of principle 1
  turning up inside these notes themselves.** The original claim — a zero-byte key file means
  commits are unsigned — was inferred from `ls` on `user.signingkey` plus the hook's own wording,
  and never checked against a commit object. Checked on 2026-07-25: commits **are** signed (`git
  cat-file commit HEAD` shows `gpgsig -----BEGIN SSH SIGNATURE-----`). Signing is delegated to
  `gpg.ssh.program=/tmp/code-sign`, a session-provisioned symlink to the environment manager, and
  the 0-byte `.pub` is a placeholder that program ignores. What actually fails is *local
  verification*: `gpg.ssh.allowedSignersFile` is unset, so `%G?` cannot check an SSH signature and
  returns `N`, which the hook reports as a missing signature. The practical advice was unchanged by
  any of this — which is exactly why the wrong mechanism survived three sessions of being repeated
  back to the user as fact.

The through-line: **most of these are the supervising agent mistaking its own footprint for the
run's state.** The driver is deliberately independent of the conversation, and the cost of that
independence is that every shared surface — the log, the branch, the working tree — carries both
parties' writes with no way to tell them apart after the fact.

### The cloud cutover (2026-07-25)

The third live run was the first in a Claude Code cloud session rather than on the author's Mac, and
it was the run that paid for the canary checklist. Five findings, all fixed, nothing deferred — and
underneath that clean result, two of the skill's load-bearing claims were false.

**What the environment actually is.** A cloud session runs in an ephemeral container reclaimed for
inactivity, mid-run, without warning. GitHub is reachable only through the supervising agent's MCP
tools: the container's `GH_TOKEN` is scoped to a local git proxy rather than github.com, and
`origin` is `http://local_proxy@127.0.0.1:<port>/git/<owner>/<repo>`, which `gh` rejects outright
with "none of the git remotes configured for this repository point to a known GitHub host". Neither
is an authentication problem, so no amount of hardening the `gh` path helps.

**The `--resume` handoff was inverted, and nothing in any log said so.** CCR pins
`CLAUDE_CODE_SESSION_ID`; every `claude -p` child inherits it, so all of them report the same
`session_id` and append to one transcript file. `--resume <that id>` lands on the file's most recent
leaf. Walking `parentUuid` chains showed both of the run's fix rounds attached to the *reviewer's*
leaf — the implementer was fixing its work while holding the critic's context. Invariant 3 (the
reviewer is blind, in both directions) was void for every fix round the loop had ever run in this
environment.

Three things are worth keeping from how that was found, because none of them were obvious:

* **The symptom was cosmetic.** The observation that started it was "every role envelope has the
  same `session_id`" — noticed incidentally while reading `fix1.json` for the canary checklist's
  step 3, which exists to confirm the handoff fired. The checklist earned its keep. It also nearly
  failed: `fix1`'s summary *did* reference the earlier work in convincing detail, because the review
  feedback quoted enough of it. Reading the summary and stopping there would have confirmed a
  handoff that was not happening.
* **The transcript is a forest, not a conversation.** 167 root messages (`parentUuid == null`) in
  one file, no `isSidechain` markers. That structure is what makes "resume the session" ambiguous,
  and it is the thing to check first if this ever regresses.
* **One measurement contradicted itself and had to be withdrawn mid-investigation.** A grep for the
  fix-round prompt string matched six times, four of which were the investigation's own output
  echoing into the shared transcript. Anchoring on `startsWith` gave the true count (2, both
  reviewer-resumed). The false positives were themselves a second demonstration of the root cause —
  the supervising agent writes to the same transcript the roles do — but only after being caught.
  Principle 1 applies to your own diagnostics, not just to the driver's.

The fix is `--session-id <uuid>`, minted per call by the driver. Unsetting the env var does not
work; that was tried first. Verified end-to-end with a codeword planted in one session and read back
after a resume.

**`gh` was structurally unusable, and the driver degraded quietly rather than failing.** No
github.com credential, *and* an `origin` pointing at a local git proxy that `gh` refuses as a
non-GitHub host. The run pushed everything correctly and then logged `gh pr create FAILED` and
spilled five comments to a gitignored file. That is the same shape as the 2026-07-24 macOS incident
(20-minute HTTP 500 on `gh pr create`) arriving from a completely different direction, which is what
turned "harden the PR path" into "take the driver out of the GitHub business entirely". The
supervising agent has MCP tools; the subprocess has nothing. Split it there.

**What changed.** The driver is out of the GitHub business entirely — no PR creation, no comments,
no `gh` dependency; it commits and pushes, and the supervising agent owns the PR and drains the
comment store through the MCP tools via a `next` → post → `done` loop. Every fresh role call gets a
minted `--session-id`, and that minted id (not `env.session_id`) is the resume handle. `PUSH_EVERY`
drops 10 → 1 and `PUSH_TEST_CMD` defaults to empty, with CI on the draft PR as the full-suite
backstop. Comment records are written the instant a fix lands rather than accumulated in memory.
`launch-overnight.mjs` loses `caffeinate`/`tmux`/`pmset`; preflight loses the `gh` checks and the
macOS power section and gains an origin-reachability check.

The choice of **full cutover over capability-detection** was the user's, and it is the one decision
here that a future maintainer might reasonably revisit. Three options were on the table:

* **Fork a `burn-down-audits-cloud` skill.** Zero risk to the macOS path, but two copies of a
  ~780-line driver and a ~600-line runbook that would drift within a month. This directory exists
  because the accumulated retro notes are the asset; duplicating them halves the odds any given
  lesson is where you look.
* **Capability-detect and support both.** One driver probing for a usable `gh`, with
  `PR_MODE=gh|agent` and per-mode push defaults. Genuinely tempting. Turned down because the
  conditional surface has to be maintained and tested against a runtime nobody uses, and the
  supervising-agent-owns-GitHub split is simpler than either branch of the conditional.
* **Full cutover.** Chosen. The cost is that running this on a Mac again means restoring deleted
  paths.

Two of the three changes went in unconditionally because they are improvements on any runtime
(minted session ids, per-finding pushes), so a re-port to macOS would start from a better driver
than the one that was cut over.

**What the new defaults cost, stated plainly.** A cross-finding regression no longer blocks a push;
it turns a CI run red asynchronously, so watching CI became part of supervising a run. And CI
coverage is per-push rather than per-commit — `test.yml` sets `concurrency: cancel-in-progress`, so
a finding landing three minutes after the last one cancels the suite still running for it (two of
six runs on the cutover branch were cancelled that way). The final push always completes, so "the
branch is sound at the end" holds; "every intermediate commit was green" does not. A run with no
supervising agent produces no PR and no comments at all — the commits are still correct and pushed,
but the narrative around them waits for an agent to drain the store.

One more thing the run demonstrated, at no cost: the container restarted mid-session. The disk
happened to survive. `PUSH_EVERY=1` exists because next time it might not.

### An acceptance criterion the implementer cannot afford discards the whole fix (2026-07-26)

Fifth cloud run. The canary deferred a finding as `implementation failed` whose fix was **complete
and fully green** — type-check, eslint, 660 unit tests, and the named E2E spec all passed. Its
post-mortem said so plainly: *"the full npm test run … required by the acceptance criteria was still
executing when a response was required, so I could not confirm it green and have not committed —
deferring so a partial/unverified state isn't recorded as done."*

The implementer's judgement was **correct at every step**. It was told a command must pass, it could
not confirm that command passed, and it refused to record unverified work as done. Nothing in the
role prompts was violated; the loss came from the brief asking for something the architecture had
already decided against.

The chain, and why each link looked reasonable:

1. `verifier.md` asked for *"the exact commands that must pass"* without saying **which**. `npm
   test` is a defensible reading of "the tests must pass" for a model that has not been told the
   driver's gate set.
2. `implementer.md` lists *"the acceptance commands from the brief"* **first**, ahead of the gates
   the driver actually runs — so a brief naming the full suite silently widens the required set.
3. The driver gates on `test:unit` precisely *because* the full suite belongs to CI. So the criteria
   demanded the one thing the design deliberately moved off the per-finding path.

Fixed in `verifier.md` by naming the four real gates and forbidding `npm test` outright, with the
consequence spelled out — an implementer that cannot finish a named command declines to commit, so
the criterion throws away a finished fix and the finding is re-paid on a later run.

**The general shape is new and worth keeping separate from the budget-cap lesson it resembles.** The
existing rule is "a budget set too tight converts finished work into a deferral". This is the same
outcome reached without any cap firing: *any* acceptance criterion the implementer cannot satisfy in
its budget is a work-discard mechanism, and unlike a budget knob it is authored fresh by a model on
every single finding. A knob is wrong once and you fix it once; a prompt that permits an
unaffordable criterion is wrong at whatever rate the verifier happens to write one.

Two smaller things from the same run, both recorded because they generalise:

* **`pgrep` wait loops self-match and hang forever.** The natural way to wait out a clean stop —
  `until ! pgrep -f 'audit-burndown/run-burndown.mjs'; do sleep 15; done` — never exits, because the
  loop's own command line contains the pattern and it ends up waiting on itself. It presents as a
  driver that will not die, indefinitely, long after the run has finished. This is the third
  distinct way `-f`'s whole-command-line matching has bitten a supervising agent (after `pkill`
  killing its own shell, and the orphan check matching the supervising CLI), and the first where the
  failure is a silent hang rather than a wrong answer. The anchored `'^node
  tools/audit-burndown/run-burndown.mjs'` form fixes all three; it is now in the skill for the wait
  loop as well as the liveness check.
* **The verifier invalidated a finding the run itself had obsoleted, correctly and in 25 seconds.**
  An early P1 extracted the drawing shell's boot sequence into `lib/boot/`; a later P2 asked for
  wake-lock lifecycle to be pulled out of `onMount`, which the P1 had already done. The verifier
  matched HEAD against the finding's own proposed solution, said "it was fixed by an earlier
  iteration of this burndown", and dropped it. Worth recording as a **verified negative**: at 450+
  findings a broad refactor will obsolete later entries, and the drop path handles it without
  supervision. Nobody needs to pre-prune the backlog for self-collision.

### A drop got the verdict right and the reason wrong — the same day the pattern above went well (2026-07-26)

Sixth cloud run. The verifier dropped `[P4][maintainability] scheduleReset returns an id that no
caller uses` as invalid, reasoning *"that's false at HEAD (and was already false at the pinned SHA
f934d43 — the code is unchanged in this regard)."* Checked directly against the pin: it's wrong.
`git show f934d43:…` shows the hold timer was a bare `setTimeout(...)` at the pin — no caller
captured `scheduleReset`'s return value, so the finding was accurate when written. It was made false
by a fix *earlier in this same run* (rerouting the hold timer through `scheduleReset` so `destroy()`
could cancel it individually), not by anything true at the pin.

The **verdict was still correct** — applying the finding at HEAD would have broken that early
cancellation, re-introducing the exact bug a mutation-tested fix had just closed — so no work was
lost. Only the stated reason was false, and that matters because **the drop commit is the only
surviving record of a permanently deleted finding.** "Always invalid" and "this run obsoleted it"
are different claims a later triager needs told apart, and this run's own good example above — the
onMount/wake-lock drop, which named the obsoleting commit correctly and unprompted — proves the
prompt already produces the right answer sometimes. That argues for making it mandatory rather than
redesigning anything: `verifier.md` now requires an INVALID verdict to say which case it is, and to
name the fixing commit when it's the second. See `Verified negative results` above for the case this
sits beside, and note two of this run's six drops (this one and a `lint:tokens`-scope-exclusion
drop) independently confirm that **the drop count is not a quality score** — some drops mean
"wrong", others mean "right and not worth it," and the log row's single number collapses that
distinction.

### A HALT with an environment cause, not a model one (2026-07-26)

Same run. Three consecutive deferrals (`implementation failed`, `verifier unavailable` ×2) halted
the run at finding 46. All three `.err` logs carried the identical string: `this workspace has not
been trusted` — a container event had reset `hasTrustDialogAccepted` to `false` for the project in
`/root/.claude.json` between one finding's successful verify and its own impl attempt, and every
`claude -p` subprocess launched afterward errored immediately (`is_error: true, total_cost_usd: 0,
terminal_reason: "api_error"`) regardless of role. The driver's deferral labels were the correct
ones available to it — the schema has no way to say "the role never got to run" versus "the role
judged the work" — but they read exactly like the benign, documented halt shape (three unlucky
findings) unless someone opens the `.err` files. Confirmed still broken at wrap-up; fixing
`/root/.claude.json` is outside the repo and outside a supervising agent's default permission scope
(blocked by the session's own auto-mode classifier), so it was flagged to the human operator rather
than worked around. Added to the skill: check the `.err` files for a shared non-model error string
before assuming a HALT is the ordinary case.

### The first clean run — and the defect class it exposed instead (2026-07-29)

43 findings on `claude/burn-down-audit-skill-ecb5np` → PR #627: **39 fixed, 4 dropped, 0 deferred**,
entry accounting exact, CI green throughout, zero supervisor interventions. The first run in this
skill's history where nothing was lost, mislabelled, or silently discarded. That matters mostly
because it means the failures worth recording here are no longer about the machinery.

Two long-standing prescriptions paid off measurably and should not be softened:

* **Verifying tiering before launch rather than after.** The previous run discovered post-hoc that
  all 642 findings had routed to the expensive model. Running `findingPriority` over the backlog
  took one command and returned `636 findings, 0 unparsable`, and the `sonnet` tier — unproven at
  the last wrap-up — then took review rounds like any other and produced no deferrals. The tier is
  now validated on a real backlog; the *check* is what stays mandatory, because its failure is
  silent by construction.
* **Re-deriving the gate list from `test.yml`.** The Quality job had grown 8 → 11 steps since the
  list was last written down. `lint:tokens` justified itself within the canary, catching a raw-hex
  baseline still pointing at `DrawingCanvas.svelte` after the CSS moved to a new
  `PointerHalos.svelte` — a correct fix that would otherwise have reddened CI, recovered as a fix
  round instead.

**The new defect class: a fix that moves the goalpost rather than clearing it.** Three of 43
findings raised an eslint `max-lines` cap to accommodate their own additions (`engine.ts` 900 → 901
→ 913, `undoHistory.test.ts` 500 → 529). Every one passed all four gates, disclosed the bump in its
commit message, and was approved on review. Nothing in the loop is wrong-footed by this — the gates
are deterministic, so editing the gate is simply the cheapest path through a binding one, and the
module *had* genuinely grown. It only reads as a defect in aggregate: a ratchet that yields whenever
it binds has stopped being a ratchet, and at ~7% of findings that is ~40 bumps over a 600-finding
backlog.

What makes this worth recording rather than just fixing is that **the loop corrected it without
being told to**. A fourth attempt raised `undoHistory.test.ts` to 580 and the reviewer rejected it —
not on the number, but because the adjacent comment read "Cap sits at today's size — shrink, never
grow", so the commit falsified a comment it was sitting next to. The implementer took the harder
option the review offered: extracted the shared canvas-stub harness into `undoHistoryHarness.ts`,
split the suite, and dropped the file to 441 lines — **under the 500 default**, so the grandfathered
override was deleted outright rather than raised. That is the repair to prefer, and it was found by
the adversarial pass rather than by a gate. Added to the canary-audit checklist in `SKILL.md` as a
fourth smuggling shape, framed as a rate to measure rather than an instance to catch.

**The reviewer's value continues to concentrate where no gate can reach.** The catches worth naming:
a default parameter evaluating `canvas.getBoundingClientRect()` *before* its own `if (!canvas)
return` guard, converting a no-op into a TypeError; a paired-marks change that would have moved the
two hottest ops onto WebKit's ~1 ms-clamped mark deltas and destroyed ADR-0066's commit-hitch
attribution; an LRU eviction that freed tile canvases while `createPattern`'s bitmap copies stayed
in the pattern cache, so the memory the finding targeted was still retained; and a four-corner-union
test written with a pure scale+translate matrix, under which two opposite corners produce the
identical rect — a test that passed without exercising the invariant its own name claimed.

The single best evidence for a documented design decision: on the `SnapshotPatch` finding the
reviewer rejected the fix because **the verifier's acceptance criteria were wrong**, asserting no
E2E spec covered the surface when `engine-snapshot-tier.spec.ts` did. The implementer ran it, then
mutation-tested each rewritten path to show the coverage was non-vacuous. Handing the reviewer the
*original finding* rather than only the brief is what made that reachable — the verifier is the one
role with no independent check, and this is the first run where that safeguard visibly fired.

Smaller frictions, all fixed in `SKILL.md` this pass:

* **The documented monitor command cannot be armed at launch.** `tail -f` on a not-yet-created
  `run.log` exits 1 immediately, so the first monitor died before the run wrote a line — and a dead
  monitor is exactly the silence the skill elsewhere warns reads as health. Needs an `until [ -f …
  ]` guard and `-n +1` on the first arm.
* **"Read the flaky count" is wrong advice for this repo.** Bare `npm run test:e2e` carries no
  `--retries`, so Playwright never emits a `flaky` line; a load-dependent flake surfaces as a plain
  `1 failed`, indistinguishable from a broken base. The baseline run hit exactly this on
  `pwa-registration.spec.ts:60` (green 3/3 in isolation). The procedure has to be *classify by
  re-running the failing spec alone*, not *read a count that will not be there*. Also worth pinning:
  `(npm run test:e2e; echo "EXIT=$?")` — piping the suite hands you the wrong exit code, which is
  how the initial "exit 0" reading happened.
* **The `Audit:` trailer often disagrees with the `iter` line's title**, because the verifier
  rescopes and retitles as part of writing the brief. Reads exactly like a commit consuming the
  wrong entry, and cost a diagnostic detour to disprove. The `removed=` count is the real invariant.
* **`awk '/starting — target/{f=1} f'` does not scope to "the current run"** in a session that ran a
  canary first — it latches onto the canary's start line and silently returns both runs. Right for a
  wrap-up total, wrong for "what has this run done".
* **`capture`'s `skipped N already posted` is a stronger check than the skill treated it as.** `N`
  equalling the fix count is the only end-to-end proof every fix reached the PR; the store going
  empty proves only that what was *offered* got posted.
* **The duration table's `> 25 min` investigate threshold fires on healthy `[Architecture]`
  findings.** Extraction/module-move findings landed at 17, 20, 29 and 29.5 min, all fine. Category
  skews elapsed as hard as priority does.

Also trimmed: the "Monitor hygiene, both directions" paragraph under the *resume* verb duplicated
the fuller treatment under **Surviving the context window**; collapsed to a pointer. Both failure
directions did occur this run (a monitor armed dead, and two monitors double-reporting), so the rule
is right — it just does not need saying twice at per-invocation context cost.

### 2026-08-05 — the hand-driven cherry-pick, and what the driver was silently doing for us

The ask was "cherry-pick the ones you could do in 1–2 minutes, leave the rest," which the driver
cannot serve: it has no selector, pops in file order, and spends a full verify/impl/review cycle on
whatever it gets. Run by hand instead — index by `findingPriority` + body length, work the shortest
P4/P5 entries inline, `deleteEntryByTitle` for the excision. 58 fixed / 4 dropped / 62 consumed, 535
→ 473, arithmetic reconciled against `pop-finding.mjs --count`.

The interesting result is not the throughput, it is **which of the driver's guarantees turn out to
be load-bearing once you remove them.** Three failed, all three predictable in hindsight, and the
skill now carries them as a "hand-driven cherry-pick" subsection rather than as generic advice:

* **Comment SHAs.** The `comment-sync.mjs` → `next` → post → `done` loop exists so a SHA reaches
  GitHub from a *tool*. Writing comments by hand puts the agent's transcription in that path, and 32
  of 62 went out as a correct 7-char `%h` prefix padded with 5 invented characters — right length,
  right leading characters, resolves to nothing. Nothing downstream validates a SHA and a bad one
  renders as ordinary text, so it is invisible until someone clicks. Worse, `add_issue_comment` has
  no update counterpart in *this session's* GitHub toolset, so the only remedy left was a 32-row
  correction comment — other runners' toolsets do expose a comment updater, so check before assuming
  a correction comment is the only option. The general rule went into `.ruler/github.md` (so it
  reaches every session via CLAUDE.md/AGENTS.md, not just this skill): take SHAs from `%H`, never
  retype, and batch-verify with `git rev-parse --verify --quiet "$sha^{commit}"`. **The verification
  is the load-bearing half** — "be careful" is not a control, and one command over the whole set
  caught all 32 in seconds once it was finally run.
* **`format:check`.** Deliberately out of `CHECK_CMD` on a cost argument (~23s × 450 findings ≈ 3
  hours) plus the `format-edited-file.sh` `PostToolUse` hook. Both premises are driver-specific: by
  hand there are a dozen batches, not 450 findings, and a supervising agent edits through
  `sed`/`python`/heredocs constantly — precisely the "editing through `Bash`" residual risk the
  skill already names as the hook's blind spot. It reddened CI on the first batch that removed a
  Svelte attribute (the shortened element then wanted collapsing onto one line).
* **The blind reviewer.** No adversarial second pass means a fix is only as good as the context that
  wrote it. The substitute adopted mid-run — and worth keeping — is a **negative check** on any new
  guard: break the source the assertion covers, confirm it goes red. It caught nothing wrong, but it
  is what makes "the viewport-sync/blank-env/app-name/dev-port guards actually work" a claim rather
  than a hope. One trap found the hard way: `git stash` removes the fix *and* the new test, so the
  suite passes and proves nothing — revert only the source file.

Two things the hand-driven mode did **better** than the driver, worth noting before anyone concludes
it is strictly worse:

* **Drift detection was far more aggressive**, because a human-scale reader checks the premise
  before the fix. Four findings were dropped as invalid (`targetRepo` had gained a second caller;
  `a11y.spec.ts` had already adopted `gotoApp`; two icon findings assumed a `KNOWN_ORPHANS`
  carve-out that no longer exists — and one of them would now *break* `/design` if implemented) and
  three more were fixed only in part with the drift recorded. The verifier subprocess drops on a
  false premise too, but it cannot notice that a *neighbouring* half of the finding already landed.
* **Findings that overlap were reconciled rather than fought over.** Two separate entries covered
  `isDarkInk` coverage; the second commit says so and closes only what the first left. The driver,
  processing them hours apart in separate contexts, would have had the second verifier drop it as
  already-fixed — losing the `isLightColor` half that was still genuinely missing.

Open question this leaves: the selection heuristic (shortest P4/P5 body) is a proxy for
"mechanical", and it held up here — but every finding it picked was in the tail the whole-repo
`/code-audit` produces. Whether it degrades on a hand-curated backlog is unvalidated.

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
in `run-burndown.mjs` (critically, `status`/`feedback` must keep reading `findings` **only**), and
rendering + tests in `lib/comment-sync.mjs`. Plus a canary to confirm `findings[]` did not inflate.

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

### 4. Smaller, unvalidated

* **The acceptance-criteria slice is fragile** (`run-burndown.mjs`, the `acceptanceAt` block).
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
| 2026-07-25 | —        | Cloud cutover: minted `--session-id`, no `gh`, push every finding         |
| 2026-07-25 | f389dd39 | Delete backlog entries by title — the canary destroyed 3 findings in 5    |
| 2026-07-26 | 049d5e35 | Stop the verifier naming `npm test` — it discarded a finished, green fix  |
| 2026-07-26 | —        | Verifier must name which kind of "stale" on INVALID; HALT env-cause note  |
| 2026-07-28 | —        | Body-line `**Priority:**` fallback — tiering was silently off for 642     |
| 2026-07-29 | —        | First clean run (39/4/0, PR #627); goalpost-moving fixes named as a shape |
| 2026-08-05 | —        | Hand-driven cherry-pick (58/4/62, PR #770); SHA + format gaps it exposed  |
| 2026-08-05 | —        | PR #771 retro: bundle gate, `BUDGET_IMPL` 4→7, verify retry on no-brief   |

## 2026-08-05 — what the PR 771 retrospective changed (and why)

A review of PR 771's 33 per-commit comments (31 fixed · 1 dropped · 5 deferred from a 473-finding
backlog) mapped every failure point to either a programmatic detection or written guidance. Three
driver changes came out of it:

* **The bundle gate** (`withBundleGate` + `diffAddsClientStaticImport`). The run's one CI regression
  was a fix the finding *and* the first-pass reviewer both believed respected the lazy-chunk
  constraint: hoisting a six-line predicate into `lib/drawing/` handed Rollup a static edge into the
  save graph, and `startup-bundle.spec.ts` went red naming `screenshotFeedback` — a module the
  commit never touched. No per-finding gate could see it by construction, so the driver now watches
  for the *cause* (an added static import / re-export in a client-bundle file) instead of trying to
  observe the effect, and buys the production build only for findings that trigger it. Rejected
  alternative: running the spec for every finding (a build per finding is hours over a backlog);
  also rejected: verifier-nominated only (the 42960c3f finding shows the shape defeats prediction —
  both the finding author and the reviewer reasoned about the payload, not the edge).
* **`BUDGET_IMPL` 4.00 → 7.00.** The canary's segmented-control extraction hit `$4.0036` on its fix
  round, finished and green. The knob's failure mode is identical to the `BUDGET_VERIFY` 1→3 lesson
  already on record: a cap below the work's cost pays for the finding twice. Verify/review peaked
  under `$1` on the same run, so those caps stay.
* **One semantic retry on VALID-without-brief.** A verifier finished cleanly, returned VALID, and
  never wrote the brief. Deferring treated a skipped side effect as a judgement; the handoff packet
  called it "retryable rather than deferrable" and the retry is the same check-the-side-effect
  pattern as `resolveImplSha`.

Guidance (not code) covered the rest: the verifier prompt now names the deliberate-boundary finding
shape ("the comment is the evidence, not the defect"), and `.ruler/conventions.md` documents the
bundle boundary as the sanctioned exception to "cross-file agreement is never maintained by prose" —
the constraint comment + drift-guard-test pattern that `saveFolder.svelte.ts` now models.

Deliberately **not** built: a SHA-verifying helper script for hand-written comments (the
`.ruler/github.md` rule already carries the one-line `git rev-parse` check, and the driver path gets
SHAs from git — a script would be speculative surface), and pre-classifying sweeping multi-file
findings to raise their turn caps (two data points, no mechanism recurring; recorded as a triage
note in the skill instead).

## 2026-08-07 — the base commit can be red, and CI can be absent rather than failing

PR 821 (20 fixed · 0 dropped · 1 deferred from a 367-finding backlog) spent its most consequential
effort before any finding ran. Two lessons are structural rather than incidental, and both are about
a *premise the runbook held silently*.

**The runbook told you to check the base commit but never what to do when it fails.** The base-gate
paragraph has said "confirm every one exits 0 before launching" since early on, phrased as a
formality — the interesting case was assumed impossible. It is not: `main` was failing two Quality
gates, left by a merge hours earlier. The mechanism is worth internalising because it recurs by
design: `test.yml` sets `cancel-in-progress`, so a merge commit's push run is routinely cancelled by
the next push and *never reports at all*. The reddening merge had no CI run in its history. "Main is
green" is therefore not an observation anyone actually made, and a supervisor who skips the base
check to save 90 seconds is trusting a signal that does not exist.

Consequences now written into the skill: run the base gates **un-chained** (the `&&` short-circuit
hid the second failure until the first was repaired — one relaunch per gate); repair in a **separate
commit** attributed to no finding; and **re-run the whole set after each repair**, because a repair
can redden a different gate. That last one is not hypothetical either — `npm run
optimize:svg-assets` rewrote `line-weight.svg`, which `scrapbook/index.html` *inlines* as a card
emoji, so `scrapbook:check` was green at base and red only after the fix.

Why this matters more than it sounds: every `CHECK_CMD` gate runs at the top of *every* review
round. A red base gate is not a nuisance, it is a guaranteed HALT after three findings, with three
rolled-back fixes and nothing to show. The cost of not checking is the whole run.

**A verification gate that can't see rendering deserves a real check.** The SVG optimization repair
rewrote 11 freshly-designed icons, and nothing in the repo asserts that an optimized SVG still
*looks* the same — `check:assets:manifest` guards bytes, which is precisely the thing being changed.
Rasterizing each icon at 384 DPI before and after and counting differing subpixels took under a
minute and turned "SVGO is presumably safe" into evidence (worst delta 4/255, zero pixels past
threshold). Generalisable: when a repair rewrites committed bytes and the only gate is a byte gate,
the gate is tautological and you need an independent one.

**CI can be *absent*, which is invisible in a way that "CI is red" is not.** Actions stopped picking
up work for the whole session — runs `queued` for hours, and the draft PR never had a run created.
The supervision guidance said "watch CI" and "a red run means pause"; neither fires when
`total_count` is 0, and a supervisor looking for a red tick sees what health looks like. The skill
now says to check the *count*, not the conclusions.

The posture question it forced: `PUSH_TEST_CMD='npm test'` is the documented substitute for the
cross-finding backstop, and the arithmetic rules it out at backlog scale (~5–6 min × 346 ≈ 35 h).
Periodic local full-suite runs — base, canary end, final head — cost three runs total and caught the
same class of thing. Recorded in the skill as the standing answer, since the temptation to reach for
the knob is strong and wrong.

**One supervisor-hygiene item, self-inflicted and worth the entry** because the failure is
structural rather than careless. Draining several pending comments "efficiently" in one shell loop
necessarily breaks the at-least-once ordering: the post is an MCP call that cannot happen inside the
loop, so the loop `done`s records it has not posted. Both posts happened to succeed, so nothing
surfaced it. The skill now names the batching shape specifically, because "call `done` after the
post" reads as already-followed while you are writing the loop.

Also generalised: the piped-exit-code trap. It was on record scoped to the e2e suite; the same
session read `npm run format:check 2>&1 | tail -5; echo exit=$?` as a pass when `tail` supplied the
0, and wrote a `cmd && echo OK || other && echo DONE` chain whose precedence prints `DONE` without
running `other`. Both fail toward green, which is the direction that matters.

Deliberately **not** changed: nothing in the driver. Every one of these is supervisor guidance or a
pre-run procedure — the loop itself behaved correctly all session, including the three red gates
(one per distinct gate: `lint:tokens` on an improvement, `check`, `lint:dead` on an orphaned export)
which each recovered or deferred cleanly. Also not done: porting this to the Codex runbook
wholesale. It got one targeted step for the base-commit check, in its own numbered idiom, because
that lesson is a fact about this repo rather than about a runner; the rest stays Claude-side until a
Codex run earns its own version.
