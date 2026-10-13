# Migration tools

Tooling for the React Native app in `experiments/native-architecture` while it migrates toward
replacing the Capacitor shell (epic 2690). It changes no shipping web or Capacitor build. Building
the native app itself is covered in `experiments/native-architecture/DEVELOPMENT.md`.

## Entry points

* `gen-offline-catalog.mjs` generates the native offline coloring-book catalog
  (`experiments/native-architecture/src/offlineLibrary/books.generated.ts`).
* `gen-native-icons.mjs` generates the drawing toolbar's icon module
  (`experiments/native-architecture/src/rsdDrawing/icons.generated.ts`) from the shipping SVGs in
  `web/src/lib/icons`, resolving themed icon parts per theme; `--check` verifies it and
  `tools/tests/native-icons.test.mjs` runs that check. Add an icon to `NATIVE_ICON_SOURCES` and
  rerun it with `node tools/migration/gen-native-icons.mjs`.
* `check:migration:rsd-drawing-tokens` checks the react-strict-dom drawing screen's token projection
  against the shared design owner.
* `test:migration:rsd-selection` runs the RSD drawing-screen tests through the released native
  renderer (`rsd-drawing-vitest.config.mjs`). They are excluded from `test:tools` because they need
  the native `react-strict-dom` alias.
* `verify-drawing-dev.mjs` drives the browser preview and saves a painted PNG for a quick visual
  check.

## Layout

* `lib/` holds the RSD drawing-test paths and token projection those entry points import.
* `tests/` holds this capability's tests; the React Native product tests live in `tools/tests/`.
* `probes/native-eraser/` is the browser checkpoint driver the eraser composition tests import.
