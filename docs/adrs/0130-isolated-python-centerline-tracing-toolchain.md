# ADR-0130: Isolate the Python Centerline-Tracing Toolchain Behind an Opt-In Node Entry Point

**Status:** Active **Date:** 2026-08

## Context

Converting filled SVG artwork into editable centerline strokes needs geometry and image-processing
libraries that are mature in Python: NumPy, SciPy, scikit-image, Shapely, and skan. Splotch had no
Python project, Python lockfile, or Python CI contract. Pulling those libraries into the ordinary
application lifecycle would make every install and test pay for a specialist asset-authoring tool
that the shipped app never imports.

The working implementation was developed in a separate repository. Its useful boundary was source
and source-like evidence: the tracer modules, synthetic SVG corpus, filled-input fixtures, one
golden trace, numeric benchmark records, and design notes. Its Git history, virtual environment,
bulk rendered outputs, and exploratory reports were not part of Splotch's durable contract.

The tracer also needs two Node libraries. `@resvg/resvg-js` provides deterministic rasterization,
and `fit-curve` fits Bézier paths. Moving either operation into a second package graph would violate
the repository's one-root-package decision, while moving the whole tracer to JavaScript would
discard the validated Python geometry implementation.

## Decision

The centerline tracer is an **isolated, opt-in capability** under `tools/centerline-tracing/`.

* Import the upstream source through an explicit allowlist at revision
  `98101ffc574aa42266f538ecef0a765f8476e1fd`. Preserve that snapshot in its own commit, with no
  nested repository metadata, environment, cache, or bulk rendered artifacts. The migration note and
  source manifest retain the copy boundary and provenance.
* Keep one `pyproject.toml`, one `uv.lock`, and one `.python-version` inside the capability. Python
  is constrained to 3.11. uv creates or refreshes the local environment only when an operator runs a
  centerline command; there is no root requirements file, workspace registration, or bootstrap hook.
* Expose the supported local interface through the purpose-named Node entry point
  `trace-centerlines.mjs` and the documented `npm run gen:centerlines -- …` command. The wrapper
  verifies uv is available, then executes the locked project. Input and output paths are mandatory;
  a batch stages all SVGs and its deterministic manifest before atomically promoting any result.
* Keep `@resvg/resvg-js` and `fit-curve` in the root `devDependencies`, consistent with the single
  package graph and ADR-0070's Netlify split. Thin `.mjs` bridges isolate their CommonJS/native APIs
  from Python. `fit-curve` is dormant upstream, so its bridge is also the seam for replacing or
  vendoring the compact algorithm later.
* Exclude the tracer from `npm test`, application builds, Netlify production dependencies, and the
  deploy path filter. A dedicated workflow runs only when the capability or its workflow changes; it
  pins Python and uv, syncs the lockfile, runs the quick Python/Node contract suite, and performs
  one representative integration trace. Benchmarks remain manual review evidence.
* Retain synthetic source fixtures, all imported filled SVGs, one golden SVG, and numeric benchmark
  records. Generated batch outputs and review renders stay ignored. Downstream store-drawing
  compilation consumes ordinary stroked SVG and may merge only contiguous same-style segments.

This record governs the repository language, package, and CI boundary. Algorithm tuning and
asset-specific experiments belong in `tools/centerline-tracing/docs/`, following the asset-tooling
documentation carve-out recorded in the ADR index.

## Consequences

* \+ Splotch owns a reproducible, provenance-preserving tracer without making Python part of the app
  runtime or the default contributor/test path.
* \+ Explicit paths, staged promotion, content hashes, configuration, implementation identity, and
  numeric metrics make traces reviewable and failures non-destructive.
* \+ The dedicated path-filtered workflow prevents the imported implementation and its native Node
  bridge from silently rotting while avoiding unrelated CI cost.
* \+ The one-root Node graph and isolated uv graph each keep a single lockfile and a clear owner.
* − A contributor who needs this uncommon tool must install uv; the wrapper fails early with the
  platform-specific prerequisite instead of bootstrapping system software.
* − Python and native resvg binaries add a second language/toolchain surface that dependency audits
  and action-pin maintenance must cover.
* − Re-importing upstream work is deliberate rather than automatic: choose a source revision, review
  an allowlist diff, update the provenance note, regenerate `uv.lock`, and re-run the golden plus
  numeric regression suite. If the capability is removed, delete its folder, three npm scripts, two
  root dev dependencies, dedicated workflow, knip entries, and these documentation references as one
  change.
