# Handoff — rival-agent Opus bench

> 2026-09-03 · branch `codex/rival-agent-codex-validation` · PR
> [#1598](https://github.com/KyleMit/Splotch/pull/1598) · Finish the comparable Opus bench
> repetition, record it, and take the Codex-handler validation PR to ready

## Objective & non-goals

Finish the one missing completion condition from the consumed `rival-agent-codex-validation`
handoff: one complete Claude Opus seeded-defect repetition launched by Codex. Record its comparison,
close the remaining NOTES.md and Codex-side skill-note gaps, address the posted rival review, run
the gates, and mark PR 1598 ready.

Do not substitute Sonnet: the recorded Claude column is Opus/high and the result must remain
comparable. Do not rerun the installer or edit Codex policy by hand. No ADR, hosted reviewer,
workflow, label, profile rung, broker policy, rebase, or force-push. The run-rival-agent packages
are registered direct-provider packages; edit the Codex side in place, never through `.ruler/`.

## State

Branch and PR are pushed. The PR is draft and its body carries the completed checks plus the live
Opus overload blocker. Commits:

| SHA       | What                                                                                       |
| --------- | ------------------------------------------------------------------------------------------ |
| 5fc5e5b72 | Consumed the original handoff                                                              |
| 2043164fc | Refreshed three bench patches whose context drifted when the prerequisite stack hit `main` |
| e63168f88 | Recorded the first Codex-handled Claude round and the generated acceptance verdict         |

Touched repository files: the deleted original handoff; three seed patches under
`tools/rival-agent/bench/seeds/`; and `docs/scratchpad/rival-agent-simplification-2026-09-02.md`.
The remaining edits belong in `tools/rival-agent/NOTES.md`,
`.agents/skill-notes/run-rival-agent.md`, and `docs/scratchpad/rival-agent-bench-2026-09-03.md`.
Consider qualifying the Codex-side `TOOL_BOUNDARY`/permissions reference with the measured fact that
Claude protects writes under the worktree's `.claude/` tree; do that only after all
installed-wrapper measurements, because changing the launcher makes the installed manifest stale.

The real review is posted at
https://github.com/KyleMit/Splotch/pull/1598#pullrequestreview-5102326136. Its dangling NOTES.md
finding is deliberately fixed only after the bench result is recorded. Its housekeeping nit is done:
the clean `collapse-dev` and `seed-base` scratch worktrees were removed and `tmp/rival-collapse-dev`
was deleted. The unrelated `scratchpad/ab-main` worktree was left alone.

## Decisions made (and why)

The bench remains Opus/high. Three current-main patches were refreshed rather than pinning the run
to the old pre-stack base: the requested repetition is against merged `main`, and all twelve repros
now validate there. Failed HTTP 500/529 cells are not data and must not enter the comparison. The
runner deliberately records failed cells; use a fresh output directory after a failed capacity probe
rather than deleting or disguising them.

The installed wrapper is healthy. `run-claude:policy:check`, `run-claude:installation:check`, and
the escalated health probe all passed. Stream logs show the account allowed at low utilization; Opus
returned `529 overloaded`, so this is provider capacity, not auth, policy, rate limit, or the bench.
Anthropic's public status page still reported operational.

## Unverified assumptions

* Opus capacity will recover on the next session. Three fresh recovery probes between 09:23 and
  09:47 EDT exhausted the CLI's ten retries with HTTP 500/529.
* The complete twelve-cell repetition will finish without a vendor-side structured-output failure.
  If one cell alone fails that way, rerun that seed in a fresh output and record the retry honestly.
* `format:check` works through the installed Claude launcher. The live review instead tried
  `ruler:check`: macOS lacked its `timeout` wrapper, then Ruler hit an EPERM unlink under
  `.claude/skills/`; Claude did not escalate because the drift gate could not affect a handoff-only
  verdict.
* PR 1598's new CI run is still pending.

## Done & verified

* PRs 1579, 1581, and 1587 are merged on `main` at d86ccc3ee016c7f91c4e2139907f94c5f897c888. GitHub
  has no PR 1588; that was stale stack wording, not a missing prerequisite.
* Installed v5 preflight and health passed. The first real Codex-handled PR round completed in 161
  seconds: ten local Bash calls, one approved read-only GitHub request, one blocking finding plus
  one nit, no unverified items, and the review posted successfully.
* The generated acceptance suite passed all stages in 92 seconds: 10 files / 92 tests local to the
  Claude sandbox; exact parser anchors; exactly two broker calls in order; session marker approved
  with exit 0; canonical-checkout write declined; zero findings and one expected unverified item.
* `npm run rival:bench -- --validate` passes all twelve seeds against current `main` after the three
  patch refreshes. The first pre-refresh bench ran two valid cells (one found seed, one clean
  control) before the stale third patch stopped it; do not combine those with the final run.
* Local gates: `npm run check`; `npm run lint` (zero errors, one pre-existing
  `tools/perf/campaign-status.mjs` warning); `npm run lint:dead`; `npm run check:skill-refs`;
  `DPRINT_CACHE_DIR=/private/tmp/splotch-dprint-cache npm run format:check`; escalated
  `npm run ruler:check`; focused rival tests 10 files / 92 tests; escalated `npm run test:tools` 161
  files / 3,377 tests.

## Risks & next 3 steps

1. Probe capacity with one Opus/high cell in a brand-new `mktemp -d` output. Once it succeeds, run
   `npm run rival:bench -- --rival claude --reps 1 --out <that-output>` escalated; the successful
   probe cell is skipped and the other eleven complete the one coherent repetition. Keep failed
   probe outputs separate.
2. Add the final run and comparison to `docs/scratchpad/rival-agent-bench-2026-09-03.md`; update the
   parity table and remove the Codex-handler item from `tools/rival-agent/NOTES.md`; replace the
   Codex-side note's "Unvalidated" section with measured results. Run a small installed
   question-scoped `format:check` proof if the full bench does not exercise it. Resolve the posted
   review's NOTES.md finding with those edits.
3. Run formatting and repository gates, commit, push, update the PR checklist/results, wait for CI,
   optionally run the resumed PR review once the installed bytes still match, then mark PR 1598
   ready. Remove only this task's temporary bench/session directories after their numbers are
   committed.

## Reread first

* `.agents/skills/run-rival-agent/SKILL.md` and `references/permissions.md`
* `.agents/skill-notes/run-rival-agent.md`
* `tools/rival-agent/NOTES.md` and `tools/rival-agent/bench/README.md`
* `docs/scratchpad/rival-agent-bench-2026-09-03.md`
* `docs/scratchpad/rival-agent-simplification-2026-09-02.md` (Round E and live acceptance)
* `tools/rival-agent/bench/run-bench.mjs`
* The `testing`, `resume-handoff`, and `create-handoff` skills
