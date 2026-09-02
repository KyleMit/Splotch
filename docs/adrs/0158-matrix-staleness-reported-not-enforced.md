# ADR-0158: Matrix Staleness Is Reported by Default and Enforced Only on Request

**Status:** Active **Date:** 2026-09

## Context

`tools/perf/check-matrix-staleness.mjs` compares the product commit each committed matrix cell was
captured at against the current tree, and `gen:performance-matrix` chains it in process so the
comparison cannot be omitted. It was written to end one failure: on 2026-08-22 the physical iPad row
was captured, four engine commits landed the same evening, and an epic cited the published rows as
current evidence for a build nobody was running. From its first commit it exited non-zero on any
stale row, on the reasoning that regenerating the matrix is the moment a currency claim is made and
therefore the moment to check it.

That reasoning assumed the matrix is regenerated when its rows are recaptured. It is not, and it
cannot be. The full matrix is eleven targets by four modes by drawing, undo, and action suites, four
of them on physical devices that need a reserved rig, and the campaign that refreshes it runs
periodically (`docs/PROFILING-CAMPAIGNS.md`). Any product commit between campaigns moves the
measured surface, so every captured row is stale for most of its life by design. On 2026-09-02 a
single CSS commit landed after the campaign's capture, the checker marked the iPad row and all three
Mac rows stale, and every regeneration from then on exited 1 having already written its report.

The generator writes `data.json`, `index.md`, and `index.html` before the check runs, so the exit
code never withheld a report. What it did was make a routine state read as a broken one: a red
generator between campaigns is either ignored, which is the outcome the check exists to prevent, or
answered by relabelling rows preserved after every commit, which drains the preserved label of its
meaning as deliberate historical evidence.

Alternatives considered:

* **Keep failing and relabel rows preserved as they drift.** Rejected: preserved is a provenance
  claim about evidence kept on purpose, not a synonym for "the tree moved". Applying it after every
  commit would leave no row in the matrix claiming to be a measurement at all.
* **Render the staleness verdict into the published page.** Rejected: currency is relative to the
  reader's checkout, not to the commit that last regenerated the page. A committed page saying
  "current" is true only until the next product commit, which is the same defect in a more visible
  place. The page already publishes each row's source commit, which is the fact that stays true.
* **Wire the check into CI.** Rejected when the check was written, for the full-history clone it
  needs, and it would in any case be red on every commit between campaigns.
* **Narrow the measured surface until routine commits stop marking rows stale.** Rejected twice
  already (an enumerated `web/src/lib/drawing` scope, then `web/src` alone) because each narrowing
  missed a real product change on the measured path. The surface stays wide; the exit code is what
  changes.

## Decision

The default run reports and exits 0. `check:matrix-staleness` and the chained call inside
`gen:performance-matrix` print the per-row table as before, then a summary naming every stale row
and stating that drift between campaigns is expected. Neither mode calls an unreachable commit
current: an `UNVERIFIABLE` row is a warning by default rather than a failure.

`--strict` restores the failing behaviour for the one moment the original reasoning was right about:
the regenerate where a campaign asserts that every captured row is current. Under `--strict` a stale
or unreachable row exits non-zero with the rows named and the remedy stated — recapture them or mark
them preserved before asserting. The flag is accepted by both scripts
(`npm run check:matrix-staleness -- --strict`, `npm run gen:performance-matrix -- --strict`); the
generator's manifest stays positional and is the first argument that is not a flag.

The policy is one pure function, `stalenessOutcome` in `tools/perf/check-matrix-staleness.mjs`, so
both modes are tested without a repository or a process exit
(`tools/perf/tests/matrix-staleness.test.mjs`).

## Consequences

\+ A committed matrix that is behind the product, which is its normal state, no longer turns the
generator red. Publishing a report with some stale rows beats publishing nothing, and the rows'
source commits remain on the page.

\+ The failure the check exists to end still cannot happen silently: the drift is printed at every
regeneration, and the campaign wrap-up that claims currency runs `--strict` and fails on it.

\+ The preserved label keeps its meaning. A row is preserved because someone decided to keep it, not
because a commit landed.

− The check has no teeth unless someone passes `--strict`. The campaign runbook
(`docs/PROFILING-CAMPAIGNS.md`, step 3) and the regenerate steps of the `capture-performance-matrix`
and `improve-performance-matrix` skills all pass it, and a wrap-up that skips those steps can once
again publish stale rows as current. The default output names the stale rows either way, so the
omission is visible in the transcript rather than hidden.

− A reader of the console table has to know that STALE is informational by default. The summary line
says so on every run.
