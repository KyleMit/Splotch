---
name: burn-down-audits
description: Drive the scripted bulk burndown of docs/AUDIT.md — one one-shot `claude -p` subprocess per role per finding (verify → implement → adversarial review → fix), orchestrated by tools/audit-burndown/ and built to run unattended. Use when the staged audit backlog is too large to vet-and-file as GitHub issues (hundreds of findings) and the user asks to burn it down in bulk, run the audit burndown, or launch/check on a run.
---

# Burn down audits

Progressive, adversarial burndown of a large `docs/AUDIT.md` backlog. Each finding goes through
verify → implement → review → fix, entirely inside one-shot `claude -p` subprocesses, so nothing
accumulates in a long-lived context window. The driver is `tools/audit-burndown/run-burndown.mjs`;
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

### The hand-driven cherry-pick — when the ask is "the easy ones"

A third mode, and the one the driver is *wrong* for: "cherry-pick the findings you could do in a
couple of minutes and leave the rest." That is a selection problem, and the driver has no selector —
it pops findings in file order and spends a full verify/impl/review cycle on whatever it gets.
Answer it by hand: index the backlog once (`findingPriority` plus body length over each entry — the
shortest P4/P5 bodies really are the mechanical ones), then work them inline, one commit per
finding, using `pop-finding.mjs` and `deleteEntryByTitle` for the excision so the file surgery stays
identical to a driver run.

Three of the driver's economics invert here, and each one cost a real mistake on 2026-08-05:

* **`npm run format:check` belongs in the gate.** It stays out of `CHECK_CMD` because ~23s × 450
  findings is three hours, and because the `format-edited-file.sh` `PostToolUse` hook covers every
  `Edit`/`Write` a role makes. Neither holds by hand: batches are few, so the cost is seconds, and a
  supervising agent reaches for `sed`/`python`/heredocs constantly — which is exactly the "editing
  through `Bash`" residual risk the hook cannot see. That is what reddened CI on that run.
* **The per-commit comments have no `comment-sync.mjs` behind them.** The driver's whole
  render→`next`→post→`done` loop exists so the SHA reaches GitHub from a tool rather than from the
  agent's memory. Writing comments by hand removes that, and 32 of 62 went out with a 7-char prefix
  padded to 12 — plausible, unlinkable, and (with this session's toolset) unrepairable except by a
  correction comment. Either drive `comment-sync.mjs` for the rendering, or verify every SHA before
  posting (see the repo's "Writing on GitHub" rule).
* **Nothing forces the adversarial second pair of eyes.** There is no blind reviewer, so a fix is as
  good as the one context that wrote it. The cheap substitute is a *negative check* on anything that
  claims to be a guard: break the source the new assertion covers and confirm the assertion goes
  red. Revert only the source file for that — `git stash` takes the fix **and** the new test with it
  and reports a cheerful pass that proves nothing.

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
lines): `tools/audit-burndown/pop-finding.mjs` is the only thing that touches it (`--count`, print,
`--peek N`, `--delete`). Role system prompts live in `tools/audit-burndown/prompts/*.md`.

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
MAX_ISSUES=5          # how many to FIX before stopping — drops/deferrals don't count (see step 4)
PUSH_EVERY=1          # push after every finding — the container is ephemeral (see below)
BRANCH=audit/burndown
CHECK_CMD='npm run check'      # per-finding type-check gate
TEST_CMD='npm run test:unit'   # per-finding fast-test gate (see the layered gate below)
E2E_CMD='npm run test:e2e -- --retries=1'  # per-finding targeted E2E (retry past flakes), UI findings only
BUNDLE_SPEC='tests/startup-bundle.spec.ts' # joins the E2E gate when a fix adds a static import under web/src; '' disables
LINT_CMD='npx eslint'          # per-finding lint gate, on the fix's changed files
PUSH_TEST_CMD=''      # local full-suite gate before a push — OFF; CI on the draft PR is the backstop
COMMENT_STORE=.audit-work/pending-comments.jsonl   # per-commit comment records awaiting your MCP post
MAX_DEFERRALS=3       # consecutive deferrals before halting
RETRIES=3             # total attempts per claude call (N-1 retries) before deferring
MODEL_VERIFY=sonnet          # verification is mostly grep-and-confirm (`sonnet` alias → Sonnet 5)
MODEL_IMPL=claude-opus-5     # pinned id, not the `opus` alias — see below
MODEL_IMPL_MINOR=sonnet      # impl model for P4/P5 findings only — see Tuning & lessons
MODEL_REVIEW=claude-opus-5
BUDGET_VERIFY=3.00    # --max-budget-usd per call; verify is code-read-heavy — see Tuning & lessons
BUDGET_IMPL=7.00      # deepest cap: multi-file extraction fix rounds exceed 4.00 finished and green
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
* **The four gates do not cover the repo's bespoke lint/drift scripts, and a ratchet fails in both
  directions.** A 2026-07-25 run reddened CI's Quality job on `npm run lint:tokens`: one finding
  hoisted AdminConsole's hex literals into `--admin-*` properties, taking its raw-hex count 49 → 34
  — and the ratchet demands the baseline come *down* to match, so **an improvement fails exactly
  like a regression**. A second finding extracted a component into a new file, carrying four hexes
  into a path with no baseline entry. Both fixes were correct; nothing in `CHECK_CMD`, `TEST_CMD`,
  `LINT_CMD` or a targeted spec can see either. Set `CHECK_CMD='npm run check && npm run lint:tokens
  && npm run gen:tokens:check'` — both ratchets cost ~0.3s each — and check `.github/workflows/` for
  any other bespoke gate before a long run.

  **Derive that list from `test.yml` each time rather than copying the one above; it grows.** By
  2026-07-28 the Quality job ran ten steps, and a run configured from this paragraph alone would
  have gated on two of them. Read the job, time each candidate, and gate on everything cheap that a
  finding could plausibly break — the whole set cost 12s end to end on that run, against a 5–35
  minute finding. Two worth calling out because their failure mode is not obvious:

  * **`npm run lint:dead` (knip)** is the highest-value addition for an audit backlog specifically.
    A `/code-audit` tail is mostly extraction, dedup, and dead-code findings, and removing the last
    caller of an export is exactly what turns knip red — a fix that is *correct* and still breaks
    CI. It is also the one gate where a red result may be pre-existing rather than caused by the
    finding, since knip reports repo-wide: run it at the base commit first, and if it starts
    producing unrecoverable fix rounds, drop it and let CI catch it.
  * **A test tier CI runs that `TEST_CMD` does not.** `npm run test:unit` is the default, but a repo
    with sibling suites (`test:tools`, `test:asset-gen`) leaves whole trees ungated — and a backlog
    that audits those trees will edit them. Add the suites that cover the areas your backlog
    actually touches.

  Whatever you choose, run the full composed `CHECK_CMD` and `TEST_CMD` **at the base commit** and
  confirm every one exits 0 before launching. That is what makes a red gate mid-run attributable to
  a finding instead of a mystery, and it takes one command.

  **Run them one at a time for this check, not `&&`-chained.** The chain short-circuits, so the
  first red gate hides every gate after it and you fix them one relaunch at a time. A 2026-08-06 run
  found `check:svg-assets` red at base, repaired it, and only then discovered `lint:dead` was red
  too — the chain had never reached it. Loop instead, and collect the whole list before repairing
  anything:

  ```bash
  for g in check lint:tokens gen:tokens:check scrapbook:check check:svg-assets check:assets:manifest lint:dead; do
    npm run "$g" >/dev/null 2>&1 && echo "ok   $g" || echo "RED  $g"
  done
  ```

### When the base commit is red — repair it, in its own commit, before launching

Not a hypothetical: it happened on 2026-08-06, and the reason is structural rather than unlucky.
`test.yml` sets `cancel-in-progress`, so a merge commit's push run is routinely **cancelled** by the
next push and never reports — the merge that reddened `main` had *no CI run at all*. **A green-
looking history is not evidence of a green base**, which is exactly why this check exists and why
"main is always green, skip it" is wrong here.

Fix it rather than working around it, and understand that this is not tidiness. Every gate in
`CHECK_CMD` runs at the top of *every* review round, so a red base gate fails every finding, burns a
fix round each, and halts the run on three consecutive deferrals having accomplished nothing. The
run is impossible until the base is green.

* **Its own commit, attributed to nobody.** A base repair is not attributable to an audit finding,
  so it must not ride inside one. Land it as the branch's first commit with a message saying what
  was already broken and why it blocks the run.
* **Re-run the *whole* chain after each repair — a repair can redden a different gate.** Fixing
  `check:svg-assets` with `npm run optimize:svg-assets` rewrote `line-weight.svg`, which
  `scrapbook/index.html` **inlines** as a card emoji — so `scrapbook:check`, green at base, went red
  *because of the fix* and needed `npm run scrapbook:index` in the same commit. Never re-run only
  the gate you just fixed.
* **A byte-level "optimization" is not self-evidently safe — prove it.** No gate in this repo
  asserts that an optimized SVG still *renders* the same, and the icons in question had landed hours
  earlier. Rasterize before and after and compare pixels rather than trusting the tool:

  ```bash
  # per file: git show HEAD:<path> vs the working copy, rendered at high DPI
  sharp(buf, { density: 384 }).resize(256, 256, { fit: 'contain' }).flatten().raw().toBuffer()
  ```

  Count subpixels differing by more than a small threshold; a pure re-serialization gives zero.
* **Prefer the minimal repair the gate itself prescribes.** knip's fix for an export consumed only
  inside its own module is to drop the `export`, not to tag a `/** @public */` seam — check whether
  the *function* wrapping it is the real API before touching either.

  Two of CI's Quality gates deliberately stay **out** of `CHECK_CMD`, and it is worth knowing why so
  the next run doesn't re-litigate it. `npm run format:check` costs ~23s (≈3 hours over a
  450-finding backlog) and is already covered: the repo's `format-edited-file.sh` `PostToolUse` hook
  is registered project-level in `.claude/settings.json`, so it fires inside the `claude -p`
  subprocesses and formats every file a role edits — confirmed by a full run whose Quality job
  passed `format:check` on every push. The residual risk is a role editing through `Bash` instead of
  `Edit`/`Write`, which CI catches. And `npm run ruler:check` **cannot** be a gate at all: it
  re-applies ruler, so it *writes* files, and a gate that mutates the tree mid-finding would land in
  the fix commit. A finding that edits any `.ruler/` source must run `npm run ruler:apply` itself
  and commit the regenerated output in the same commit — several did, unprompted, but nothing
  enforces it.
* **Bundle composition gets its own conditional gate, because no other gate can see it.** A fix that
  adds a static import edge under `web/src` can re-partition Rollup's chunks however small the
  imported module, and the fallout lands in a chunk the fix never touched — PR 771's one CI
  regression was a six-line predicate hoist that pulled the save pipeline onto the startup critical
  path, red only on `startup-bundle.spec.ts` with a failing marker naming a module the commit never
  edited, attributable only by `git bisect`. The driver now scans the range's diff at each review
  round and, when it adds a static import / re-export in a client-bundle file (type-only imports,
  server modules, and tests excluded — `diffAddsClientStaticImport` in `lib/burndown-core.mjs`),
  appends `BUNDLE_SPEC` (default `tests/startup-bundle.spec.ts`) to that finding's E2E gate. The
  cost is a production build per import-adding finding, paid via Playwright's web server; set
  `BUNDLE_SPEC=''` to fall back to CI-only detection if a backlog makes that too slow.
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

A deferral now names the role that actually failed: `fix broke the test suite` / `fix broke a
targeted E2E spec` / `fix introduced a lint violation` / `fix broke the type-check` for a gate that
never went green, `implementer failed to deliver a fix round`, `reviewer unavailable`, and `failed
adversarial review` **only** when a reviewer genuinely rejected the work.

### Per-commit PR comments

Each fix gets its own PR comment — the finding (issue), the implementer's own summary (how it was
solved), and any adversarial catch the reviewer forced before approval — so the PR reads as a
per-commit history rather than a batched dump. `tools/audit-burndown/lib/comment-sync.mjs` renders
them (unit-tested in `tools/audit-burndown/tests/comment-sync.test.mjs`). Deferrals and drops stay
in the commit log only (they carry their reason in the commit message).

**The driver writes these records; you post them.** The instant a fix lands, one JSON line is
appended to `COMMENT_STORE` (default `.audit-work/pending-comments.jsonl`) — written immediately
rather than held in memory until a push, because an earlier version accumulated them in an array and
a kill between two pushes took every reviewer catch since the last one with it. Then, as often as
you can be bothered (and always at wrap-up), drain the store:

1. `node tools/audit-burndown/backfill-comments.mjs next` — prints `SHA <sha>` then the rendered
   body.
2. Post it with `mcp__github__add_issue_comment` on the PR number, appending the Claude Code
   attribution footer.
3. `node tools/audit-burndown/backfill-comments.mjs done <sha>` — drops that record.
4. Repeat until `next` says nothing is pending.

`done` comes **after** the post, deliberately: a crash between the two re-offers the same record, so
the loop is at-least-once. A duplicate comment is a triviality; a silently dropped one is the
reviewer's only written catch, gone.

**Batching several records inverts that ordering without you noticing.** The natural way to drain a
backlog of them is one shell loop that prints each record and calls `done` — but the post is an MCP
call you cannot make from inside a shell loop, so the loop necessarily `done`s a record it has not
posted, and the at-least-once property is gone for the whole batch. A supervisor did this on
2026-08-06; both posts happened to succeed, so nothing surfaced it. Batch the *reads* if you like,
but keep one `done` per confirmed post, after that post returns.

**Check every SHA the role wrote into its own prose — `git rev-parse --verify` is not the check.**
The renderer's heading SHA is always right, but a fix that went through a review round routinely
narrates its work ("committed as `<sha>`", "the handles from commit `<sha>` are untouched"), and
that SHA is the implementer's **pre-amend** commit. The driver amends the `docs/AUDIT.md` excision
into it, orphaning the object the role named: it still resolves locally, so `rev-parse --verify`
happily confirms it, but it was never pushed and renders as dead plain text on GitHub. Roles also
abbreviate to 7 characters where the heading uses 12, which is the width-mixing trap in the repo's
"Writing on GitHub" rule. Reachability is the check that catches both:

```bash
full=$(git rev-parse --verify --quiet "$sha^{commit}") \
  && git merge-base --is-ancestor "$full" HEAD && echo "OK ${full:0:12}" || echo "ORPHAN/BAD $sha"
```

A 2026-08-06 run needed this on 3 of ~15 fix-round comments. When a cited SHA is an orphan, the
landed commit is the record's own heading SHA — swap it in and say so, rather than deleting the
sentence: the narration is usually load-bearing (which of several commits did what).

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
>
> **The canary is a separate run, so it is the usual victim of that restart — and `capture` cannot
> rebuild its comments.** A normal session runs a 5-finding canary and then the full run, which
> starts again at `iter0001` and overwrites the canary's first five envelopes. `capture` then reads
> the *full run's* reviewer catches and attributes them to the *canary's* commits. Confirmed on
> 2026-08-07 by re-capturing into a temp `COMMENT_STORE`: three canary fixes came back carrying the
> catches of the full run's same-numbered iterations, each individually plausible. The canary's own
> posted comments are correct because they were drained live, before the overwrite — so **never
> re-run `capture` to "repair" a canary comment**; it replaces a right record with a wrong one. The
> closeout `skipped N already posted` check is still sound, since `POSTED` dedupes by sha.
>
> **Within one run the tag counts outcomes, not fixes.** It is `iter${done + dropped + deferred +
> 1}`, so a fix, a drop, and a deferral all advance it and no two findings in a run share a tag or
> overwrite each other's envelopes. Across runs it is still not a finding identifier — the restart
> above is what breaks that — so correlate by the `run.log` line and its timestamp, not by iteration
> number.

**Never wrap a SHA in backticks in GitHub-bound text.** GitHub's native linker turns a bare
plain-text commit SHA into a link to that commit (rendered as a short, hoverable reference); inside
a code span it stays dead monospace text, which is exactly the wrong outcome for a comment whose job
is to point at a commit. The renderer emits the heading as `### <sha12> — <title>` for that reason,
and a unit test pins it. The same applies to any SHA you write by hand into a PR body, PR comment,
or issue comment — leave it bare. (Backticks around *file paths and spec names* are still correct;
this is only about SHAs.)

## Before the full run

1. `npm run audit:preflight` — fix anything red. **Check `BRANCH` first**: it defaults to
   `audit/burndown`, but a cloud session is usually told to develop on a specific `claude/<topic>`
   branch, and the driver silently uses the default otherwise. If you override it, the override must
   ride on *every* relaunch — put it in the durable checkpoint (step 2), not just in the shell you
   happen to be in. Preflight echoes `branch: <name>` back; **read that line and match it against
   the branch the session was assigned** rather than assuming the export took. Getting this wrong is
   not a tidiness problem: the run's commits land on a branch nobody is watching, the PR you opened
   tracks a different head, and every per-commit comment has nowhere to go.

   The cloud session's own instructions name the branch to develop on, and a `SessionStart` hook may
   independently suggest a `feat/*` convention. Those can disagree. The assigned `claude/<topic>`
   branch is the one to use — it is what the task was set up against.
2. **Write the durable checkpoint and commit it to the branch** — the relaunch command with every
   override, the closeout tasks, roughly what's done (see **Surviving the context window**). It has
   to be written anyway, and doing it now solves the ordering problem in step 3.
3. **Open the draft PR** with `mcp__github__create_pull_request` (`draft: true`, head = `BRANCH`)
   and keep the number to hand: the driver will not create one, and without it the per-commit
   comments have nowhere to go and CI — the only full-suite gate in this configuration — never runs.

   **A PR needs a diff.** A freshly-forked branch is identical to `main`, and GitHub refuses to open
   a PR with no commits between them, so this cannot be the literal first step however much the
   ordering suggests it. Committing the checkpoint in step 2 is what gives the PR something to open
   against. (Opening it after the canary's first push works too, but then the canary's commits land
   with no CI and no PR to comment on.)
4. **Canary:** `npm run audit:burndown` and read the commits it makes. It stops at **5 fixes, not 5
   findings** — `MAX_ISSUES` gates the `done` counter and neither a deferral nor a drop increments
   it, so a canary that defers twice processes seven findings and takes proportionally longer. —
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
   * **A fix that moved a goalpost instead of clearing it.** The gates are deterministic, so the
     cheapest way past a binding one is to edit the gate — raise an eslint `max-lines` cap, widen a
     ratchet baseline, add an allowlist entry. Each such edit is individually defensible (the module
     genuinely grew) and lands green with the rationale written into the commit, so nothing flags
     it. Over a backlog it is corrosive: a cap that yields whenever it binds has stopped
     constraining anything. `git log <base>..HEAD -- eslint.config.js` and the equivalent for each
     ratchet's baseline file is a two-second read; do it on the canary and again at wrap-up, and
     judge the **rate**, not the instance. On 2026-07-29, 3 of 43 findings raised a `max-lines` cap.
     The right repair is usually the one the reviewer eventually forced on the fourth: extract the
     shared helper the file was duplicating, which drops it back under the *default* and lets the
     grandfathered override be deleted outright rather than raised.
5. **Count the backlog entries each commit deleted — it must be exactly one.** The canary's own diff
   hides this: `':(exclude)docs/AUDIT.md'` is what makes the code readable, and it is also what
   hides a finding being destroyed. Check it separately:
   ```bash
   for sha in $(git rev-list --reverse main..HEAD); do
     echo "$(git log -1 --format='%h %s' $sha | cut -c1-70) removed=$(git show $sha -- docs/AUDIT.md | grep -c '^-### ')"
   done
   ```
   A `removed=2` means that commit deleted its own finding **and** an unrelated one that was never
   verified, implemented, or reviewed — gone from the backlog with no record it ever existed.
   Recover it from the pre-run file (`git show <base>:docs/AUDIT.md`) and re-file it before
   continuing. A `removed=0` on a non-final commit is normal (a fix round commits before the driver
   amends the excision in); judge per finding, not per commit. The driver now deletes by title so
   this should be structurally impossible — check anyway, because the first time it happened it hit
   three of five findings and nothing in the log or the run's counts said so.

   **A commit's `Audit:` trailer routinely does not match the title the `iter` line announced, and
   that is not a symptom of anything.** The verifier rescopes and retitles a finding as part of
   producing the brief, and the trailer carries *its* title — so an iteration announcing a
   two-module dedup can commit as `Audit: [<one module>] …`. It reads exactly like the commit
   consumed the wrong entry. Do not go diagnosing it from the titles: `git show <sha> --
   docs/AUDIT.md | grep '^-### '` prints the entry actually deleted, and the `removed` count above
   is the real invariant. What the mismatch *can* legitimately signal is a **narrowed scope** — a
   finding naming two modules, fixed in one, entry consumed — so read the fix's own summary for
   whether the narrowing was deliberate (the implementer says so, e.g. "left `X` untouched per the
   brief's scoping call") before deciding anything was lost.
6. **Confirm the resume handoff actually fired.** Extra rounds happen on their own — a typical run
   logs `round 1: changes required` (a reviewer rejection) or `round 1: gates red — …` (a red gate,
   which is now also a recoverable round) every few findings — so read one instead of staging one.
   Find either line in the canary's log, open that iteration's `fix1.json`, and confirm the resumed
   implementer references its own earlier work rather than re-deriving the change from the feedback
   text. That handoff is the whole design. Only if the canary produced no extra round at all is it
   worth forcing one with a deliberately vague brief.
7. **Check CI on the canary's pushes, and do not launch the full run until it is green.** The
   cheapest step here and the easiest to skip, because every per-finding gate passes and the run log
   says nothing. `PUSH_TEST_CMD` is empty by design, so CI is the *only* thing running the repo's
   bespoke gates, and the canary is the first moment a breakage in them is visible. Launch over a
   red canary and every later finding lands on a broken base. A 2026-07-25 run went red on its first
   canary commit and stayed red through ten more; nothing surfaced it until closeout.
8. `npm run audit:cost` — multiply the per-issue average by the backlog before committing to a full
   run. Sanity-check the **wall-clock** as well as the dollars: per-issue elapsed × the backlog is
   what decides whether this is one overnight run or a multi-day campaign needing a live session for
   each relaunch. At ~9 min/finding a 468-finding backlog is ~70 hours, not a night.
9. `npm run audit:burndown:overnight -- 600`.

## While it runs

* Stop gracefully with `touch .audit-work/STOP` (exits after the current finding; `rm` it before
  resuming). Stop hard with `pkill -TERM -f 'claude -p'`.
* **Never edit a tracked file while the driver is running.** Its rollback paths run `git reset -q
  --hard <baseSha>`, which wipes uncommitted working-tree edits with no warning and no reflog entry
  — and at a realistic deferral rate that fires within the hour. Committing mid-run is worse: you
  are racing the driver's own `git commit`/`--amend` on the same branch. If you find a bug in the
  driver worth fixing now, **pause first** (`touch .audit-work/STOP`, wait for exit), then edit.
  Writing to `.audit-work/`, to memory, or to a scratchpad is safe — those are outside the reset's
  blast radius.

  **The same hazard applies to your *own* `git reset --hard`, at any time — including after the run
  has ended.** A closeout session used one to roll back a one-off probe commit and silently
  destroyed a half-finished set of uncommitted doc edits. If you are holding uncommitted work,
  commit or stash it before any hard reset, and prefer `git reset --soft HEAD~1` when all you want
  is to undo a commit.

  **"Editing a tracked file" includes running a command that writes one.** The obvious reading of
  this rule is about `Edit`/`Write`, so a read-sounding verification command slips past it: `npm run
  ruler:check` runs `dprint fmt` and formats the tree, and `npm run gen:tokens` /
  `gen:assets:manifest` regenerate committed output. Run one mid-finding and its writes land inside
  the driver's in-flight fix commit, attributed to a finding that never touched them. A 2026-08-06
  supervisor ran `ruler:check` to confirm a fix's `ruler:apply` had taken; it was a no-op only
  because the tree happened to be clean already. These are excluded from `CHECK_CMD` for exactly
  this reason — the exclusion is about the command being mutating, not about where it runs, so it
  applies to you too. CI's Agent-file drift job is the safe place to learn the same thing.

  **This rule binds *you*, not the roles — do not flag an implementer for running it.** The hazard
  is that a *supervisor's* writes land in a commit the driver is building; a role's writes belong to
  its own commit, which is the whole point of the commit. An implementer that edits a `.ruler/`
  source is in fact **required** to run `npm run ruler:apply` and commit the regenerated output (see
  the `CHECK_CMD` exclusions above). A 2026-08-07 supervisor read the sentence above as universal
  and flagged two findings for running `ruler:check`, then had to retract it on the PR when a third
  correctly regenerated both mirrors after editing a Ruler source. Before flagging one, check what
  the commit actually touched: writes confined to the finding's own files are the system working.
* **A session hook will nag every turn that the commits are unsigned. It is a false positive —
  ignore it.** Verified 2026-07-25 by reading the commit objects: they *do* carry `gpgsig -----BEGIN
  SSH SIGNATURE-----`. Signing is delegated to `gpg.ssh.program=/tmp/code-sign` (a
  session-provisioned symlink to the environment manager), and it works. What fails is *local
  verification*: `gpg.ssh.allowedSignersFile` is unset, so `git log --format=%G?` cannot check an
  SSH signature and reports `N` — which the hook reads as "missing signature". The identity is also
  already correct (`Claude <noreply@anthropic.com>`), so neither half of its advice applies.

  The 0-byte `~/.ssh/commit_signing_key.pub` that `user.signingkey` points at is a placeholder the
  signing program ignores; it is **not** the cause, and an earlier version of this runbook said it
  was. Don't re-derive that story from the file's size — check `git cat-file commit HEAD | grep
  gpgsig`.

  **Never act on the suggested remedy during a run.** `git commit --amend --reset-author` and `git
  rebase --exec …` fix nothing here, and both rewrite history the driver is actively committing onto
  — an amend races its own `--amend`, and a rebase would orphan every pushed fix and demand a
  force-push. Say so once and move on.
* **The stop hook's "uncommitted changes" warning is expected while a finding is in flight.** The
  dirty tree is the implementer's work-in-progress and the unpushed commit is the finding's own; the
  driver commits and pushes when it completes. Committing them on the hook's behalf corrupts the
  finding.
* Transient API failures are retried with exponential backoff; a budget/turn cap is treated as a
  real answer and deferred, not retried. That is right for verify and impl (a cap means the role
  could not finish its work) but read the reviewer's cap differently: it produced *no verdict*, so
  the finding is deferred `reviewer unavailable`, never "failed adversarial review". Three
  *consecutive* deferrals halt the run — that shape means something systemic (auth, disk, a red
  tree), not three unlucky findings.

  **One systemic cause confirmed live (2026-07-26): lost workspace trust.** A container event
  mid-run reset `hasTrustDialogAccepted` to `false` for the project in `/root/.claude.json`, and
  every `claude -p` subprocess launched after that point errored immediately regardless of role —
  each `.err` log showed the identical `this workspace has not been trusted` warning, and the
  envelope was `is_error: true, total_cost_usd: 0, iterations: [], terminal_reason: "api_error"`.
  The driver still labeled these `implementation failed` / `verifier unavailable`, because that is
  the correct label from its point of view — nothing in the schema distinguishes "the role judged
  the work" from "the role never got to run." **Before treating a HALT as three unlucky findings,
  check the `.err` files for the failed iterations** (`.audit-work/logs/iter*.err`) — a shared,
  non-model error string across all three is the tell. If it's this cause specifically, confirm
  `projects["<repo-path>"].hasTrustDialogAccepted` in `/root/.claude.json` (that file lives outside
  the repo and outside a supervising agent's usual permission scope — this may need the human
  operator) before relaunching, or the resumed run halts on the identical pattern immediately.
* **Watch CI, not just the run log.** With no local full-suite gate, a red CI run on the draft PR is
  the only signal that one finding broke something another finding's targeted specs don't cover.
  Check it when you drain comments; treat a red run as a reason to pause and diagnose rather than
  something to sweep up at the end, because every finding after it lands on a broken base.
* **Distinguish "CI is red" from "CI never ran" — the second is invisible and this runbook assumes
  it away.** On 2026-08-06 GitHub Actions stopped picking up work for the repo for an entire
  session: runs sat `queued` for hours and the draft PR had **no run created at all**. Nothing goes
  red, nothing alerts, and a supervisor watching for a red tick sees exactly what a healthy run
  looks like. So check `total_count`, not just conclusions — `mcp__github__pull_request_read` with
  `get_check_runs` returning `{"total_count": 0}` after a push is the tell, and
  `mcp__github__actions_list` showing runs `queued` for hours across *other* branches confirms it is
  the runner pool rather than your PR.

  This is an annoyance, not a reason to stop — the commits are pushed and are the durable artifact —
  but the posture changes, so say so explicitly rather than carrying on silently. The per-finding
  gates still hold; what is gone is the cross-finding backstop.

  **Do not reach for `PUSH_TEST_CMD='npm test'` to replace it.** That is the documented substitute
  and the arithmetic kills it at backlog scale: ~5–6 min per finding over a few hundred findings is
  tens of extra hours. Run the full suite **locally at intervals** instead — at minimum at the base
  commit, at the end of the canary, and at the final head before marking the PR ready — and re-check
  CI each time you drain comments, since a recovered CI backfills coverage on the next push. A
  2026-08-06 run did exactly this and CI recovered at the final push, green.
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
counts, run state, and — when a finding is in flight — the two elapsed figures it prints (`in-flight
<elapsed> <finding>` and `current claude call <etime>`). Then **gut-check the duration** against
these norms (from real runs on this repo):

| Signal                                       | Normal   | Watch     | Investigate |
| -------------------------------------------- | -------- | --------- | ----------- |
| whole finding (`in-flight`)                  | ≤ 15 min | 15–25 min | > 25 min    |
| single `claude` call (`current claude call`) | ≤ 10 min | 10–15 min | > 15 min    |

Verify is ~150s; impl/review are the long poles; an E2E-gated finding runs longer. Budget and turn
caps normally terminate a runaway call on their own near these ceilings. **Priority skews this
hard** — with `MODEL_IMPL_MINOR` tiering on, P4/P5 findings land in 3–5 min while a P1 refactor that
takes two fix rounds runs 20–30 and is still healthy. Check the finding's `[P<n>]` tag before
reading a duration as slow; the table above describes a mid-priority finding, not every finding.

Measured under the current defaults (2026-07-25/26, cloud, `EFFORT_*` and gate reordering in place),
across two runs totalling 18 findings — still a small sample, so treat this as shape rather than
distribution:

| Finding shape                 | Elapsed      |
| ----------------------------- | ------------ |
| dropped at verify (`INVALID`) | 25 s–1.5 min |
| P4/P5, no fix round           | ~4 min       |
| P4/P5, one fix round          | 8–12 min     |
| P3, one fix round             | ~11 min      |
| P2, one fix round             | 10–18 min    |
| P2, two fix rounds + E2E gate | ~26 min      |
| P1, no fix round              | ~8.5 min     |
| P1, two fix rounds            | 23–26 min    |

**A P1 is not automatically slow** — the P1 that cleared review first time beat several P2s. Round
count dominates priority, so read a long elapsed as "probably in a fix round", not "probably a big
finding". A P1 that reaches `round 3: changes required` is the one shape that reliably runs past 25
minutes and can still end in a rollback.

**Category skews it as hard as priority does, and the table hides that.** An `[Architecture]`
finding that moves a subsystem into a new module runs 15–30 min at *any* priority: the fix is a
large mechanical diff, it usually drags stale cross-references (comments, ADRs, the architecture
skill's source map) that the reviewer then catches one at a time, and it is the shape most likely to
take two or three rounds. The 2026-07-29 run had extraction findings land healthily at 17, 20, 29
and 29.5 min, every one of which would have tripped the `> 25 min` investigate threshold above.
Before reading a duration as slow, check the category alongside the `[P<n>]`: an extraction or
module-move at 25 min is ordinary, whereas a `[Readability]` rename at 25 min genuinely is not.

The headline: **fix rounds dominate, and priority sets how many you get.** A finding that clears
review first time lands in a third the wall-clock of one that doesn't, at the same priority. The
26-minute P2 above was entirely healthy — it would have tripped the `> 25 min` investigate
threshold, which is why the priority caveat above the table is doing more work than the table
itself. No `claude` call in the sample exceeded ~13 min.

* **Within normal** → just report it; do nothing.
* **Watch band (maybe too long)** → don't intervene yet. Schedule **one** re-check a few minutes out
  and see whether it *advanced*. Run it as a background job so it reports back on its own:
  ```bash
  before="$(ls .audit-work/logs | wc -l)"
  sleep 300
  after="$(ls .audit-work/logs | wc -l)"
  [ "$before" = "$after" ] && echo "STALLED: no advance in 5m" || echo "ADVANCED"
  ```
  Advanced → all is well. Still identical → treat it as *investigate*.

  **Count envelopes, not HEAD or `run.log` — you write to both of those.** An earlier version of
  this check compared `git rev-parse HEAD` and `wc -l < run.log`, and reported a confident
  `ADVANCED` for a driver that had been dead for half an hour: draining one PR comment appends a
  `posted per-commit comment` line to `run.log`, and any `git reset`/commit of your own moves HEAD.
  The supervising agent shares both surfaces with the driver, so both are worthless as liveness
  signals the moment you touch them. The `logs/` directory is written **only** by role calls.
* **Investigate (too long)** → decide whether remediation is warranted before acting. Check whether
  the current `claude` child is alive and *working* (`ps -o %cpu,etime -p <pid>`; is its role
  `.audit-work/logs/*.json` still growing?) versus hung (0% CPU, static log and envelope). A
  genuinely stuck call: `pkill -TERM -f 'claude -p'` kills only that one call — the driver's
  `RETRIES` re-attempt it or the finding defers; the orchestrator and every committed fix are
  untouched and state stays durable. Never kill `run-burndown.mjs` itself for a merely slow finding.

  **`pkill -f` will also kill the shell you typed it in.** The pattern matches whole command lines,
  and your own `bash -c` wrapper contains the pattern — so the command reports a nonzero exit
  (`144`) and takes any background waiter whose command line also mentions it. Read that exit code
  as "I shot my own shell", not "the kill failed", and re-verify with a separate `pgrep -af
  run-burndown.mjs | grep -v 'bash -c'`.

  **The same self-match makes `pgrep` wait loops hang forever.** The obvious way to wait for a clean
  stop — `until ! pgrep -f 'audit-burndown/run-burndown.mjs' >/dev/null; do sleep 15; done` — **can
  never exit**: the loop's own command line contains the pattern, so it matches itself and waits on
  its own death. It looks exactly like a driver that will not stop, and it will still be "waiting"
  long after the run has finished. Anchor the pattern so only the bare driver process matches:
  ```bash
  until ! pgrep -f '^node tools/audit-burndown/run-burndown.mjs' >/dev/null; do sleep 15; done
  ```
  `env` execs node, so the real driver's cmdline starts with `node` and the anchor is safe on every
  launch path. The same anchor is what to use for the plain liveness question — an unanchored `pgrep
  -f` answering "still running" is meaningless until you have read the matched lines.

* **No `claude -p` child at all, while `run-burndown.mjs` is still alive** → the driver is
  **orphaned**, and this is the one case where killing the orchestrator is correct. It happens when
  the container restarts without being reclaimed: the disk and the Node process survive, its
  in-flight child does not, and the driver waits forever on a process that will never report. The
  signature is specific — `pgrep -f 'claude -p'` returns nothing but the supervising session's own
  CLI, no new envelope for tens of minutes, HEAD frozen, and **no log line of any kind**, so an
  event-driven monitor stays silent and reads exactly like a healthy long finding. Confirm with the
  envelope count above, then `pkill -TERM -f 'audit-burndown/run-burndown.mjs'`, `git reset -q
  --hard origin/<branch>` to drop the half-done finding (its `docs/AUDIT.md` entry was never
  removed, so the finding is intact and will be re-processed), and relaunch from the durable
  checkpoint.

### "pause" — stop cleanly after the current finding

`touch .audit-work/STOP`. The driver checks it at the top of each iteration, so it **finishes the
entire in-flight workflow** — verify → implement → review → gates → commit, and the exit flush
pushes — then exits without starting the next finding. Wait for the process to exit, then confirm
the end state is resumable: no `run-burndown.mjs` / `claude -p` process left, `git rev-parse
HEAD` == `origin/<branch>` (nothing unpushed), the comment store drained onto the PR, and the
durable checkpoint (memory / handoff) reflecting the new counts. **Leave the STOP file in place** —
it holds the pause; a stray relaunch would exit immediately. Stand down any run-log monitor while
paused.

### "resume" / "continue" — start the next finding

Only after verifying **nothing is already in flight**: `pgrep -f audit-burndown/run-burndown.mjs`
must be empty (if it isn't, the run is already going — say so, don't launch a second). Read the
matches rather than counting them: `pgrep -f` matches whole command lines, so the launcher's `env …
node …` wrapper — and any shell whose own command line happens to mention the path, including the
`pgrep` call you just typed — matches too. Only a bare `node tools/audit-burndown/run-burndown.mjs`
line is the driver. Then `rm .audit-work/STOP`, relaunch with the exact command from the durable
checkpoint, and re-arm the event-driven monitor. The launcher self-recovers even in a brand-new
session that never saw this run — see **Resuming a crashed run** below.

**Re-arm the monitor as part of the relaunch** — stopping the previous one first, and confirming the
new one caught. Both failure directions and the arming details are under **Surviving the context
window**; the tell that you stacked two instead of replacing one is every event arriving twice.

### "wrap up" — finalize now and mark the PR ready

Terminal, unlike pause. `touch .audit-work/STOP` so the in-flight finding still lands (don't waste a
nearly-done fix), wait for exit, then run **Closing out a run** below: push anything unpushed, drain
the comment store, add the `docs/AUDIT-LOG.md` entry, tidy any emptied `## Source:` sections, and
mark the PR ready (`mcp__github__update_pull_request` with `draft: false`). The backlog may still
hold findings — that's expected; wrap-up ships what's done and closes the run out.

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

  **A checkpoint you find is not necessarily about the run you are starting.** These packets outlive
  their run: a handoff whose PR already merged still sits in `docs/handoff/` describing a backlog
  that no longer exists, and a fresh `/code-audit` re-stages `docs/AUDIT.md` from scratch — so its
  branch, PR, and "N remaining" can all be confidently, invisibly wrong. On 2026-07-28 the packet on
  disk said 183 findings remained while preflight counted 642, because the packet's PR had merged
  the day before and a new audit had since staged a whole new backlog. **Reconcile before trusting
  anything in it**: check the packet's PR state (merged/closed → the packet is spent), and compare
  its remaining-count against `pop-finding.mjs --count`. A disagreement means the packet describes a
  *different* run, not that the count drifted. Delete a spent packet as part of your first commit —
  carrying its still-owed follow-ups forward — rather than leaving the next session to re-litigate
  the same contradiction.
* Keep the supervising context small so it lasts: monitor the run **event-driven** — not by polling
  `audit:status` in a loop, and don't read per-finding logs or the PR back unless you're diagnosing
  something specific. Watch for every terminal *and* degraded state, so silence really does mean
  "healthy and working":
  ```bash
  tail -f -n 0 .audit-work/logs/run.log | grep -E --line-buffered \
    "HALT|hit a cap|red at batch|red on the final|push failed|WARNING|no impl session|DEFERRED|INVALID|finished:|iter"
  ```
  `push failed` matters as much as a halt: the run keeps committing perfectly well against a remote
  it cannot reach, and every commit it makes after that is unprotected. A run that ends that way
  logs `WARNING: <n> commit(s) not on origin` and exits non-zero — the `finished:` line still
  prints, so the warning and the exit status are the only things separating that run from a healthy
  one, and the commits it names exist nowhere but the container. `no impl session` means a fix round
  lost the resume handoff and re-derived the change from review text — one such line is tolerable, a
  pattern of them means the session minting is broken again.

  **`INVALID` is what a drop looks like — the word "dropped" never appears.** The driver logs the
  verdict verbatim (`INVALID: <reason>`) and only reports `dropped` in the closing `finished:`
  tally, so a filter without it stays silent through every drop. That silence is easy to misread as
  progress, and the `iter` lines will not break the tie for you: the tag counts every outcome
  (`done + dropped + deferred + 1`), so a drop advances it exactly like a fix does and the sequence
  of tags alone never says which one happened. Read the verdict rather than inferring it from the
  tags or the falling remaining-count. Worth watching because a drop is the one unrecoverable
  outcome: it deletes a finding permanently, so a wrong `INVALID` is the only mistake this loop
  makes that nothing downstream can catch.

  **Arming it in the same breath as the launch does not work, and fails silently-ish.** A fresh
  container has no `run.log` until the driver's first write, and `tail -f` on a missing file exits
  `1` immediately — so the monitor is dead before the run produces a line, and every "healthy
  silence" that follows is nothing of the sort. Wait the file out first:
  ```bash
  until [ -f .audit-work/logs/run.log ]; do sleep 5; done
  tail -f -n +1 .audit-work/logs/run.log | grep -E --line-buffered "…"
  ```
  Use `-n +1` on that first arm so the lines written between launch and arm are not skipped; `-n 0`
  is right for every later re-arm, which is closing a gap you cover separately (below).

  Whatever you arm, **confirm it is actually armed after every relaunch**, and stop the previous one
  first. This is not hypothetical bookkeeping: a `Monitor` clamps to a 30-minute timeout no matter
  what you request, so a long run silently outlives its own monitor, and the silence that follows is
  indistinguishable from a healthy run.

  **Budget for re-arming roughly every half hour, for the whole run.** `persistent: true` and a
  one-hour `timeout_ms` are both accepted and both ignored — the monitor still reports `timeout
  1800000ms` and dies on schedule. Treat the `[Monitor timed out]` event as a routine chore, not an
  incident: stop the old task if it is somehow still listed, re-arm the identical command, and then
  **close the gap** — `tail -f -n 0` starts from the end of the file, so anything written between
  death and re-arm is never reported. One scoped catch-up read covers it:
  ```bash
  awk '/starting — target/{f=1} f' .audit-work/logs/run.log | grep -E "iter|DEFERRED|INVALID|finished:|HALT" | tail -4
  ```

  **Do not infer elapsed time from a monitor's lifecycle.** A timeout fires 30 minutes after the
  monitor was *armed*, which has nothing to do with when the current finding started; reading it as
  "this finding has run 30 minutes" manufactures an investigate-band alarm out of a three-minute-old
  P4. Take elapsed from `date` against the finding's own `iter` timestamp, or from `audit:status`.

  **Bare `sleep` in a foreground shell is blocked** — a `sleep N && check` one-liner is rejected
  outright. Use `run_in_background: true` for a fixed wait that reports back once, or a `Monitor`
  with an `until` loop to wait on a condition.

## Resuming a crashed run (or a brand-new session)

The whole run is reconstructable from git + the draft PR + `docs/AUDIT.md`, so a session that dies
mid-run — or a completely fresh container with no `.audit-work/` at all — can pick up exactly where
it stopped. **If the container survived, start by reading `.audit-work/compact-snapshot.md`** (see
above) — it carries the launch command verbatim, which is the one thing the git/PR/`AUDIT.md` triad
cannot tell you. `.audit-work/launch-command` carries the same string, but note **the driver writes
it after its startup reconciliation, not when the launcher spawns** — so reading it in the seconds
after a launch returns the *previous* run's command, which looks like a live one and can differ in
`MAX_ISSUES`. Check its mtime against the run's `starting — target` line before believing it. Then
relaunch with the unattended launcher (`npm run audit:burndown:overnight -- <n>`), which sets
`RESUME=1`; startup then reconciles state before touching a finding:

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

A container that died also lost every comment record you had not posted. `backfill-comments.mjs
capture` rebuilds them from the pushed commits, but only for what is still reconstructable from
`run.log` and the role envelopes — both of which died too. In practice: what you did not post before
the container went, you write from the commit diffs or not at all.

## Tuning & lessons

Notes from real runs — set these before a large run rather than discovering them at 3am:

* **Verify is the slowest role and the main halt risk.** It reads a lot of code to confirm a finding
  at HEAD (~150s median on this repo) and occasionally needs more than $1. The old
  `BUDGET_VERIFY=1.00` clipped complex findings (`error_max_budget_usd` → deferral), and a cluster
  of those nearly tripped the three-consecutive-deferral halt. Default is now `3.00`; don't drop it
  below ~$2.50 for a big run. `BUDGET_REVIEW` was raised from `2.00` to `3.00` for the same reason:
  a cap mid-verdict costs the *whole finding*, since the fix rolls back unreviewed. A budget knob
  set too tight doesn't save money — it converts finished work into a deferral and pays for it again
  on the re-run. `BUDGET_IMPL` learned the same lesson on the 2026-08-05 canary: a three-component
  extraction hit exactly `$4.0036` on its fix round with the work finished and every gate green,
  while every other role call stayed under `$2` — the default is now `7.00`, sized for the
  multi-file extraction fix rounds a `/code-audit` tail is full of. The turn caps have the same
  failure shape as the dollar caps and no knob: both turn-cap deferrals on that run landed on
  sweeping multi-file findings, so expect the deferral pile to skew toward the widest findings and
  triage them as budget casualties, not hard problems.
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
  5, so verify stays on the alias. When a newer opus lands, re-probe (`claude -p --model <id>
  --output-format json 'ok'` → check `modelUsage`) and bump the pin.
* **Impl-model tiering is on by default, scoped to P4/P5.** Much of a `/code-audit` backlog is
  trivially mechanical (P4/P5 dead-code, rename, dedup), so the driver routes those findings to
  `MODEL_IMPL_MINOR` (default `sonnet`) and keeps P1–P3 on `MODEL_IMPL`. The Opus review still gates
  every fix, so the cheaper model buys wall-clock at a sliver of impl-correctness margin exactly
  where the stakes are lowest. `findingPriority` in `lib/burndown-core.mjs` (unit-tested) reads the
  priority from either staging format — a leading `[P<n>]` **title** tag, or a `**Priority:** P4`
  **body** line, which is what the whole-repo code-audit writes while tagging titles by category
  (`[Maintainability] …`). A finding stating neither is unknown and stays on the stronger model. Set
  `MODEL_IMPL_MINOR=claude-opus-5` to switch tiering off for a run where correctness dominates.
  Bigger throughput (parallel git worktrees per finding) is a real redesign, not a knob.

  **Confirm tiering actually fires before a long run — its failure is silent.** The driver logs
  `impl model: …` only when tiering *fires*, so a backlog whose priorities it cannot parse looks
  exactly like one with no P4/P5 findings, and every mechanical finding quietly bills the expensive
  model at `EFFORT_IMPL=high`. That is what a 2026-07-28 run hit: 642 findings, every one of them
  routed to Opus, discovered only by reading a canary title and noticing it had no `[P<n>]` tag. A
  staging format is free to move the priority again, so check the backlog parses rather than
  assuming — the fastest read is to run `findingPriority` over the whole file and confirm no entry
  scores `null`:

  ```bash
  node -e "import('./tools/audit-burndown/lib/burndown-core.mjs').then(({findingPriority})=>{
    const b=require('fs').readFileSync('docs/AUDIT.md','utf8').split(/^### /m).slice(1);
    const n=b.filter(x=>findingPriority(x.split('\n',1)[0],'### '+x)===null).length;
    console.log(b.length+' findings, '+n+' with no parsable priority');
  })"
  ```
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
* **Retries keep a flake from *failing* the gate; they do nothing about what it costs. Fix a known
  flake before the run, not after.** This is the one defect class whose price is multiplied by the
  backlog: a pre-existing flake in a commonly-gated spec is re-hit by every UI-touching finding for
  the rest of the run, and each one pays for it three times over — the retried spec's wall-clock, an
  implementer that stops to diagnose a failure it did not cause, and the review round it burns
  arguing the point. The 2026-07-28 canary watched its very first finding do exactly that: the
  implementer independently reproduced a `multitouch.spec.ts` readiness flake against a reverted
  working tree to prove it was pre-existing — correct, thorough, and pure waste to repeat 400 more
  times. `--retries=1` actively hides this, because the gate goes green and the run logs nothing.

  So treat the flake baseline as a preflight artifact, not a mid-run surprise. Run the full E2E
  suite once at the base commit — but **do not go looking for a `N flaky` line, because the bare
  suite does not produce one.** `npm run test:e2e` carries no `--retries` (only the driver's
  `E2E_CMD` adds it), and without retries Playwright has nothing to call flaky: a load-dependent
  flake is reported as a plain `1 failed`, identical to a genuine breakage. The 2026-07-29 baseline
  did exactly this — one `pwa-registration.spec.ts` failure that looked like a red base commit.

  **So classify every failure before believing it**: re-run the failing spec alone a few times.
  Green in isolation and red under the full suite means load-dependent flake — the specs run at a
  parallelism the driver's targeted `E2E_CMD` never reproduces, so it will cost you almost nothing
  per finding and will instead surface as intermittently red CI. Red in isolation too means the base
  is genuinely broken and nothing should launch until it is fixed. Wrap the run so the exit code
  survives, too: `(npm run test:e2e; echo "EXIT=$?") > log` records the suite's status, while piping
  into anything else hands you the *last* command's code and a red suite reads as green.

  **That trap is not specific to the e2e suite — it applies to every verification command you run by
  hand, and it fails toward "green".** `npm run format:check 2>&1 | tail -5; echo "exit=$?"` prints
  `exit=0` from `tail` while dprint is reporting an unformatted file two lines above; a 2026-08-06
  supervisor read that as a pass. So does `cmd && echo OK || other && echo DONE`, which parses as
  `((cmd && echo OK) || other) && echo DONE` and prints `DONE` on success without ever running
  `other`. Capture the status in the subshell (`(cmd; echo "EXIT=$?") > log`) and read it from the
  log, or check `${PIPESTATUS[0]}` — never trust the exit code of a pipeline whose last stage is
  `tail`, `grep`, or `head`.

  Fix what you find, or at minimum record the spec name **and which of the two classes it is** in
  the durable checkpoint, so the next implementer that trips it recognises it instead of re-deriving
  it, and so a red CI naming that spec is triaged in seconds. Resist "fixing" a flake you have not
  diagnosed: raising a timeout is the wrong repair when the cause is a dropped input event rather
  than a slow one, and a confidently wrong test change is worse than a documented flake. If a flake
  surfaces mid-run and is cheap to fix, **pause** (`touch .audit-work/STOP`), fix it, relaunch — the
  arithmetic favours the interrupt almost immediately, and this is the rare case where the fix is
  *not* attributable to any finding, so it belongs in its own commit.

  When the flake is a readiness race in a **test harness**, prefer fixing the seam over adding a
  wait: a harness that signals readiness with a boolean separate from the API the specs then call
  can always be observed in the window where the flag is set and the API is not. Poll the capability
  itself (`typeof window.__x?.someMethod === 'function'`), and type the harness global as optional
  so the compiler stops vouching for something that is genuinely absent until mount.
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
  * A verifier returned a clean `verdict: VALID` with `reason: completed` — and never wrote the
    brief file it named. The driver rightly refused to hand the implementer the *previous* finding's
    brief, but deferring was the wrong response to a successful call that merely skipped a side
    effect: it is not a judgement about the finding. The driver now re-runs the verify step once
    (fresh session, `verify-retry` envelope) before deferring `verifier gave no usable brief`.

  Two rules fall out. **An optional field in a role schema is a silent work-discard risk** — where
  an observable side effect exists (a commit, a file, a branch), check the side effect, because it
  cannot forget; reserve the envelope for what only the model knows. And **when a role fails to run,
  say so in the deferral reason.** Rolling back unreviewed work is right; calling it rejected is
  not. A deferral reason is read months later by someone deciding whether to re-stage the finding.
* **Read a drop's reason whenever it concedes the finding is still true.** Most `INVALID` verdicts
  are cheap and obviously right — the named file no longer exists — and cluster by cause: a
  consolidation commit landing after the backlog's pin orphans every finding that named the moved
  code, so a run of drops usually shares one culprit and is not worth investigating individually
  (2026-08-06: three of four traced to one ADR's route consolidation). The one to actually read is
  the verdict that starts by agreeing — "the observation is real and unchanged since the pin" — and
  then drops on the finding's *specifics*. That shape is either the verifier doing careful work or
  the single unrecoverable mistake this loop can make, and the reason text is the only way to tell.
  On that run it was careful work: the finding was right that an eager glob inlines ~84 KB, and
  wrong that three of the four icons it named were parent-only when they render on the toddler
  toolbar's first paint — applying it as written would have shipped a visible regression.
* **Scope every `run.log` grep to the current run.** `run.log` accumulates across runs and iteration
  numbers restart at `iter0001` each time, so a bare `grep iter0008` silently matches a different
  finding from hours ago. Anchor on the run's start line: `awk '/HH:MM:SS\] starting/{f=1} f'
  .audit-work/logs/run.log`. Unscoped reads also cost context: a `sed`/`grep` range over a multi-run
  log can dump hundreds of lines of unrelated history into the window you are trying to conserve.
  The per-iteration JSON envelopes collide the same way — see the blockquote under **Per-commit PR
  comments**.

  **Anchor on the *timestamped* start line, not the bare `starting — target` pattern** — and be
  deliberate about which run you mean. A normal session runs a canary and *then* the full run, so
  `awk '/starting — target/{f=1} f'` latches onto the **canary's** start and hands you both runs
  concatenated. That is the right scope for a wrap-up total (sum every `finished:` line) and the
  wrong one for "what has the current run done", where it silently doubles the picture. Pin the
  timestamp you actually want (`awk '/09:41:44\] starting/{f=1} f'`), or take the last one with `awk
  '/starting — target/{n=NR} …'`. Same trap in reverse at closeout: a session with a canary has
  **two** `finished:` lines and the log row covers both.

## Closing out a run

* Verified fixes land one commit each on the branch (`Audit: <title>` trailer), pushed as they land,
  each with its own per-commit comment (see above). Invalid findings are dropped with a reasoned
  `chore(audit): drop invalid finding` commit. Un-fixable findings move to `docs/AUDIT-DEFERRED.md`
  (committed) — triage these by hand afterwards: re-stage, file as issues, or drop. **A deferred
  entry carries its own post-mortem**: the reviewer's unresolved objections, the implementer's
  account of each round, and — when a draft was committed before the rollback — a
  `docs/audit-deferred/<slug>.patch` you can `git apply`. That draft passed the type-check, unit and
  lint gates; the review is what it did not pass, so it is a starting point rather than scrap. Read
  the `#### What was tried` section before re-staging: an `implementation failed` deferral is
  routinely a brief that *cannot* be executed (a proposed fix that does not compile), and re-staging
  it unchanged just buys the same failure again.
* When the backlog is fully drained, `docs/AUDIT.md` should be deleted per
  `.claude/audit-conventions.md` (a partial run may also leave emptied `## Source:` sections — tidy
  them in a final commit).
* Drain the comment store before marking the PR ready — `next` / post / `done` until empty, and
  `capture` first if any fix landed without a record. Running `capture` **after** the drain is safe
  and worth doing as a completeness check: `done` records each posted sha, so capture reports
  `skipped N already posted` rather than re-arming comments you have already published. (It did
  re-arm them before 2026-07-25, when it deduped against the store alone — and the store is empty
  exactly when the drain succeeded.) If `COMMENT_STORE` was pointed at a committed path, delete that
  file in the same commit that finishes draining it: a leftover `docs/AUDIT-PENDING-COMMENTS.jsonl`
  reads as work still owed.

  **Read that `skipped N` as an assertion, not a formality: `N` must equal the run's fix count.** It
  is the only end-to-end check that every fix reached the PR — the store going empty proves only
  that you posted what was *offered*, and a comment record lost with a reclaimed container is
  invisible from the store's point of view. `capture` rebuilds from the pushed commits instead, so
  agreement between the two is real evidence. A `skipped N` **below** the fix count means capture
  just re-armed the difference: post those before finishing. On 2026-07-29, `skipped 39 already
  posted` against 39 fixed closed the run out in one command.
* Confirm CI is green on the final push before marking the PR ready. It is the only full-suite gate
  in this configuration, so "the run finished" and "the branch is sound" are genuinely different
  claims here.
* Add one entry to `docs/AUDIT-LOG.md` per `.claude/audit-conventions.md` §2 (date ·
  `burn-down-audits` · done/deferred/dropped counts + the PR link), then mark the PR ready with
  `mcp__github__update_pull_request` (`draft: false`). **Take the counts from each run's `finished:`
  line** (`N fixed, N dropped, N deferred`) and cross-check them against the commit record —
  `chore(audit): defer` and `drop invalid finding` subjects are one per finding, so they are exact.
  A session that ran a canary *and* a full run has **two** `finished:` lines and the log row covers
  both; sum them rather than reporting the last one.

  **`audit:status`'s `deferred findings` list is cumulative, not this run's.** It prints every entry
  in `docs/AUDIT-DEFERRED.md`, which accumulates across every run against this backlog — a session
  that deferred 3 can easily see a list of 10. Taking the log row's deferral count from that list
  over-reports it by every earlier run. Same caution as the `of <total>` denominator below: the list
  is for triage, not for counting. Do **not** count fix commits: a finding whose review demanded
  changes can land two or three commits, so commits-with-an-`Audit:`-trailer over-reports fixes.
  Ignore `audit:status`'s `of <total>` denominator here; it is derived from `completed.log` (which
  is gitignored, container-local, and accumulates across runs) plus a cumulative deferred file, so
  it drifts by a finding or two and is not an auditable figure. `remaining` is the trustworthy
  number.

  **A run that was killed never printed `finished:`, so reconstruct the counts from git and check
  the arithmetic closes.** Deferrals and drops are one commit each and exact; fixes are whatever is
  left over, and the entry-deletion total is the independent check that you have not miscounted:
  ```bash
  git log --format=%s <base>..HEAD | grep -c 'defer —'                 # deferred
  git log --format=%s <base>..HEAD | grep -c 'drop invalid finding'    # dropped
  for s in $(git rev-list <base>..HEAD); do git show $s -- docs/AUDIT.md | grep -c '^-### '; done | paste -sd+ | bc
  ```
  The third number is findings *consumed*; subtract deferrals and drops for fixes, and confirm
  `<backlog at launch> − consumed == pop-finding.mjs --count`. If that identity fails, stop and find
  out why before writing a log row — it is the same arithmetic that exposed the 2026-07-25 canary
  destroying three findings while reporting a clean `5 fixed`.
* The deliberately-unported alternative: driving this loop with in-session subagents. Only worth it
  to watch and steer a handful of findings interactively — and that path already exists as
  `/fix-audits`.
