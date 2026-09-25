# Centerline tracing

This opt-in asset capability turns filled SVG artwork into compact, unfilled centerline strokes. It
is the middle of Splotch's prompt-to-pointer pipeline:

1. Generate a raster image from a prompt.
2. Trace it into filled SVG shapes with [tools/vectorize](../vectorize/README.md).
3. Trace the fills into centerlines with this capability.
4. Compile those centerlines into Splotch pointer instructions with
   [tools/store-drawings](../store-drawings/README.md).

The app, Netlify build, native builds, releases, aggregate npm test, and default CI do not install
or invoke Python. The asset-generation maintainers own this directory and its optional environment.

## Entry points

| Command                         | Purpose                                                              |
| ------------------------------- | -------------------------------------------------------------------- |
| npm run gen:centerlines -- …    | Trace an explicit SVG file/directory into an explicit file/directory |
| npm run test:centerline-tracing | Run quick Python, bridge, determinism, and consumer-contract checks  |
| npm run perf:centerline-tracing | Refresh the long corpus and committed-input benchmark records        |

The production command requires --input and --output:

    npm run gen:centerlines -- \
      --input tools/centerline-tracing/tests/fixtures/filled/balloon-tall.svg \
      --output /tmp/balloon-tall.svg

    npm run gen:centerlines -- \
      --input tools/centerline-tracing/tests/fixtures/filled \
      --output /tmp/splotch-centerlines

A file input accepts an output SVG or existing directory. A directory input requires an output
directory. The command validates every input before tracing, stages the entire batch, and promotes
outputs plus the JSON manifest only after every member succeeds. A failed member is reported by
path, returns nonzero, and leaves prior outputs unchanged.

## Prerequisites and environment

Install [uv](https://docs.astral.sh/uv/) and the root Node dependencies. On macOS:

    brew install uv
    pnpm install --frozen-lockfile

Linux installation is documented by uv upstream. The wrapper never installs a system tool. If uv is
absent it exits before creating output and prints the setup hint. Explicit generation runs uv with
--project tools/centerline-tracing, --locked, and --no-dev; tests and benchmarks retain the
development dependency group.

That command lazily creates tools/centerline-tracing/.venv from .python-version, pyproject.toml, and
uv.lock; it does not install into the repository root or global Python. @resvg/resvg-js and
fit-curve remain root devDependencies because Splotch has one Node package graph. The bridges are
flat .mjs files at this capability root so repository dead-code and specifier guards see them.

## Inputs, outputs, and controls

Inputs are filled SVG artwork parseable by svgelements and Shapely. Outputs obey the
[store-drawing compiler](../store-drawings/gen-pointer-instructions.mjs) contract: a zero-origin
viewBox, unfilled stroked groups, round caps and joins, absolute supported path commands, and
explicit stroke widths. Piecewise widths remain the default for raster fidelity; the store-drawing
compiler chains continuations before quantizing each chain to Splotch's five pen sizes, so piecewise
width costs pointer strokes only where the width genuinely changes.

The manifest records each source SHA-256, normalized configuration, chosen pruning lambda, pinned
source snapshot, fidelity/error/wobble metrics, and final output path. Results are deterministic for
the same source bytes, lockfile, configuration, seed, and machine. Measured defaults are named in
src/centerline_tracing/cli.py:

* raster scale 8, except scale 2 for the two thin-detail square fixtures;
* seed 0, required because scikit-image randomizes medial-axis tie breaking;
* piecewise width emission;
* the measured pruning sweep from 0 through 10 stroke widths.

Override them only while following [docs/tuning.md](docs/tuning.md), using --scale, --lambda,
--seed, --simplify-epsilon, or --width-mode.

## Layout and maintenance

* src/centerline_tracing/graph/ owns schema, pruning, scoring, geometry, and SVG fill parsing.
* src/centerline_tracing/pipeline/ owns raster extraction, Skan graph conversion, Bézier fitting,
  stroke emission, and the manual benchmark.
* tests/fixtures/filled/ holds the imported filled inputs; tests/fixtures/golden/ holds one
  representative metric-threshold golden.
* benchmark/corpus/, benchmark/metrics.json, and benchmark/scale-sweep.md retain source-like cases
  and numeric evidence. Generated graphs, render sheets, and bulk outputs stay uncommitted.
* [docs/migration.md](docs/migration.md) records the allowlisted source snapshot and copy boundary.
  The algorithm, graph schema, measured tuning, and hard-won failure modes remain in docs/.

To upgrade, change dependencies in pyproject.toml, refresh uv.lock, execute the quick and
integration checks on macOS and Linux, refresh the benchmark, and review metric movement. To import
a newer sibling snapshot, repeat the allowlist review and record the source revision; never make
that checkout a runtime path. To remove the capability, delete this directory, its three root
scripts and descriptions, two root devDependencies, dedicated workflow, documentation links, ADR,
and knip entries—no application code depends on it.
