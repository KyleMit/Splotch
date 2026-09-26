<!-- Source: .ruler/skill-notes/burn-down-flaky-tests.md.template -->

# burn-down-flaky-tests — design notes

## Origin

Issue \#2324 required the skill to follow a real hand run. The 2026-09-26 run began with 157 masked
retry events across 15 ranked signatures. Five current spec races got fixes; seven signatures were
historical after earlier fixes, one spec had been removed, and two low-frequency signatures remain
unexplained. All three initially unresolved leads passed 120 targeted repetitions, but independent
review found a shared helper race behind the privacy signature. Full-suite sweeps before and after
review each passed 2,937 executions. The exact triage and command results are in
`docs/scratchpad/flaky-burndown-2026-09-26.md`.

The strongest prior art was the 2026-09-22 flake hunt. Its 24 full-suite reps with retries off
separated CI-masked test races from deterministic cloud-container failures and one-off events. PR
\#2143 fixed the leading reload, badge, and Back races, but those events remained in the next
rolling digest. The new workflow has to detect that history before opening old fixes again.

## Decisions from the hand run

* **Digest first, outside `test-results/`.** The default generator output was erased by the first
  Playwright run. The skill preserves it in a separate scratch directory, including coverage gaps.
* **Trace events to commits.** Three of the four highest-ranked signatures already had fixes. The
  halo's trunk event and branch events for the AI result and Back specs used heads lacking later
  fixes. Event totals alone overstate current debt.
* **Hold worker load constant.** Thirty isolated runs of the original dark-header test passed on
  this Mac at four workers while the CI digest had 31 masked events. Post-fix amplifiers ran at ten
  workers and cannot be used as a before/after rate against that four-worker run. The CI traces
  establish the mechanisms; clean local runs show no regression, not a measured rate reduction.
  `docs/TESTING.md` owns the full sweep protocol.
* **Review the exit condition of a retry.** The dark-header retry could pass before the palette
  settled, while the privacy panel retry stopped before its last link was visible. Independent
  review found both despite clean full-suite repetitions. A retry has to wait for the complete state
  its assertion claims to measure.
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
