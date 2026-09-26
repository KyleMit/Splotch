---
name: burn-down-flaky-tests
description: Drive Splotch's masked Playwright retry count toward zero using the rolling flaky digest, fixes verified under equal worker load, and narrowly tracked quarantine when a confirmed flake cannot be fixed. Use for a periodic E2E flake burndown, not for an ordinary single failing test.
---

# Burn down flaky tests

One run starts with the CI digest and ends with one reviewed PR: one commit per affected spec,
followed by a run log that records the count, coverage, decisions, and validation. Read the
`testing` skill and `docs/TESTING.md` sections **Flake-hunting protocol** and **Writing
flake-resistant specs** before running browser tests. Consult `tools/flaky-digest/README.md` for the
history and coverage contracts. Earlier hunts in `docs/scratchpad/` and current tracking issues are
evidence, not a fresh backlog.

## 1. Produce and preserve the digest

Run `npm run gen:flaky-digest -- --out=<scratch directory outside test-results>` **first**. A local
run needs an Actions-read GitHub token or an authenticated `gh` login. If that fails, fetch the
latest scheduled `Flaky digest` workflow's digest artifact with the native GitHub tools and record
its harvest time. Do not treat an unavailable or stale digest as zero flakes. Keep the output
outside `test-results/`: Playwright deletes that directory at startup.

Read `flaky-digest.json` or the Markdown ranking. Record the seven-day window, trunk and branch
sample counts, executed-test counts, masked-flake counts, and every coverage warning or gap. A gap
is unknown, never a clean run. Keep trunk and branch events separate; a branch's failure may belong
to code that never reached `main`.

Check `web/tests` for unconditional `.skip`, `.fixme`, or `.todo` and their reasons. The repo's
vacuous-test lint rejects unconditional skips; conditional environment skips are not quarantine.

## 2. Triage from the highest event count down

For **each ranked signature**, open its latest failing CI job log or trace, inspect the exact
assertion and page state, then compare its event `headSha` with current `main`, intervening commits,
earlier hunts, and open tracking issues. A rolling event from a pre-fix commit is historical. A
single branch-only event is a lead, not automatically a current flake. Record each as current,
already fixed, obsolete, or unresolved with the evidence that supports that call.

For current failures, distinguish a product state a user can reach from a test-only race, shared
state, and machine-capacity failure. A slow local run is not a flake by itself: reproduce at the
same supported worker count with retries disabled. Get that count from
`node -p "require('node:os').availableParallelism()"`; do not pool rates from different counts or
machines. The full-suite driver
`npm run test:e2e:sweep -- --workers=<count> --reps=3 --out=<scratch>` builds once and starts a
fresh preview server for each rep, preventing a shared rate-limit window from manufacturing
failures. It is host-exclusive; use an explicit free `SPLOTCH_E2E_PORT` and check no other worktree
owns a full suite before starting. For one suspected spec, use a targeted
`npm run test:e2e -- <spec> -g "<title>" --workers=<count> --retries=0 --repeat-each=10` with an
explicit port. Higher worker counts can amplify a race but do not become the comparison baseline.

## 3. Fix or quarantine

Fix the reachable product defect in product code; otherwise make the spec await the durable outcome
it needs. Preserve the failing pre-fix state as a negative control when changing behavior. Do not
raise retries, lengthen a sleep, or relax an assertion without evidence that it still catches the
defect. Run `npm run check`, a targeted retries-off amplifier, and at least three full-suite sweep
reps at the original worker count after the fixes. Record executions and failures; a clean streak is
not proof of a zero underlying rate. Commit each spec's fix separately, including the product files
that fix that spec.

Quarantine only a **confirmed current** flake that cannot be fixed in this run and is consuming CI
retries or blocking reliable results. First open a tracking issue with the exact test, CI run and
attempt, failing state, reproduction/load level, investigation, and removal condition. Then skip
only that test, name the issue beside the skip, and make the necessary narrow lint exception
explicit. Never disguise an unconditional skip as an environment condition. Do not quarantine a
one-off, an obsolete branch event, or a deterministic failure confined to a different machine; keep
those tests active and record what evidence would change the decision.

## 4. Report and ship

Put the hand-run log in the PR body or `docs/scratchpad/`: per-signature classification, which were
product/test/infrastructure defects, fixes and quarantine issues, false positives or coverage
limits, commands and results, and judgment calls. Give the digest's before and after counts with
their window and sample coverage. Old events remain in a rolling seven-day window until they age
out, so report post-fix-head samples separately and leave the next full-window comparison for the
next periodic run. Review all test changes against the negative controls; do not equate a green CI
run with no masked retries.

Open one PR and run `drive-pr-to-mergeable` for its independent review and CI verdict. Leave it open
unless the user explicitly authorized a merge. A quarantined spec's tracking issue remains open
after the PR; the next burndown starts with the digest again rather than assuming the prior log is
current.
