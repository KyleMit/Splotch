<!-- Source: .ruler/skill-notes/burn-down-flaky-tests.md.template -->

# burn-down-flaky-tests — design notes

## Origin

Issue \#2324 required the skill to follow a real hand run. The 2026-09-26 run began with 157 masked
retry events across 15 ranked signatures. Four current spec races got separate fixes; seven
signatures were historical after earlier fixes, one spec had been removed, and three low-frequency
signatures remained unexplained after 120 targeted repetitions and 2,937 full-suite executions with
no failure. The exact triage and command results are in
`docs/scratchpad/flaky-burndown-2026-09-26.md`.

The strongest prior art was the 2026-09-22 flake hunt. Its 24 full-suite reps with retries off
separated CI-masked test races from deterministic cloud-container failures and one-off events. PR
\#2143 fixed the leading reload, badge, and Back races, but those events remained in the next
rolling digest. The new workflow has to detect that history before opening old fixes again.

## Decisions from the hand run

* **Digest first, outside `test-results/`.** The default generator output was erased by the first
  Playwright run. The skill preserves it in a separate scratch directory, including coverage gaps.
* **Trace events to commits.** The largest three signatures in the baseline already had fixes;
  branch-only events for the halo, AI result, and Back specs used heads lacking later fixes. Event
  totals alone overstate current debt.
* **Hold worker load constant.** Thirty isolated runs of the original dark-header test passed on
  this Mac while the CI digest had 31 masked events. A single targeted pass or a faster machine
  cannot disprove a contention race. `docs/TESTING.md` owns the full sweep protocol.
* **Quarantine stays narrow and accountable.** The issue explicitly permits it, but a skip silently
  defeats the vacuous-test lint and may hide a user-reachable bug. Require a confirmed current
  failure, an issue opened first, the exact test only, and an explicit lint exception. Single events
  remain active while their mechanism is investigated.
* **Keep the log out of the runbook.** This baseline and the surprises that earned the rules are
  design history. The next run begins with a new digest, not this list of tests.

## Open questions

* The first run cannot produce a full post-fix seven-day window immediately. The next periodic run
  must report the aged-out comparison with fresh coverage.
* A dedicated quarantine mechanism has not been exercised because no test met the quarantine bar in
  the first run. Check the lint exception and review process on the first real candidate.
