# Eraser checkpoint helpers

These modules hold the eraser checkpoint fixtures (`checkpoint-fixtures.mjs`), the SVG capture
method patch and owner classification (`checkpoint-observation.mjs`, `checkpoint-svg-owners.mjs`)
and the browser process-tree resource accounting (`checkpoint-resources.mjs`) that the eraser
composition, capture observation and capture SVG tests in `tools/tests/` import.

No browser driver runs them against the app: the native app has no Pictures control to reopen
fixtures through. A browser checkpoint run needs a driver that loads its fixtures some other way.
