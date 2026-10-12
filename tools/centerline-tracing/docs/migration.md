# Centerline tracer source snapshot

This directory began as an allowlisted source snapshot from the local `svg-fill-to-path` repository
at commit `98101ffc574aa42266f538ecef0a765f8476e1fd` (2026-08-07).

The snapshot includes the production tracer and graph implementation, the three production Node
bridges, the invariant test, source SVG fixtures, the synthetic benchmark corpus and numeric
records, the source manifest, one representative golden SVG, and the source documentation needed to
explain the algorithm and its tuning.

It deliberately excludes the source repository's Git history, environment and package installs,
packaging files, generated graph dumps, review sheets and images, comparison-only code, and scratch
artifacts. The next commit adapts this frozen snapshot to Splotch's isolated tool layout and
conventions; the sibling checkout is never an operational dependency.
