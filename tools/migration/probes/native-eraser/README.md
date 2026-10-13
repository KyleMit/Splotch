# Eraser checkpoint helpers

These modules hold the eraser checkpoint fixtures (`checkpoint-fixtures.mjs`), the SVG capture
observer and owner classification (`checkpoint-observation.mjs`, `checkpoint-svg-owners.mjs`,
`checkpoint-retention.mjs`) and the browser process-tree resource accounting
(`checkpoint-resources.mjs`) that the eraser composition, capture observation and capture SVG tests
in `tools/tests/` import. `checkpoint-evidence.mjs` held the pixel comparisons of a browser run.

The browser driver that ran them against the app reopened its fixtures through the Pictures control,
which the native app no longer has, so it was deleted. A browser checkpoint run needs a new driver
that loads its fixtures some other way.
