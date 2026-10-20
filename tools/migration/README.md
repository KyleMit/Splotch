# Migration tools

Tooling for the React Native app in `experiments/native-architecture` while it migrates toward
replacing the Capacitor shell (epic 2690). It changes no shipping web or Capacitor build. Building
the native app itself is covered in `experiments/native-architecture/DEVELOPMENT.md`.

## Entry points

* `gen-offline-catalog.mjs` generates the native offline coloring-book catalog
  (`experiments/native-architecture/src/offlineLibrary/books.generated.ts`).
* `gen-bundled-farm.mjs` generates the bundled starter book's art modules
  (`experiments/native-architecture/src/drawing/bundledFarm/`) from the shipping Farm overlays, the
  compact-tier fills, the wide selectors and the covers in `web/static/coloring`: one line-art
  module per page, which the web export loads per page on first use (`bundledOutlines.web.ts`);
  `images.ts`, the same images as data URIs for the native apps; and `images.web.ts`, which imports
  the shipping files as hashed Metro assets so no image rides in a web startup script. `--check`
  verifies them and `tools/tests/native-starter-book.test.mjs` runs that check.
* `gen-native-icons.mjs` generates the native icon registry from every shipping SVG in
  `web/src/lib/icons` and its `deferred/` subdirectory, resolving themed parts and page tokens per
  theme and re-inking through `currentColor` exactly the icons outside the shipping `COLOR_ICONS`.
  `NATIVE_STARTUP_ICONS` (the icons the drawing screen mounts with) go in
  `experiments/native-architecture/src/rsdDrawing/icons.generated.ts`; every other icon goes in
  `icons.deferred.generated.ts` and Splotchy in `splotchy.generated.ts`, both lazily imported by
  `iconRegistry.ts`. `--check` verifies all three and `tools/tests/native-icons.test.mjs` runs that
  check, so adding, renaming or changing a shipping icon fails until you rerun
  `node tools/migration/gen-native-icons.mjs`. Move a name into `NATIVE_STARTUP_ICONS` only when the
  drawing screen renders it as it mounts; the web export prewarms the deferred module after first
  paint, and a lazy sheet opens only once it has arrived (ADR-0179).
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
* `tools/migration/tests/rsd-web-buttons.test.mjs` (in `test:tools`) spawns
  `tools/migration/render-rsd-web-buttons.mjs`, which compiles the RSD button primitives with the
  app's production Babel config for Metro's web caller and renders them, plus a caller passing a
  style array straight to `RsdPressable`, to markup, so a style the web transform cannot see fails
  before it ships.
* `test:migration:rsd-selection` runs the RSD drawing-screen tests through the released native
  renderer (`rsd-drawing-vitest.config.mjs`). They are excluded from `test:tools` because they need
  the native `react-strict-dom` alias. Both tiers select them by name: a test file named
  `tools/migration/tests/rsd-native-*.test.mjs` (`RSD_NATIVE_RENDERER_TESTS` in
  `lib/rsd-drawing-checks.mjs`) joins this suite with no list to edit, and
  `tests/rsd-test-tiers.test.mjs` fails when one runs in neither tier or in both. CI's Browserless
  tests job runs the tier on every pull request; its pre hook runs `svelte-kit sync`, so it needs no
  earlier `npm run check`. `tests/native-ci-wiring.test.mjs` fails if the tier, or
  `check:migration:types` (the candidate's own type check, in the Quality job), leaves CI. Among the
  tier's tests, `rsd-native-segmented-picker.test.mjs` and `rsd-native-slider.test.mjs` mount the
  shared `RsdSegmentedPicker` and `RsdSlider`/`RsdSliderRow` controls over the stand-in in
  `rsd-native-control-host.mjs` and hold each literal those ports carry, and the colour token each
  painted part takes, to the shipping Svelte sources. The picker's RTL thumb origin is laid out by
  React Native's own Yoga, which `rsd-yoga-host.mjs` compiles from the installed `react-native`'s
  `ReactCommon` sources with the system `c++`. `tools/migration/tests/rsd-native-button.test.mjs`
  and `tools/migration/tests/rsd-native-icon-button.test.mjs` mount the button primitives, and
  `tools/migration/tests/rsd-native-button-chrome.test.mjs` holds their untokened chrome values to
  `Button.svelte` and `app.css`.
* `build-native-web.mjs` (`npm run native:web:build`) exports the installable, offline web build.
  After the prerender it writes a Content-Security-Policy meta tag at the top of `index.html` and
  `404.html` (`lib/native-web-csp.mjs`): shipping's directives from `web/securityPolicy.ts`, with
  `script-src` holding `'self'` and the hash of each inline script the document carries, never
  `'unsafe-inline'`. Its post hook runs `check-native-web-precache.mjs`, which verifies the service
  worker and that both documents' policies hash every inline script, then
  `check-native-web-startup.mjs`, which holds the startup path to two caps (ADR-0180) and rejects an
  image inlined into it. `MAX_NATIVE_WEB_FIRST_PAINT_BYTES` holds the shell's inline code and the
  scripts, stylesheets and preloads the document names. `MAX_NATIVE_WEB_CORE_CONTROLS_BYTES` holds
  every script and stylesheet the controls wait for, including the bundle the boot script loads
  after first paint. Both are set from the measured export, and the check reports them against the
  shipping `MAX_STARTUP_JS_CSS_BYTES` plus the measured React Native Web floor. The constants'
  comments carry the numbers. A surface the drawing screen shows only on request loads through
  `drawingSheets.web.ts`, so it stays off that path, and mounts inside an `RsdSurfaceBoundary`, so a
  failed load cannot blank the drawing screen. The Install Banner, which waits for settled-in
  drawing, loads through `installBannerSurface.web.ts` once the browser offers an install; a failed
  load only leaves the banner out.
* `prerender-native-web.mjs` runs inside `native:web:build` (ADR-0180). It bundles
  `experiments/native-architecture/src/prerenderFirstFrame.tsx` for Node through Expo's own bundle
  request, renders the drawing screen's first frame for each size class, orientation and theme, and
  writes them into `index.html` as `<template>`s with a boot script that clones the fitting one into
  the root, sets Expo's hydration flag and loads the bundle after that frame's first contentful
  paint. It also inlines the exported style sheet, which would otherwise hold first paint for a
  round trip. `tools/tests/native-web-first-frame.test.mjs` runs the boot script against the
  generated shell. A module the drawing screen's first frame reads must render in Node (no `window`
  at import or during render, a server snapshot on every `useSyncExternalStore`), or this step fails
  the build.

## Layout

* `lib/` holds the RSD drawing-test paths and token projection those entry points import.
* `tests/` holds this capability's tests; the React Native product tests live in `tools/tests/`.
* `probes/native-eraser/` holds the eraser checkpoint fixtures and capture helpers the eraser tests
  import.
