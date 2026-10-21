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
  `404.html` (`lib/native-web-csp.mjs`): shipping's native meta policy from `web/securityPolicy.ts`,
  whose `connect-src` admits the hosted API origin from any serving origin, with `script-src`
  holding `'self'` and the hash of each inline script the document carries, never `'unsafe-inline'`.
  Its post hook runs `check-native-web-precache.mjs`, which verifies the service worker and that
  both documents' policies hash every inline script, then `check-native-web-startup.mjs`, which
  holds the startup path to two caps (ADR-0180) and rejects an image inlined into it.
  `MAX_NATIVE_WEB_FIRST_PAINT_BYTES` holds the shell's inline code and the scripts, stylesheets and
  preloads the document names. `MAX_NATIVE_WEB_CORE_CONTROLS_BYTES` holds every script and
  stylesheet the controls wait for, including the bundle the boot script loads after first paint.
  Both are set from the measured export, and the check reports them against the shipping
  `MAX_STARTUP_JS_CSS_BYTES` plus the measured React Native Web floor. The constants' comments carry
  the numbers. A surface the drawing screen shows only on request loads through
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
* `prerender-native-web-pages.mjs` runs next, for every route-table page whose document is its own
  (`APP_PAGE_DOCUMENTS` in `src/information/appPages.ts`; `/privacy` first). It writes
  `<page>.html`, which a static host serves at the page's path by pretty URL:
  * The page's whole markup, rendered in Node from `src/pageDocument/prerender.tsx`, once per layout
    (phone, short, framed, desktop) and theme. Without JavaScript a media query shows the one that
    fits; with it the boot script keeps that one as the root and hydrates it. Each variant's
    fragment targets carry its key, so a link without JavaScript reaches the shown copy; the boot
    script strips the key from the kept one.
  * Every style sheet inline, and the page entry (`src/pageDocument/pageApp.ts`) held until the page
    has painted. The entry is its own bundle, chunked as `expo export` chunks the drawing screen's,
    never a branch of the drawing screen's entry. Its bundles resolve the lazy facades listed in
    `experiments/native-architecture/scripts/page-document-resolution.cjs` to the modules they wrap.
  * A drift guard first resolves the drawing screen's whole module graph and fails the build if it
    reaches anything under `src/pageDocument/`. Chunks only a page document loads stay out of the
    precache: the worker answers a page document's path from the network, and offline from the app
    shell, which shows the same page over the paper.
  * `check-native-web-startup.mjs` holds each page document to its own first-paint and page-entry
    budgets (`MAX_NATIVE_WEB_PAGE_BYTES`, each page's first measured build plus 10%), then
    `check-native-web-pages-without-js.mjs` loads it in Chromium with JavaScript off in every layout
    and theme and fails unless it reads in full, with each link that would ask for the grown-up
    check naming its address instead of linking it.
* `prerender-native-web-admin.mjs` then writes `admin.html`, the admin console at `/admin`
  (`UNLINKED_DOCUMENT_PATHS` in `src/information/appPages.ts`; ADR-0101: no page links to it):
  * Its own entry, `experiments/native-architecture/src/pageDocument/admin/adminApp.tsx`, hydrates
    with React DOM and React Strict DOM's `html.*` alone, so it loads no React Native Web. It signs
    in through `POST /api/admin/login` and keeps the bearer session in `localStorage` (issue 3007's
    owner decision), managing codes through `/api/admin/tokens`.
  * Its markup is rendered in Node from
    `experiments/native-architecture/src/pageDocument/admin/prerender.tsx`, once per theme. Its CSS
    is the console's own rules, compiled by the RSD PostCSS plugin over its sources
    (`experiments/native-architecture/scripts/admin-document-styles.mjs`), which
    `postcss.config.mjs` leaves out of the export's `strict.css`, so the drawing screen's inline
    first paint carries none of them.
  * Its head carries `noindex`; the worker never precaches it or its chunks and leaves `/admin` to
    the network. The `Cache-Control: no-store` the SvelteKit console sends belongs in `netlify.toml`
    once it publishes the export.
  * `check-native-web-admin.mjs` runs last in the post-build hook. It drives the console in Chromium
    on a Netlify-shaped local host with the real `/api` function under a test admin secret, in both
    the dev mode (sign-in persisting across a reload, list, add, remove, a 401 and sign-out each
    forgetting the session) and the deployed mode (same-origin bearer writes pass the CSRF guard).

## Layout

* `lib/` holds the RSD drawing-test paths and token projection those entry points import.
* `tests/` holds this capability's tests; the React Native product tests live in `tools/tests/`.
* `probes/native-eraser/` holds the eraser checkpoint fixtures and capture helpers the eraser tests
  import.
