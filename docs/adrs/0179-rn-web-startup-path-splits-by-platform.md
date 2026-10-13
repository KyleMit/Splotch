# ADR-0179: The React Native Web Startup Path Splits by Platform, Under a Measured Byte Cap

**Status:** Active **Date:** 2026-10

## Context

The React Native app in `experiments/native-architecture` (epic 2690) ships one codebase to Android,
iOS and a web export (`npm run native:web:build`, an `expo export --platform web` wrapped by
`tools/migration/build-native-web.mjs`). If that web export replaces the shipping PWA, it inherits
the shipping startup budget: `MAX_STARTUP_JS_CSS_BYTES` (525,000 bytes) in
`tools/check-bundle-budgets.mjs`, which the "startup path is a budget" coding standard enforces.

Issue 2835 measured the web export's entry chunk at 5,168,786 bytes, almost all of it on the path to
first paint:

* 1,975,570 bytes of base64 WebP: every bundled Farm fill, selector and cover (ADR-0103's starter
  book), inlined as data URIs by `tools/migration/gen-bundled-farm.mjs`.
* About 1.1 MB of Farm line art, all six pages, imported statically.
* About 750 KB of Reanimated, imported at the entry only because native Skia needs it to be
  initialized first (ADR-0178). The web export draws without Skia.
* Every sheet the drawing screen shows only on request: AI, feedback, parent center, parental gate,
  settings, the coloring book picker, the color picker and the AI waiting print.

Options considered:

* **Serve images as Metro assets on every platform.** On native, an asset `require` resolves to an
  Android drawable resource name or an iOS bundle path. Skia's `Skia.Data.fromURI` path in
  `SkiaInk.tsx`, the readiness decode in `useBundledFillReadiness.tsx` and SVG capture would each
  need a per-platform asset lookup. That change was unverifiable without devices, for a problem the
  native apps do not have: they load one local bundle and never download a startup script.
* **Make everything lazy on every platform.** On native, Metro collapses `import()` into the single
  bundle, so a lazy module still resolves a tick later. That adds a render without the module (an
  empty outline, a suspended sheet) and saves nothing. It would also change timing that the
  native-renderer tests and the Skia capture path depend on.
* **Hold the RN web export to 525,000 bytes as-is.** That is unreachable. An empty app made of
  `registerRootComponent` and one `View` already exports 323,984 bytes of JavaScript (React DOM,
  React Native Web's core and Expo's runtime), which the shipping Svelte app never pays.

## Decision

Web-only behavior lives in `.web.ts` platform splits. Metro resolves the split at build time, so
native keeps its synchronous, offline-complete bundle unchanged.

* **Sheets and line art load lazily on web only.**
  * `src/rsdDrawing/drawingSheets.ts` re-exports each on-request surface for native.
    `drawingSheets.web.ts` loads the same modules through `lazySurface.ts`, which renders nothing
    until its chunk arrives.
  * A chunk can fail to load: offline before the service worker has installed, or on a deploy that
    removed it. `RsdDrawingScreen.tsx` and `RsdPaperSlot.tsx` mount every lazy surface inside its
    own `RsdSurfaceBoundary`, so a failure replaces only that surface with a dialog ("This did not
    load. Check your connection and try again.", Try again / Keep drawing). The drawing screen
    stays. Without a boundary, React unmounts the whole root.
  * A failed load is forgotten, so Try again fetches the chunk afresh. `createLazyExport` (shared
    with the icon registry) drops its rejected promise, as `web/src/lib/singleFlight.ts` does in the
    shipping app, and Expo's async-require drops its own. `React.lazy` is not used because it keeps
    a rejected load for the life of the page. The shipping app's equivalent closes the modal and
    logs the error (`pageParentCenter.svelte.ts`). The RN app shows the dialog instead, because its
    route already shows the sheet when the load fails.
  * The settings content lives in `RsdSettingsDialog.tsx`, so it can be its own chunk.
    `NativeDialog.tsx` keeps only the dialog frame that startup surfaces share.
  * `src/drawing/bundledOutlines.ts` imports all six pages' line art for native.
    `bundledOutlines.web.ts` loads each page as its own chunk on first use, through the shared
    `src/lazyExport.ts` (the contract ADR-0164 set for deferred icons).
  * `tools/tests/native-web-lazy-modules.test.mjs` pins the two sheet files to the same names and
    modules.
* **Images are data URIs on native and hashed asset files on web.**
  * `gen-bundled-farm.mjs` writes `bundledFarm/images.ts` (data URIs) and
    `bundledFarm/images.web.ts` (imports of the shipping `web/static/coloring` files, resolved
    through `Asset.fromModule`).
  * `tools/tests/native-starter-book.test.mjs` proves both modules carry the same shipped bytes slot
    for slot.
  * Consequence for capture: a page fill can now be a URL on web. An SVG decoded as an image loads
    nothing outside itself, so `CaptureSvg.web.tsx` fetches each non-data `<image>` href and inlines
    it as a data URI before rasterizing. The same fix covers offline-library fills served as object
    URLs.
  * `PictureCapture.tsx` waits on `usePageOutlineReady`, so a capture never draws a page whose line
    art has not loaded.
* **Reanimated stays off web.** `src/index.ts` imports `platform/skiaRuntime`. On native that module
  imports Reanimated ahead of Skia, as ADR-0178 requires. The `.web.ts` split is empty.
* **A measured byte cap guards the startup path.**
  * `tools/migration/check-native-web-startup.mjs` runs in `postnative:web:build`. It sums
    everything `index.html` makes the browser fetch or run before first paint, and rejects any
    base64 image run in that code:
    * external scripts, stylesheets, module preloads and script or style preloads, each URL counted
      once;
    * executable inline scripts;
    * inline CSS.
  * `check-native-web-precache.mjs` requires every Farm image and page chunk to be precached for
    offline use. It rejects Farm line art or deferred icons found in a script the shell loads.
  * The target is `NATIVE_WEB_STARTUP_TARGET_BYTES` = `MAX_STARTUP_JS_CSS_BYTES` + the 323,984-byte
    React Native Web floor (`REACT_NATIVE_WEB_FLOOR_BYTES`) = 848,984 bytes. That is the cost the
    export would have if its app code were as lean as the shipping app's.
  * The reviewed startup after this change is 1,189,500 bytes, 340,516 bytes over that target. The
    cap, `MAX_NATIVE_WEB_STARTUP_BYTES` = 1,220,000, is that measurement plus 30,500 bytes of
    headroom. The headroom stays below the AI sheet's 42 KB chunk, so statically importing that
    sheet fails the build (measured at 1,231,566 bytes).
  * The cap is a ratchet. Consuming the headroom is the cue to take the next lever, not to raise the
    number.

The two remaining levers, measured from the export's source map:

1. **Lazy product owners, about 130 KB.** AI generation and recovery with its storage and vault
   (`src/ai/`, the AI half of `src/platform/`, `web/src/lib/ai/`), plus feedback and the offline
   library controller. They start eagerly in `useDrawingProduct` because the AI owner resumes an
   in-flight generation at launch. Deferring them is a product-layer change, not a bundling one.
2. **React Native Web's `Animated`, about 100 KB.** The clear gesture (`useClearGesture.ts`,
   `RsdClearControl.tsx`, `RsdClearCoachmark.tsx`) imports it. RNW's `Animated` in turn imports
   `FlatList`, `SectionList` and `VirtualizedList`, which the app itself never renders.

## Consequences

* \+ First paint on a throttled phone dropped from 13.2 s LCP and 2,346 KB transferred to about
  2.7–2.9 s and 351 KB (Lighthouse, simulated Slow 4G and 4× CPU, local brotli server). The shipping
  app on the same server measured 0.9–1.3 s.
* \+ The offline precache shrank from 6.18 MB to 4.89 MB, because WebP files no longer pay base64
  overhead. No precached file now needs more than Workbox's 2 MiB per-file default, so
  `build-native-web.mjs` dropped its 8 MiB allowance.
* \+ Native bundles are unchanged. The Android release bundle still carries all 38 data URIs and all
  line art.
* − Each lazy surface has two platform files whose exports must agree. TypeScript checks consumers
  against the native file only. The parity test covers the sheets; the outline hook's two
  implementations share a signature by convention.
* − On web, a sheet's first open waits for its chunk. After install the chunk comes from the service
  worker cache, but a Farm page's outline and Magic fill can paint a frame after the paper does.
* − The startup cap sits about 2.3× above the shipping budget and is set from measurement, not from
  the shipping number. Closing the gap needs the two levers above.
* − Web capture now does a network or cache fetch per file-served fill. A failed fetch fails the
  capture closed (an empty result), as a decode error already did.
