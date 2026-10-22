# Expected PR CI

Derived from the workflow definitions at base `fffeed1fe4116112bb10297a180ac552f9754046`, before
waiting for observed checks. This PR changes only the campaign directory under `docs/scratchpad/`.

Applicable:

* Tests: Quality; Browserless tests; Native web build; Page-load performance; RN web E2E (1/2) and
  (2/2); Real-handler UI integration; Firefox smoke; WebKit smoke.
* ADR Integrity: ADR numbers, headings, and index entries agree.

Excluded by event/path/job conditions:

* Native compile: no native build input in the PR paths.
* Centerline tracing: no tracer input or workflow changed.
* Android/iOS Deploy Smoke: tag push or manual dispatch only.
* Hosted Deploy Smoke and Flaky digest: schedule/dispatch, not this PR event.
* GitHub Pages, label sync and Playwright cache warming: their push paths/events do not match this
  PR.
* Move reviewed issue to ToDo: issue events only.
* Dependabot review: actor must be dependabot; this PR is not.

`gh api repos/KyleMit/Splotch/branches/codex%2Fnative-migration/protection` returned HTTP 403
(integration cannot read protection settings).
`gh api repos/KyleMit/Splotch/rules/branches/codex%2Fnative-migration` returned an empty array. This
is not evidence that unreadable classic protection does not exist. The full workflow-derived
applicable set above is required for this run's green verdict, plus live conflict/mergeability and
resolved-review checks. Current head and run links are recorded on the PR after the checks complete;
nothing here treats a path-filter exclusion as a test pass.
