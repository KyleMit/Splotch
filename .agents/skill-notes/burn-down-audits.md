# `burn-down-audits` for Codex — design notes

Design history and open questions for the Codex implementation of the `burn-down-audits` skill. This
note belongs only to the directly maintained Codex package under `.agents/`; it is not a shared
contract with the Claude Code implementation.

Current as of **2026-07-26**. The Codex runner was validated with direct CLI probes and a live
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

`scripts/audit-burndown/agent-runner.mjs` invokes schema-constrained `codex exec --json`, reads
`thread.started.thread_id`, normalizes the JSONL event stream, and resumes repair rounds with
`codex exec resume <thread-id>`.

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

A repair round follows the same contract: resume the exact implementer thread, edit on top of the
rejected commit, leave Git metadata alone, and let the outer driver create the next round commit.

That contract creates clean commits before gates and adversarial review. A crash at that point used
to preserve the local-ahead commit while leaving the finding in `docs/AUDIT.md`; re-verification
could then call the finding already fixed and drop it without ever gating or reviewing the change.
`RESUME=1` now recognizes the exact `Audit:` trailer while the matching entry heading remains,
rewinds the entire contiguous implementation and repair chain, and reprocesses the finding. It halts
instead of rewriting if that incomplete chain was somehow published.

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
