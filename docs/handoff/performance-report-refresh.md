# Handoff — refresh the committed performance report

> 2026-07-31 · branch `experiment/trusted-ipad-input` · PR
> [#682](https://github.com/KyleMit/Splotch/pull/682) · Publish a current-build normalized dataset
> and visualization after the remaining target captures and final regression sweep.

## Objective & non-goals

**Objective.** Update the committed JSON, Markdown, and interactive visualization so every row is
clearly tied to the final product commit and includes all available deployment targets.

**Non-goals.** Do not erase legitimate failures, combine different product commits into an
unlabelled “current” matrix, or commit raw device identifiers/timelines.

## State

The report lives at `scrapbook/performance/2026-07-31-deployment-target-matrix/` and currently
describes product commit `09c4efac27ca`. Its `data.json` retains drawing phases/runs and 46 grouped
actions for seven targets; `index.html` provides the multi-dimensional visualization and `index.md`
provides the readable summary. The branch now contains later product fixes through `b91fcc08`, so
the report is no longer a final-current-build snapshot.

Regenerate after editing `sources.json`:

```sh
node scripts/perf/deployment-matrix-report.mjs \
  scrapbook/performance/2026-07-31-deployment-target-matrix/sources.json
```

## Decisions made (and why)

* `data.json` is the committed source for analysis; raw traces stay in gitignored `perf-profiles/`.
* The visualization presents gate margin, target/transport, interaction, P95/P99/max, and failure
  rank without hiding unavailable rows.
* Simulator/local values are advisory. Physical calibrated runs are the approval tier.
* Historical pre-tiling simulator evidence remains in ADR-0090/GitHub discussion, not the current
  build report.

## Unverified assumptions

* All seven existing targets need a complete final-commit rerun rather than only focused changed
  interactions. The user’s “current build” request favors a full refresh; confirm scope only if the
  cost is prohibitive.
* Physical Android captures will be available before report finalization.
* The action plan’s added setting action changes the grouped action count; the report generator may
  need no schema change, but this must be verified.

## Done & verified

* The report generator, normalized schema, committed JSON, Markdown, and HTML exist.
* Seven target snapshots were generated and checked.
* Unavailable Android rows are represented explicitly.
* The report documents the acceptance gates and input-fidelity distinctions.

## Risks & next 3 steps

1. Finish physical Android capture and the final action regression first; inventory source artifact
   product SHAs before editing `sources.json`.
2. Rerun any stale target needed for a single-commit matrix, regenerate all outputs, and inspect the
   HTML plus Markdown tables for missing dimensions or misleading gate labels.
3. Run report-generator tests/format checks, commit the report snapshot, and link it from PR #682.

The largest integrity risk is silently mixing `09c4efac` drawing/action captures with later fixed
actions while labeling the result as one build.

## Reread first

* `scrapbook/performance/2026-07-31-deployment-target-matrix/index.md`
* `scrapbook/performance/2026-07-31-deployment-target-matrix/sources.json`
* `scripts/perf/deployment-matrix-report.mjs`
* `scripts/tests/perf-deployment-matrix-report.test.mjs`
* `docs/adrs/0090-tiered-real-ipad-performance-regression-gates.md`
