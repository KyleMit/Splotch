# `burn-down-audits` for Codex — design notes

Design history and open questions for the Codex implementation of the `burn-down-audits` skill. This
note belongs only to the directly maintained Codex package under `.agents/`; it is not a shared
contract with the Claude Code implementation.

Current as of **2026-07-29**. The Codex runner was validated with direct CLI probes and a live
canary before its runbook was separated from the Claude Code skill.

## Invariants

1. **The Node driver owns orchestration.** Model work runs in isolated `codex exec` processes rather
   than in-session subagents, so the supervising conversation is not the run's accumulating state.
2. **Git plus `docs/AUDIT.md` is durable state.** An approved finding disappears from the backlog in
   the same commit as its fix. `.audit-work/` is disposable local state.
3. **The implementer thread resumes exactly; reviewers stay fresh.** A repair round resumes the
   original implementer by the CLI-reported thread id. Each adversarial review starts in a separate
   read-only thread.
4. **The outer driver owns deterministic gates and Git commits.** Nested workspace-write sessions
   cannot bind Playwright listeners or write `.git/index.lock`.
5. **The driver does not talk to GitHub.** It pushes commits and records pending comments; the
   supervising Codex agent owns the PR, comments, and CI supervision through the GitHub connector.
6. **A pending audit entry makes clean implementation commits provisional.** Resume rewinds the
   contiguous local-only `Audit:` chain before verification; only the amended commit that also
   removes the exact entry is durable progress.

## Native Codex runner

`tools/audit-burndown/lib/agent-runner.mjs` invokes schema-constrained `codex exec --json`, reads
`thread.started.thread_id`, normalizes the JSONL event stream, and resumes repair rounds with `codex
exec resume <thread-id>`.

The initial role mapping is:

| Role               | Model           | Effort   |
| ------------------ | --------------- | -------- |
| Verify             | `gpt-5.6-terra` | `medium` |
| Implement P1–P3    | `gpt-5.6-sol`   | `high`   |
| Implement P4–P5    | `gpt-5.6-terra` | `high`   |
| Adversarial review | `gpt-5.6-sol`   | `medium` |

`multi_agent` and `multi_agent_v2` are disabled in every nested call. The isolation boundary is one
CLI process per role, not a nested team whose work and usage the driver cannot account for.

The resume path was probed before the live run: a Terra thread received a codeword, was resumed by
its reported thread id with the same output schema, and returned the codeword. The probe also
confirmed the installed CLI accepts the selected models, output schemas, and per-call reasoning
effort.

## Canary-earned boundaries

The first live implementer completed a valid change and its non-listener checks, then Playwright
failed with `listen EPERM` on both IPv6 and IPv4 localhost. The outer process was unrestricted, but
that did not expand the nested `codex exec --sandbox workspace-write` boundary.

The implementation therefore leaves verifier-selected E2E to the driver's pre-review gate. Giving
every implementer `danger-full-access` would make the listener work but would discard the filesystem
boundary just to duplicate an outer check the driver already owns.

The next attempt respected that division and then failed to create `.git/index.lock`. The same
workspace-write sandbox protects Git metadata. Codex implementers now leave a dirty worktree and
return success without a SHA. The driver enumerates changed paths, rejects protected audit-state
edits, stages only the bounded change, and commits it.

A later run exposed the same boundary for generated agent files: `npm run ruler:apply` could update
the `.ruler/` source and `.claude/` output but not the protected `.agents/` tree, so an otherwise
green API-contract fix was deferred twice. Codex implementers now treat that one denied generated
write as outer-driver work, and the driver reruns Ruler whenever the implementation changed
`.ruler/**` before staging. Other Ruler failures still fail closed.

A subsequent platform-folder move exposed a reviewer/protection contradiction. Completeness review
required retargeting historical patches under `docs/audit-deferred/`, while the driver correctly
rejects every implementer edit to that state. Two otherwise-green findings were rolled back on the
same impossible repair. Deferred patches are explicitly starting points, not living artifacts, so
review now excludes the protected deferred files and continues to grep every live code and
documentation surface.

A repair round follows the same contract: resume the exact implementer thread, edit on top of the
rejected commit, leave Git metadata alone, and let the outer driver create the next round commit.

That contract creates clean commits before gates and adversarial review. A crash at that point used
to preserve the local-ahead commit while leaving the finding in `docs/AUDIT.md`; re-verification
could then call the finding already fixed and drop it without ever gating or reviewing the change.
`RESUME=1` now recognizes the exact `Audit:` trailer while the matching entry heading remains,
rewinds the entire contiguous implementation and repair chain, and reprocesses the finding. It halts
instead of rewriting if that incomplete chain was somehow published.

The next canary exposed the mirror-image rollback gap for untracked files. A failed implementer
added two new test files and returned `success=false`; `git reset --hard` restored tracked source
but left those tests in the worktree. They failed the next two implementers' full unit runs,
producing three consecutive deferrals from one contaminated base. The driver now snapshots
pre-existing untracked paths before implementation and removes only paths introduced by that
implementation after a rollback. Preflight treats untracked files as dirty, while `RESUME=1` removes
all untracked crash residue under its existing discard contract.

## Diagnostics and review input

A deterministic gate failure must carry a bounded, ANSI-free output tail into the resumed
implementer. The canary initially returned only “the E2E spec is red”; the nested role could not
rerun the listener-based command, guessed at a snapshot update, and produced unrelated churn.
Passing the already-observed failure makes the repair path actionable.

The reviewer reads the full `<finding-base>..<current-head>` range. Driver-owned repair commits can
put the original source change in one commit and a later test or snapshot repair in another.
Reviewing only `git show HEAD` can hide the implementation the reviewer is meant to judge.

The reviewer remains fresh and read-only. It receives the original finding, verifier brief, and
complete accepted range, but not the implementer's intentions or conversational history.

## CI supervision earned by the first full run

The first full Codex continuation showed two distinct red signals that the original runbook
conflated. Commit `758b0ef` had a green Quality job and green unit/asset/script/E2E steps, but its
workflow concluded `cancelled` when the next push interrupted app-driver smoke. Commit `aada7eca`
then completed fully green. The first real failure was `d8b86096`: an unformatted overload in
`web/src/lib/storage.ts` failed Quality's format step while every completed Tests job passed.

The format failure completed more than two minutes before the next implementation commit, but the
supervisor did not inspect CI because the runbook tied CI checks to draining PR comments and all
comments were held until closeout. The failure then survived every later push until the final format
pass.

The earned rules are:

* Put the repository's cheap format check in the per-finding deterministic gate. A full local test
  suite per push would not have caught this failure any better; formatting is a separate axis.
* Poll CI independently from comment posting and stop on a completed `failure`.
* Treat `cancelled` as inconclusive because `cancel-in-progress` routinely interrupts healthy runs.
* Track separate last-Quality-green and last-fully-green SHAs, and force a terminal full-CI
  checkpoint periodically so continuous pushes cannot starve the full-suite backstop forever.

## Supervision boundary earned by the second full run

The next Codex continuation proved that a documented checkpoint is not a checkpoint if the detached
driver can keep pushing after the supervising turn ends. The runbook required exact-head CI after
five handled findings, but the supervisor returned a final response with the overnight PID still
active. By the next status requests the driver had handled dozens more findings, and the pending
comment queue eventually reached 56 records. The code remained healthy and final CI passed, but the
supervisor had silently given up the independent CI and comment cadence it promised.

The driver now accepts `MAX_HANDLED`, which counts fixed, dropped, and deferred outcomes and exits
cleanly at the boundary. Codex full-run segments use five. The supervisor must drain comments,
require exact-head CI, and explicitly relaunch; it must not send a final response while a driver or
nested role remains active. The separate 20-minute ceiling remains manual because stopping a live
role would discard work.

Two related observability gaps surfaced:

* `npm run audit:status` ran inside the workspace sandbox and labeled the detached unrestricted
  child `idle`, while an unrestricted `pgrep` confirmed it was alive. Status counters remain useful,
  but process liveness needs the outer process check.
* `run.log` retained historical branches, and a three-consecutive-deferral halt omitted a
  `finished:` line. A continuation handoff now records both the initial backlog and log-line
  baseline; closeout scopes summaries to that range and proves the outcome sum against the backlog
  delta.

Closeout itself was sound but exposed avoidable friction: the accumulated connector queue took 56
serial posts to drain, and the stale canary PR body had to be replaced after final CI. Comment debt
is now a hard relaunch blocker at every handled checkpoint, connector drains are bounded in batches,
and final PR-body replacement is an explicit closeout step. The full local Playwright run also
reconfirmed that the supervising workspace sandbox cannot bind the preview port; closeout treats
`listen EPERM` as a permission boundary and reruns the unchanged gate with local-server permission.
A fresh-context forward-test then caught two ordering gaps: the handoff could not contain a PR
number before its first commit created the PR's diff, and closeout never explicitly committed its
tracked documentation changes. The workflow now uses a `PR: pending` checkpoint followed by a
PR-number checkpoint, and commits/pushes one final closeout diff before exact-head CI.

## PR 554 supervision retrospective

The merged continuation handled 55 findings: 38 fixed, 13 dropped, and 4 deferred. Its scoped
`run.log` events reconciled exactly against the backlog delta, every posted fix comment was
accounted for, exact-head CI was green, and the full local suite passed. The role isolation,
adversarial review loop, five-outcome segment boundary, checkpoint handoff, and clean `STOP`
behavior all worked as intended. In particular, the final wrap request allowed the in-flight finding
to finish without launching another one.

The remaining friction was supervisory rather than correctness-related:

* On macOS, `pgrep -af` sometimes returned only a PID, while the sandboxed status command could not
  see the unrestricted detached process at all. `pgrep -fl` plus a targeted `ps` check is the
  portable liveness recipe.
* Streaming `gh run watch` repeatedly rendered the full unchanged job matrix. Compact PR-check
  polling preserves the exact-head evidence while using much less conversation context.
* `audit:status` reports campaign-wide completed and deferred totals, and `audit:cost` reads every
  retained role envelope. The continuation's own outcome counts must come from its initial backlog
  and `run.log` baseline, not from either cumulative command.
* The 20-minute segment ceiling was easy to miss once a long finding entered review or repair.
  Recording the deadline at launch makes `STOP` a concrete timed action instead of a remembered
  guideline.
* A large comment queue was safe but expensive to drain through one connector round trip per body.
  Batches of at most ten can share one orchestration cell while retaining the at-least-once `next` →
  post → `done` ordering.
* `pop-finding.mjs --help` is not supported. It originally fell through to printing the first
  finding, which made any mistyped mode look like a successful pop; the mode set is now closed, so
  `--help` and every other unrecognized flag exit 2 with `pop: unknown mode <mode> (see header for
  usage)` and leave the backlog untouched (`tools/audit-burndown/tests/pop-finding.test.mjs`). The
  helper also cannot prune empty source sections, so the previous closeout instruction to tidy them
  contradicted the prohibition on direct backlog edits. The runbook now lists the supported modes
  and removes that unsafe cleanup step.

## PR 561 supervision retrospective

The next continuation started with 128 findings and wrapped on request after a 12-outcome canary and
21 bounded segments. It reconciled 75 fixes, 28 drops, and 11 deferrals exactly against the original
backlog delta, leaving 14 original findings. All 75 accepted fixes received their PR comments, the
queue was empty, no Codex role was capped or errored, retained logs cost $18.1190, and exact-head CI
was fully green before PR 561 was marked ready. The session audit then added one unrelated tooling
finding, correctly reported separately from the 14-finding campaign remainder.

The strongest mechanisms were already present. Five-outcome boundaries kept detached work behind CI;
blind review forced multiple real corrections; failed final findings rolled back cleanly with
diagnostics; `STOP` prevented another finding from starting during wrap-up; and scoped log
reconciliation kept cumulative status and cost data from contaminating this continuation's counts.
Checkpoint inspection also caught a generic deferral renderer that blamed review for deterministic
gate failures; the driver and its regression tests were corrected during the run.

The remaining friction was about the host boundary and duplicate supervision work:

* The first nested-CLI escalation sounded like a new security disclosure. The material difference
  from the supervising chat is additional automated OpenAI calls and usage, not a different data
  recipient. The runbook now treats explicit skill invocation as authorization for those in-scope
  subprocesses, skips redundant conversational reconfirmation, and asks for one narrow reusable host
  approval only when the platform still requires it. Invocation never overrides a host denial or
  expands the role sandboxes.
* `ruler:check` failed inside the workspace sandbox because its drift pass temporarily rebuilds
  `.agents/`, then passed unchanged outside it. The same distinction now sits beside the rule that
  keeps Ruler out of per-finding gates.
* dprint emitted a cache-write warning on nearly every sandboxed format pass while returning zero.
  The exit status, not the warning text, remains the verdict.
* Wrap-up duplicated the exact-head CI suite locally. A macOS first-test Playwright harness failure
  then consumed two reruns even though the pushed head completed the same CI suite green. Closeout
  now keeps deterministic local checks but delegates the full-suite verdict to exact-head CI unless
  local Playwright is needed for diagnosis.
* `STOP` worked, but the active finding still consumed its remaining review and repair rounds. The
  runbook now says explicitly that stop requests take effect only between findings.

Compact CI polling and batched connector posting were also not followed consistently, but PR 554 had
already earned clear instructions for both. Repeating those rules would make the skill longer
without changing the contract, so this revision leaves them in place and records the execution miss
here instead.

## PR 583 deferred-triage rerun retrospective

The 45-finding rerun closed the staged backlog with 27 fixes, 5 drops, and 13 bounded deferrals. The
expanded triage context paid off: previously deadlocked findings landed with exact semantic
solutions, including predicate-based border flooding and cross-kernel pupil erosion. Five-outcome
segments, exact-head CI, per-finding comments, blind review, scoped log reconciliation, and the
final handoff/backlog deletion all behaved as designed.

Three failures were caught and contained during the run:

* The initial “five-fix” canary handled ten findings—3 fixed, 3 dropped, 4 deferred—because
  `MAX_ISSUES` advances only on accepted fixes. That is too wide a first sample for a backlog
  expected to contain difficult deferrals. Codex canaries now set both `MAX_ISSUES=5` and
  `MAX_HANDLED=5`; a second bounded canary is allowed when the first lands no fix.
* Outer Ruler recovery initially recognized only root `.ruler/**`. The final documentation finding
  changed `tools/asset-gen/.ruler/AGENTS.md`, so the first implementation commit omitted generated
  `AGENTS.md`/`CLAUDE.md`; blind review caught it and forced a repair. Ruler-source detection now
  treats any path component named `.ruler` as authoritative, with a nested-path regression test.
* The API smoke harness inherited a real `GITHUB_ISSUE_TOKEN` and created test issue 585 before the
  supervisor closed it. The harness now clears that variable in its child environment. This was
  fixed at the unsafe source rather than adding a runbook warning that every caller would need to
  remember.

The run also found and repaired the protected-generated-output and protected-historical-patch
mechanisms already documented above. No further supervision prose is warranted for those now-tested
driver contracts.

## PR 630 supervision retrospective

The continuation canary fixed five findings, and the bounded full segment fixed three more before a
wrap request. One in-flight testing finding exhausted its repair rounds and deferred cleanly. The
593 → 584 backlog delta reconciled to 8 fixes and 1 deferral; exact thread resumption, rollback,
push-every-one, scoped E2E selection, comment batching, and `STOP` all behaved as designed.

Two host-facing assumptions still caused avoidable friction:

* Managed command review rejected the first canary even though the user had explicitly invoked the
  skill. That host distinguishes workflow authorization from consent to send repository files read
  by nested roles. Asking once with the exact payload, provider, and campaign scope succeeded. The
  runbook now requests that confirmation before creating external checkpoint state whenever managed
  approval mode is active; ordinary hosts continue to treat invocation as authorization.
* The supervisor used compound 35–45 second `sleep`/`tail` polls while the driver was active. A wrap
  message arrived during one of those calls but was not delivered until the next tool boundary, two
  seconds after the driver had started another finding. The eventual `STOP` still bounded the run,
  but active-driver waits now stay at 20 seconds or less and use a yielded watcher or short poll. CI
  keeps its separate 30–60 second cadence.

The multi-round testing reviews were useful rather than supervisory waste: they rejected cap
fixtures that did not distinguish the guarded branch and a no-shrink assertion that reused stale
target content. No relaxation or special-case prompt was added for those findings.

## Provider ownership

The complete Codex package and this note are maintained directly:

```text
.agents/
├── skills/burn-down-audits/SKILL.md
└── skill-notes/burn-down-audits.md
```

They are deliberately absent from `.ruler/skills/` and `.ruler/skill-forks/`. Ruler preserves the
direct package, and its drift guard excludes it. The Claude implementation and notes live under the
parallel `.claude/` paths and are maintained independently; never copy one provider's runbook over
the other.

## Open questions

* Token totals are observable, but the Codex CLI has no equivalent to Claude's per-call dollar
  budget. Wall-clock, subscription limits, and deterministic halt conditions remain the practical
  run ceilings.
* The current flow is sequential. Parallel worktrees would change state ownership, review ordering,
  comment ordering, and crash recovery; it is a redesign rather than a throughput knob.
* The nested sandbox boundaries were measured on the current Codex runtime. Re-probe listener and
  Git-metadata access after a runtime change before removing driver ownership.

## Timeline

| Date       | What                                                                    |
| ---------- | ----------------------------------------------------------------------- |
| 2026-07-26 | Add schema-constrained Codex role execution and exact thread resumption |
| 2026-07-26 | Move listener-based E2E from nested implementers to the outer driver    |
| 2026-07-26 | Move bounded Git staging and commits to the outer driver                |
| 2026-07-26 | Pass gate output to repairs and review the complete finding range       |
| 2026-07-26 | Separate the Codex and Claude packages at the Ruler source              |
| 2026-07-26 | Rewind clean incomplete implementation chains during crash recovery     |
| 2026-07-26 | Add per-finding formatting and independent CI checkpoints               |
| 2026-07-26 | Move both provider packages to direct, independent maintenance          |
| 2026-07-26 | Remove failed-role untracked files without deleting pre-existing paths  |
| 2026-07-27 | Bound detached segments by handled outcomes and make handoff explicit   |
| 2026-07-27 | Make supervision portable, scoped, timed, and low-noise after PR 554    |
| 2026-07-27 | Clarify consent, sandbox noise, stop latency, and closeout after PR 561 |
| 2026-07-28 | Move protected `.agents/` Ruler generation to the outer Codex driver    |
| 2026-07-28 | Exclude protected historical patches from live completeness review      |
| 2026-07-28 | Bound canaries and recognize nested Ruler sources after PR 583          |
| 2026-07-29 | Front-load managed consent and shorten active-driver poll boundaries    |
