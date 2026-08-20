# Centerline tracing runbook

The public overview and contract live in [the capability README](../README.md). This runbook covers
the operator sequence.

## Install

Install uv as a system CLI, then install the repository's root Node graph with pnpm. Do not create a
root Python project or run pip:

    brew install uv
    pnpm install --frozen-lockfile

The first explicit tracer command lazily creates the local .venv from the committed lockfile.

## Trace

Trace one file or a directory only through explicit paths:

    npm run gen:centerlines -- \
      --input tools/centerline-tracing/tests/fixtures/filled/house-wide.svg \
      --output /tmp/house-wide.svg

    npm run gen:centerlines -- \
      --input tools/centerline-tracing/tests/fixtures/filled \
      --output /tmp/centerlines

The command validates the full batch before extraction and promotes no output until every trace
succeeds. Keep piecewise width mode for store-drawing assets unless a measured comparison supports
another choice.

## Verify

Run the quick suite:

    npm run test:centerline-tracing

Run the representative metric-threshold integration trace:

    uv run --project tools/centerline-tracing --locked \
      pytest -m integration tools/centerline-tracing/tests/test_integration.py

To prove the current filled fixtures reproduce the store-drawing handoff, trace the seven named
inputs into a temporary directory and compare their bytes with tools/store-drawings/samples/. Then
run:

    npm run gen:store-drawings:check

## Re-measure

The full corpus is deliberately manual:

    npm run perf:centerline-tracing

It refreshes benchmark/metrics.json and may create gitignored benchmark/graphs/, benchmark/out/, and
benchmark/promoted/ working artifacts. Review numeric regressions against the committed record.
Movement beyond 10 percent on error, wobble, boundary P95, or centerline P95 requires inspecting the
affected SVGs before updating the record.

## Troubleshooting

* Missing uv: install it; the wrapper never auto-installs system tools.
* Lock drift: run uv lock only after an intentional pyproject change, then review uv.lock.
* Node bridge failure: run pnpm install --frozen-lockfile at the repository root.
* SciPy/BLAS variation: compare the representative trace on metric thresholds, never exact golden
  bytes. Exact bytes remain the requirement for regenerating the committed Splotch sample inputs
  under the locked toolchain.
* Interrupted or failed batch: prior output remains authoritative; no partial replacement is
  promoted.
