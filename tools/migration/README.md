# Migration tools

Tooling for the React Native app in `experiments/native-architecture` while it migrates toward
replacing the Capacitor shell (epic 2690). It changes no shipping web or Capacitor build. Building
the native app itself is covered in `experiments/native-architecture/DEVELOPMENT.md`.

## Entry points

* `gen-offline-catalog.mjs` generates the native offline coloring-book catalog
  (`experiments/native-architecture/src/offlineLibrary/books.generated.ts`).
* `gen-bundled-farm.mjs` generates the bundled starter book's art modules
  (`experiments/native-architecture/src/drawing/bundledFarm/`) from the shipping Farm overlays, the
  compact-tier fills and the wide selectors in `web/static/coloring`; `--check` verifies them and
  `tools/tests/native-starter-book.test.mjs` runs that check.
* `gen-native-icons.mjs` generates the native icon registry from every shipping SVG in
  `web/src/lib/icons` and its `deferred/` subdirectory, resolving themed parts and page tokens per
  theme and re-inking through `currentColor` exactly the icons outside the shipping `COLOR_ICONS`.
  `NATIVE_STARTUP_ICONS` (the toolbar and Parental Gate keypad) go in
  `experiments/native-architecture/src/rsdDrawing/icons.generated.ts`; every other icon goes in
  `icons.deferred.generated.ts` and Splotchy in `splotchy.generated.ts`, both lazily imported by
  `iconRegistry.ts`. `--check` verifies all three and `tools/tests/native-icons.test.mjs` runs that
  check, so adding, renaming or changing a shipping icon fails until you rerun
  `node tools/migration/gen-native-icons.mjs`. Move a name into `NATIVE_STARTUP_ICONS` only when a
  startup surface renders it.
* `gen-native-branding.mjs` copies the shipping launcher icon, adaptive icon, splash, and launch
  screen (the `@capacitor/assets` output under `android/app/src/main/res` and `ios/App/App`) into
  the native Android and iOS projects, removing stale copies; `--check` verifies them and
  `tools/tests/native-branding.test.mjs` runs that check. Rerun it with
  `node tools/migration/gen-native-branding.mjs` after regenerating the shipping assets.
* `check:migration:rsd-drawing-tokens` checks the react-strict-dom drawing screen's token projection
  against the shared design owner. `gen-rsd-drawing-tokens.mjs` rewrites that projection
  (`experiments/native-architecture/src/rsdDrawing/tokens.css.ts`) after a shipping token changes:
  `node --experimental-strip-types tools/migration/gen-rsd-drawing-tokens.mjs`.
  `tools/migration/tests/rsd-drawing-tokens.test.mjs` holds every shipping token, light and dark, to
  its projected value, and `tools/migration/tests/rsd-native-token-specimen.test.mjs` renders the
  specimen in `tools/migration/tests/rsd-token-specimen.mjs` through the released native renderer.
* `test:migration:rsd-selection` runs the RSD drawing-screen tests through the released native
  renderer (`rsd-drawing-vitest.config.mjs`). They are excluded from `test:tools` because they need
  the native `react-strict-dom` alias. `tools/migration/tests/rsd-native-button.test.mjs` and
  `tools/migration/tests/rsd-native-icon-button.test.mjs` among them mount the button primitives,
  and `tools/migration/tests/rsd-native-button-chrome.test.mjs` holds their untokened chrome values
  to `Button.svelte` and `app.css`.
* `build-native-web.mjs` (`npm run native:web:build`) exports the installable, offline web build;
  `check-native-web-precache.mjs` verifies its service worker as the post hook.
* `verify-drawing-dev.mjs` drives the browser preview and saves a painted PNG for a quick visual
  check.

## Layout

* `lib/` holds the RSD drawing-test paths and token projection those entry points import.
* `tests/` holds this capability's tests; the React Native product tests live in `tools/tests/`.
* `probes/native-eraser/` is the browser checkpoint driver the eraser composition tests import.
