# Handoff — audit burndown run

> 2026-07-27 · branch `audit/burndown-20260727-codex` · PR
> [#561](https://github.com/KyleMit/Splotch/pull/561) · burn down the staged audit backlog with
> supervised Codex roles

## Objective & non-goals

Run the Codex audit-burndown driver through bounded, CI-supervised segments until the current
`docs/AUDIT.md` backlog is exhausted or the user asks to pause or wrap up.

Do not replace the driver with in-session agents, edit `docs/AUDIT.md` directly, run without
exact-head CI supervision, or change tracked files while the driver is active.

## State

* Branch: `audit/burndown-20260727-codex`, created from `main` at
  `d43abeaf2307a4ae35380dadbed69fe910f817ff`.
* PR: [#561](https://github.com/KyleMit/Splotch/pull/561), draft.
* Initial backlog: 128 findings, measured with `node scripts/audit-burndown/pop.mjs --count`.
* Historical `run.log` baseline: 1,548 lines. Reconcile only later `finished:` and terminal-event
  lines.
* Run state: canary and twenty bounded segments complete; no driver process is active and no `STOP`
  file is present.
* Current backlog: 18 findings after 74 fixes, 26 invalid drops, and 10 deferrals in this
  continuation.
* Last fully green finding SHA: `c9a7b7fef9a15cdbfeb670f976eaea9e3b0ead32` in workflow run
  [30316399419](https://github.com/KyleMit/Splotch/actions/runs/30316399419).

| SHA      | What                                                        |
| -------- | ----------------------------------------------------------- |
| 95cbb030 | Initial checkpoint and launch packet                        |
| 1ee77c0e | Draft PR and green preflight recorded                       |
| 3648a752 | Canary complete: 5 fixed, 4 dropped, 3 deferred, 116 remain |
| b8cc5a2f | Segment 1: 4 fixed, 1 dropped, 0 deferred, 111 remain       |
| d3b546f0 | Segment 2: 3 fixed, 2 dropped, 0 deferred, 106 remain       |
| ff0b8a83 | Segment 3: 2 fixed, 2 dropped, 1 deferred, 101 remain       |
| 6f6e85f0 | Segment 4: 2 fixed, 1 dropped, 1 deferred, 97 remain        |
| f7420c42 | Segment 5: 4 fixed, 0 dropped, 1 deferred, 92 remain        |
| ad6dc275 | Segment 6: 3 fixed, 2 dropped, 0 deferred, 87 remain        |
| d7d22071 | Segment 7: 4 fixed, 0 dropped, 0 deferred, 83 remain        |
| 5804c548 | Segment 8: 5 fixed, 0 dropped, 0 deferred, 78 remain        |
| 4a878f54 | Segment 9: 1 fixed, 3 dropped, 1 deferred, 73 remain        |
| aaaf7995 | Segment 10: 3 fixed, 2 dropped, 0 deferred, 68 remain       |
| 8556403f | Segment 11: 3 fixed, 1 dropped, 1 deferred, 63 remain       |
| fc8cf7cf | Segment 12: 5 fixed, 0 dropped, 0 deferred, 58 remain       |
| 1f5b18c5 | Segment 13: 4 fixed, 1 dropped, 0 deferred, 53 remain       |
| 6c74e219 | Segment 14: 5 fixed, 0 dropped, 0 deferred, 48 remain       |
| 625e7815 | Segment 15: 4 fixed, 1 dropped, 0 deferred, 43 remain       |
| 28c21922 | Segment 16: 4 fixed, 0 dropped, 1 deferred, 38 remain       |
| e76f0be7 | Segment 17: 3 fixed, 2 dropped, 0 deferred, 33 remain       |
| e5ee996e | Segment 18: 4 fixed, 1 dropped, 0 deferred, 28 remain       |
| c9a7b7fe | Segment 19: 4 fixed, 1 dropped, 0 deferred, 23 remain       |
| c77cfb2f | Segment 20: 2 fixed, 2 dropped, 1 deferred, 18 remain       |

Supervisor-authored follow-ups: `2eab584c` restored an efficient in-browser pixel scan, `6f6e85f0`
normalized a deferred patch, and `f7420c42` fixed that recurring patch-writer defect with a
regression test. `ded6889c` corrected stale native-version guidance found while validating segment
9, and `14c0da79` changed a segment 10 release-checklist breadcrumb from Codex's generated copy to
the shared `.ruler` source. A segment 20 follow-up corrects the deferral renderer's generic claim
that every rejected draft failed review, which was false for deterministic-gate deferrals.

## Decisions made (and why)

* Use a fresh date-scoped continuation branch rather than reusing any historical burndown branch, as
  required by the Codex runbook.
* Keep `PUSH_EVERY=1`, an empty `PUSH_TEST_CMD`, and `MAX_HANDLED=5`; CI and GitHub comment
  checkpoints remain mandatory between bounded segments.
* Use the repository-specific deterministic gates and the default GPT-5.6 Codex role mapping.
* Normalize only whitespace-only unified-diff context rows when saving deferred drafts; substantive
  patch lines retain their bytes, and focused script coverage locks the behavior.

## Exact commands

Preflight and canary:

```bash
AGENT_RUNNER=codex \
BRANCH='audit/burndown-20260727-codex' \
CHECK_CMD='npm run format:check && npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check' \
TEST_CMD='npm run test:unit && npm run test:scripts' \
npm run audit:preflight

AGENT_RUNNER=codex \
BRANCH='audit/burndown-20260727-codex' \
MAX_ISSUES=5 \
CHECK_CMD='npm run format:check && npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check' \
TEST_CMD='npm run test:unit && npm run test:scripts' \
npm run audit:burndown
```

Durable bounded launch:

```bash
AGENT_RUNNER=codex \
BRANCH='audit/burndown-20260727-codex' \
MAX_HANDLED=5 \
CHECK_CMD='npm run format:check && npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check' \
TEST_CMD='npm run test:unit && npm run test:scripts' \
npm run audit:burndown:overnight -- 600
```

## Unverified assumptions

* The remaining 18 findings have not yet been exercised.

## Done & verified

* `git rev-parse HEAD` and `git rev-parse origin/main`: both
  `d43abeaf2307a4ae35380dadbed69fe910f817ff` before branch creation.
* Host process lookup for `scripts/audit-burndown/(overnight|burndown).mjs`: no active driver.
* Worktree was clean before this handoff was added.
* Initial backlog count and historical log baseline were measured without reading `docs/AUDIT.md`
  directly.
* Exact audit preflight: green; confirmed Codex login, `runner: codex`, the expected branch, origin
  reachability, 128 parsed findings, and the repository-specific build gate.
* Draft PR [#561](https://github.com/KyleMit/Splotch/pull/561) opened against `main`.
* Foreground canary: 5 fixed, 4 invalid drops, 3 deferred, 116 remaining.
* Canary inspection: every terminal commit removed exactly one finding; no commit removed two. The
  spec split retained all 60 engine and 45 flow test titles. Fix rounds resumed their original
  implementer thread and reviewers used distinct threads.
* All five fix comments posted on PR [#561](https://github.com/KyleMit/Splotch/pull/561); capture
  found no missing or pending records.
* Exact-head CI on `3648a752593ba5a19bd72a8437c863deee912a23`: Quality and Tests green.
* Twenty bounded `MAX_HANDLED=5` segments completed with exact-head CI enforced before every
  relaunch and all comments drained at every checkpoint.
* Supervisor inspection caught an inefficient reviewed red-pixel scan; follow-up commit `2eab584c`
  restored the original in-browser early exit, passed focused E2E and full CI, and was disclosed in
  the corresponding PR comment.
* Two deferred patches exposed the same whitespace-only context-row defect. `f7420c42` fixes the
  patch writer and adds focused coverage; all 139 script tests and exact-head CI pass.
* Segment 7 native verification: `npm run android:apk` passed all 243 Gradle tasks.
* Segment 8 native verification: `npm run android:apk` and `npm run ios:build` both passed.
* Segment 9 native verification: `npm run android:apk` passed all 243 Gradle tasks.
* Segment 10 native verification: `npm run ios:build` passed.
* Segment 11 verification: JSON and shell syntax passed, as did all 141 script tests.
* Segment 12 verification: shell syntax and all 143 script tests passed.
* Segment 13 verification: shell and JSON syntax and all 145 script tests passed.
* Segment 14 verification: Ruler drift checks and all 146 script tests passed; exact-head CI also
  exercised the new composite setup action.
* Segment 15 verification: all 146 script tests and `npm run android:apk` passed all 243 Gradle
  tasks.
* Segment 16 verification: all 146 script tests passed; every pinned third-party action SHA was
  matched to its upstream release tag, and the Playwright-version helper reports `1.61.1`.
* Segment 17 verification: all 146 script tests passed; exact-head CI completed Quality in 1m00s and
  Tests in 4m45s.
* Segment 18 verification: all 149 script tests and `npm run scrapbook:check` passed; exact-head CI
  completed Quality in 1m10s and Tests in 4m19s.
* Segment 19 verification: all 149 script tests and `npm run scrapbook:check` passed; exact-head CI
  completed Quality in 1m03s and Tests in 6m48s.
* Segment 20 verification: the focused proof-sheet E2E gate passed for the accepted syntax change;
  the failed accessibility draft was rolled back and saved with its diagnostic patch. The deferral
  renderer follow-up passes all 68 focused library tests.
* `npm run audit:cost`: $18.1190 retained-log spend, no capped or errored calls, and a $4.80
  projection for the remaining 18 findings.

## Risks & next 3 steps

1. Commit and push this continuation checkpoint and require exact-head CI green.
2. Launch segment 21 with `MAX_HANDLED=5`, record its start and 20-minute deadline, then supervise
   it until stopped.
3. Require exact-head CI green, drain all comments, inspect the segment diff, and repeat bounded
   segments until the backlog is exhausted or the user asks to pause.

Closeout must stop all driver and nested Codex processes; prove local `HEAD` equals the remote;
capture and drain all comments; reconcile the 1,548-line run baseline; tidy the backlog; add the
`burn-down-audits` row to `docs/AUDIT-LOG.md`; run formatting, relevant quality gates, and the full
test suite; delete this handoff; push; finalize the PR body; require exact-head CI green; and mark
the PR ready.

## Reread first

* [Codex burn-down skill](../../.agents/skills/burn-down-audits/SKILL.md)
* [Burndown driver](../../scripts/audit-burndown/burndown.mjs)
* [Comment backfill helper](../../scripts/audit-burndown/backfill-comments.mjs)
* [Handoff conventions](AGENTS.md)
