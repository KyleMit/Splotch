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
    `bundledFarm/images.web.ts` (imports of the shipping `web/static/coloring` files, whose URLs
    `webAssetUri` in `platform/webAsset.ts` reads; see the fourth cut).
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
    offline use. It rejects Farm line art, deferred icons or release notes found in a script the
    shell loads.
  * The target is `NATIVE_WEB_STARTUP_TARGET_BYTES` = `MAX_STARTUP_JS_CSS_BYTES` + the 323,984-byte
    React Native Web floor (`REACT_NATIVE_WEB_FLOOR_BYTES`) = 848,984 bytes. That is the cost the
    export would have if its app code were as lean as the shipping app's.
  * Issue 2835 left the startup at 1,189,500 bytes. The modal frame (issue 2842) brought it to
    1,219,090, against a 1,220,000 cap. Issue 2844 took the two levers below and reviewed the
    startup at 993,619 bytes, 144,635 over the target. The third cut (below) took the startup icon
    set and `react-native-svg` off the path, reached 877,862 bytes, and with the AI flow (PR 2869)
    merged was reviewed at 894,104, 45,120 over. The fourth cut (below) reviewed it at 858,902,
    9,918 over. Expo SDK 58's React 19.3 took it to 900,361, and the fifth cut (below) reviewed it
    at 838,334, 10,650 under the target.
  * The cap, `MAX_NATIVE_WEB_STARTUP_BYTES`, is the reviewed measurement plus 11,896 bytes of
    headroom, the margin the 906,000 cap kept over 894,104: 870,798 after the fourth cut, 850,230
    after the fifth. The headroom stays below every move through the third cut (the smallest, the
    offline library controller, is 24,471 bytes) and below both fifth-cut levers, so undoing one
    fails the build. So does statically importing the AI sheet (measured at 1,099,429 bytes against
    the earlier base). Two of the fourth cut's levers are smaller than the headroom, so each of its
    three fails its own check instead.
  * The cap is a ratchet. Consuming the headroom is the cue to take the next lever, not to raise the
    number.
  * Amended 2026-10-19: the owner raised the cap for the Expo SDK 58 / React 19.3 upgrade (PR 3000).
    React DOM 19.3 adds 29,198 bytes to the floor every startup pays
    (`react-dom-client.production.js` grows 89,152 bytes unminified), which no app-code lever in
    that upgrade could offset: the base measured 869,511 bytes and the upgrade 900,361. The owner's
    words: "I would like to do both 1. merge 2. fix startup budget. Whatever order is fine for me."
    The cap was 900,361 + 11,896 = 912,257 bytes, the same headroom over the reviewed startup, until
    the fifth cut (below) took Expo's tree shaking and granular chunking and ratcheted it back down.
* **The app's `Animated` leaves out React Native Web's list components.**
  * RNW's `Animated` export spreads its animation implementation over six animated hosts. Three of
    them (`FlatList`, `SectionList`, `ScrollView`) import `VirtualizedList` and the list machinery,
    which the app never renders.
  * Every animation reads `Animated` and `Easing` from `src/platform/animated.ts`. On native that
    re-exports React Native's. `animated.web.ts` spreads RNW's own `AnimatedImplementation` and adds
    its animated `View`, the only host the app animates.
  * The gesture and every animation run on the same driver as before, so they are unchanged.
    `tools/tests/native-web-animated.test.mjs` proves each export is RNW's own value, and that no
    app file imports `Animated` from `react-native` or animates a host the web module leaves out.
  * Reanimated stays off web, and a CSS transition would be a second implementation of the clear
    gesture. Neither was needed.
* **Feedback and AI load after the drawing screen paints on web.**
  * `src/product/productOwners.ts` creates the feedback owner, and the AI owner with its recovery,
    storage and vault.
  * `useDrawingProduct` attaches them to the product through `productOwnersLoader`:
    * Native's loader returns the factory at once, so native creates them in the same effect as
      before.
    * `productOwnersLoader.web.ts` imports them once the drawing screen has painted with the child's
      settings (`drawingPaint.ts`) and the shipping idle gate (`web/src/lib/idle.ts`) has passed. A
      first paint reaches the display a frame after its commit. A fetch started straight after the
      commit still counted toward Largest Contentful Paint.
  * Until the owners arrive, `ai.owner` and `feedback.owner` are null. The UI already handled that
    state for the render before the effect ran. A chunk that fails to load is retried when the app
    returns to the foreground.
  * Nothing AI runs at launch except a launch invite and, once the owners arrive with AI image
    creation on, the free-allowance check behind the AI Image Button's states
    (`product/useAiAvailability.ts`), which reads which credential is saved and asks
    `/api/free-generation-grant` as shipping's free grant does; no drawing leaves the device. The AI
    owner reads its stored journal and resumes a pending generation when a parent taps the AI Image
    Button and answers the grown-up check, and
    `tools/migration/tests/rsd-native-web-product-owners.test.mjs` drives it through the web loader.
  * `launchInvites.web.ts` loads the vault only when the launch URL carries an invite. If that chunk
    request fails, the capture stays pending. The owners' loader settles it before it hands out the
    AI owner, and a settle during a capture waits for its write. So the invite is saved and scrubbed
    before any credential read, even after a failed chunk request.
  * Expo's serializer moves every module that two lazy chunks share into `__common`, a chunk
    `index.html` loads before first paint. So the owners, the AI and feedback sheets, the waiting
    print and the invite's vault are one chunk, `productChunk.web.ts`. A second chunk for any of
    them put about 76 KB of AI modules back on the startup path. Since the fifth cut's granular
    chunking, a split would cost requests after first paint instead.
* **The offline library's controller and its launch inventory wait on web.**
  * `offlineLibrary/runtime.web.ts` stands `deferredLibrary.ts` in for the controller:
    * Calls that only set state (feature enabled, foreground, drawing, cancel) replay in order when
      the controller loads.
    * A call that needs the controller loads it at once: engaging the picker, opening an offline
      page, saving over offline artwork, changing the policy or removing books.
    * The launch inventory waits for the same paint-and-idle point as the owners. That inventory
      reads the saved policy and fetches the 210 KB coloring catalog.
  * Until then the snapshot is the controller's own loading snapshot. A failed chunk reports what a
    failed catalog reports, and Retry loads it afresh.
  * A picker opened before an inventory completes would hold an empty list of books. `useHeldBooks`
    holds the books from the first inventory that completes, which the snapshot's `inventoried` flag
    records. A failed inventory and Retry's interim `ready` do not set it. A book that finishes
    downloading while the picker is open still waits for the next open.
  * Native's `runtime.ts` creates the controller at import, as before.

Measured on the merged base, each step's change to the startup path:

| Step                                                   | Startup bytes | Change   |
| ------------------------------------------------------ | ------------- | -------- |
| Before (issue 2842 merged)                             | 1,219,090     |          |
| `Animated` without list components                     | 1,154,665     | −64,425  |
| Feedback, AI and launch invites in `productChunk`      | 1,016,780     | −137,885 |
| Offline library controller and inventory deferred      | 992,309       | −24,471  |
| Waiting for paint and idle (`drawingPaint`, `idle.ts`) | 994,545       | +2,236   |
| Clear button (issue 2849) merged, review fixes         | 993,619       | −926     |

That left 144,635 bytes over the target, mostly two libraries every first paint used: the startup
icon set (`icons.generated.ts`, about 78 KB) and `react-native-svg` (about 47 KB).

### The third cut: the icon set and `react-native-svg`

* **The startup icon set holds only the icons the drawing screen mounts with.**
  * `NATIVE_STARTUP_ICONS` in `tools/migration/gen-native-icons.mjs` lists More colors, the folded
    palette's ink, the Clear control and its coachmark hand, the settings gear, the drawer toggle,
    and the Fullscreen Toggle a phone browser shows. The drawer's tools, the flyouts and every sheet
    draw from the deferred module (ADR-0164), so the big themed glyphs (`shapes`, `wand-stars`) left
    the entry.
  * The Fullscreen Toggle's icons were deferred before this cut, so a phone browser's first paint
    drew an empty corner button until the chunk arrived. They are in the startup set now.
  * `deferredIconWarmup.web.ts` prewarms the deferred module once the drawing screen has painted,
    behind the shipping app's background gate (`scheduleInteractionIdle` in `web/src/lib/idle.ts`).
    At plain idle (`scheduleIdle`), Lighthouse's simulated Slow 4G counted the chunk against the
    paper texture that paints Largest Contentful Paint. The native `deferredIconWarmup.ts` resolves
    the module at launch, because it is already in the bundle.
  * `lazySurface.ts` resolves a sheet only once the deferred icons have settled, fetched alongside
    its own chunk, so a sheet never opens with an empty icon box. A failed icon load does not fail
    the sheet; each icon retries when it mounts.
  * `tools/tests/native-section-icon-mounted.test.mjs` proves both: a lazy surface's first render
    has its deferred icon, and the warm-up loads the chunk before any icon asks for it.
* **`react-native-svg` stays off the web bundle.**
  * Every app module imports its SVG elements from `src/platform/svg.ts`, which re-exports
    `react-native-svg` for the native apps. `svg.web.ts` renders the same DOM through React Native
    Web's `createElement`, rewriting the same props as `react-native-svg`'s `WebShape`. It leaves
    out the library's parsers for React Native transform lists (`transform.js`, `transformToRn.js`)
    and for XML. `SvgXml` parses with the browser's `DOMParser` and renders the same element
    classes.
  * A press handler, a transform list or a bundled asset id throws instead of being silently
    dropped. The app passes none of them.
  * The web module is `.web.ts`, not `.web.tsx`. Metro tries each source extension in turn with
    every platform suffix, so `svg.ts` would win over a `svg.web.tsx` and the library would stay.
  * `tools/tests/native-web-svg.test.mjs` renders every icon in both themes, two downloaded coloring
    outlines and a tree of every prop the paper passes through both implementations, and compares
    the DOM. It also fails if any app file imports `react-native-svg` directly, since one such
    import puts the whole library back on the path.
* **Rejected levers.**
  * Sharing one markup between an icon's light and dark variants saved about 27 KB of the old
    startup set. After the split no startup icon has a theme variant, so it saves nothing on the
    startup path.
  * A Metro resolver alias for `react-native-svg` on web would need no import changes. It was
    rejected for the same reason the `Animated` split was: a `.web.ts` split is visible in the
    importing file, and an alias would silently swap a library under every future import.

Measured one lever at a time on the same base (`origin/codex/native-migration` at 7e0553dda):

| Step                                                 | Startup bytes | Change  | Lighthouse LCP, phone / tablet |
| ---------------------------------------------------- | ------------- | ------- | ------------------------------ |
| Before (issue 2849 and the AI art settings merged)   | 997,252       |         | 3.15 s / 3.15 s                |
| Startup icon set cut to first paint, sheets wait     | 931,367       | −65,885 |                                |
| `react-native-svg` replaced by `platform/svg.web.ts` | 876,150       | −55,217 | 3.17 s / 3.22 s                |
| Warm-up behind the background idle gate              | 876,232       | +82     | 3.14 s / 3.14 s                |
| Fullscreen Toggle icons in the startup set           | 877,863       | +1,631  | 2.69 s / 2.69 s                |
| Review: the native apps resolve the icons at launch  | 877,862       | −1      |                                |
| The AI flow (PR 2869) merged                         | 894,104       | +16,242 | 2.70 s / 2.68 s                |

The LCP column is Lighthouse's simulated first visit on a local brotli server, the median of two or
three runs. The entry fell from 223.0 KB to 199.1 KB over the wire, but LCP moved only with the last
two steps. Until then a deferred icon chunk was still fetched while the paper texture loaded: first
the prewarm, then the Fullscreen Toggle's own icons, which Lighthouse's mobile emulation shows.

Screenshots of the export before and after, at 390×844 and 1366×1024 in light and dark, are
pixel-identical at first paint, with the drawer open, with the brush flyout open, in Settings, and
after a pen and a crayon stroke. On the merged base, with splotch.art's `/api` mocked, so are the AI
button in the drawer, the style prompt and the result; each frame of the animated waiting dial
matches a baseline frame. The AI flow added the same 16,242 bytes it adds to the old path, 6,828 of
them in Expo's `__common` chunk. Its merged base without this cut measures 1,013,494 bytes, a 225.2
KB entry over the wire and 3.15 s LCP on phone and tablet; with the cut, 894,104 bytes, 201.0 KB and
2.7 s. The remaining 45,120 bytes over the target have no single large owner. The largest app
modules left on the path are the startup icons (14 KB), the sound settings with their codec (16 KB)
and the contact responder (8 KB).

### The fourth cut: release notes, Expo's native-module runtime, compiled-away RSD imports

The startup reached 905,037 bytes against the 906,000 cap. A source-map attribution of the three
startup scripts found four pieces no first paint uses and no second lazy chunk shares:

* **The release notes load with Settings.** The settings store read the What's New stamp from
  `settings/whatsNew.ts`, which also held every release's notes. The stamp lives in
  `whatsNewStamp.ts`; only Settings imports the notes. `check-native-web-precache.mjs` samples the
  notes among the modules no shell script may hold.
* **expo-asset leaves the web bundle.** Each web module read a bundled file's URL through
  `Asset.fromModule(...).uri`. Expo's web asset transform exports an image as
  `{ uri, width, height }` and any other file as its URL, so `webAssetUri` (`platform/webAsset.ts`)
  reads both. `gen-bundled-farm.mjs` writes the Farm image modules that way.
* **The web export launches without Expo's native-module runtime.** The `expo` index re-exports
  `expo-modules-core` beside `registerRootComponent`; no web module uses it.
  `platform/registerRoot.web.ts` imports `expo/src/launch/registerRootComponent`, the module the
  index re-exports and the path Expo's own `AppEntry.js` uses. Its web variant runs Expo's web
  setup, including the async-require the lazy chunks load through. Native keeps the index. Because
  TypeScript checks that module's source, `platform/expoWebLauncher.d.ts` declares the one window
  global it reads.
* **React Strict DOM imports the web preset compiled away are dropped.** The preset rewrites every
  `html.*` element and `css.*` call to DOM props, then leaves the import, which Metro keeps as a
  require of RSD's runtime element library. A web-only Babel step in `babel.config.cjs` drops each
  RSD binding nothing reads after the preset. The two Settings modules that read `html.*` as a value
  keep theirs, so the library loads with Settings.

`tools/tests/native-web-expo-runtime.test.mjs` fails if a module the web export bundles imports the
`expo` index or `expo-asset`. It also fails if Expo moves the launcher, or if the asset transform
stops exporting either shape. `tools/tests/native-web-strict-dom-imports.test.mjs` runs the
project's Babel config and fails if a compiled-away RSD import survives on web, or if one is dropped
where a module still reads it or on native.

Measured one lever at a time on `origin/codex/native-migration` at 64a9ca53a, then on the merged
base at a01948dab:

| Step                                    | Startup bytes     | Change  |
| --------------------------------------- | ----------------- | ------- |
| Before                                  | 905,037           |         |
| Release notes with Settings             | 898,043           | −6,994  |
| `expo-asset` off the web bundle         | 889,208           | −8,835  |
| Expo's web launcher                     | 867,157           | −22,051 |
| Compiled-away RSD imports dropped       | 859,163           | −7,994  |
| Merged base (a01948dab), before / after | 904,776 / 858,902 | −45,874 |

The release-notes row is attributed from source maps; the others are builds. The service worker
precaches every chunk, so the RSD library's move into the Settings chunk adds no offline download.
Screenshots at 390×844, light and dark, are pixel-identical before and after at first paint, in
Settings' What's New, the color picker, the Brushes flyout, the Coloring Book Picker, a Farm page, a
Magic Brush fill and the Flat button style. First contentful paint under 4× CPU throttling is
unchanged (280 ms local median of seven runs each).

### The fifth cut: granular chunking and tree shaking

Expo SDK 58 brought React 19.3, whose `react-dom` put the startup at 900,361 bytes, 29,563 over the
870,798 cap. The fourth cut had measured two Expo levers and not taken them. Both now are, scoped to
the web export:

* **Granular chunking.** `app.json` sets `experiments.chunking.mode` to `granular`, new in SDK 58.
  * Expo's legacy strategy moves every module that two lazy chunks share into `__common`, which
    `index.html` loads before first paint (46,898 bytes at SDK 58).
  * The granular strategy groups each shared module by the lazy entries that need it into a
    `__shared-*` chunk. Expo's async-require fetches those chunks alongside the entry that needs
    them. `index.html` now loads only the runtime, the entry and the stylesheet; the export carries
    21 shared chunks, and the service worker precaches them all.
  * Expo applies it only to a production web client export: `isGranularEligible` in
    `@expo/metro-config`'s `withExpoSerializers.js` requires `platform === 'web'`.
* **Tree shaking.** `build-native-web.mjs` sets `EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH` and
  `EXPO_UNSTABLE_TREE_SHAKING` (`NATIVE_WEB_EXPORT_ENV`) on its `expo export --platform web`
  process. Expo reads both from the environment, and nothing Gradle or Xcode runs sets them, so the
  native bundles are built without them. Both flags are still marked unstable.
* `tools/tests/native-web-export-scope.test.mjs` fails if a flag leaves `NATIVE_WEB_EXPORT_ENV`, if
  a native bundle input sets one, if `app.json` drops granular chunking, or if Expo's granular
  eligibility stops requiring a web export.

Measured on `claude/rn-expo-sdk58` at a88c0144b:

| Step                     | Startup bytes | Change  |
| ------------------------ | ------------- | ------- |
| Before (Expo SDK 58)     | 900,361       |         |
| Granular chunking        | 863,431       | −36,930 |
| Tree shaking alone       | 872,536       | −27,825 |
| Tree shaking on granular | 838,334       | −25,097 |

Tree shaking alone is measured against the base, tree shaking on granular against granular chunking.

After PR 3000 merged, the merged branch measured 838,334 bytes again. Each export was driven in
Chromium at 390×844, with splotch.art's `/api` mocked. The flows covered:

* drawing a stroke, Undo, and Clear;
* opening and closing Settings;
* picking the Farm book's Cat page;
* turning on AI images and opening the style prompt from the drawer;
* reloading offline from the service worker and opening Settings offline;
* a lazy chunk that fails to load, then Try again.

The flows passed under each lever and under both. Thirteen screenshots of each export are
pixel-identical to the baseline's. With granular chunking, Try again also fetches the shared chunks
a surface needs: Expo's async-require forgets a failed URL and skips one that already completed.

The native apps' JavaScript is byte-identical with and without granular chunking
(`expo export --platform ios --platform android --no-bytecode`). Two runs of the same config can
still differ, but only in Metro's module ids, because both platforms bundle concurrently from one id
factory.

Levers measured and not taken:

* **React Native Web's `Animated`**, about 62 KB, drives the startup chrome's press motion and the
  clear gesture as well as the dialogs, so it cannot leave without a second animation driver.
* **The surface failure dialog** (`RsdSurfaceBoundary`) keeps `ModalShell`, `DialogHeader`, React
  Native Web's `Modal` and `ScrollView` on the path, about 36 KB, by design: it is the answer to a
  chunk that failed to load, so it cannot itself wait on a chunk.
* **React Native Web's development-only style validator** (`StyleSheet/validate.js` with
  `postcss-value-parser`, about 6 KB) is imported unconditionally. Only a resolver alias would drop
  it, which this ADR rejects for library internals.

## Consequences

* \+ First paint on a throttled phone dropped from 13.2 s LCP and 2,346 KB transferred to about
  2.7–2.9 s and 351 KB (Lighthouse, simulated Slow 4G and 4× CPU, local brotli server). The shipping
  app on the same server measured 0.9–1.3 s.
* \+ Issue 2844's levers moved the throttled first load from 2.9 s LCP to 2.7 s on phone and tablet.
  The entry fell from 269 KB to 220 KB over the wire. The shipping app measured 1.1–1.2 s in
  production. Its first paint is server-rendered HTML; the RN export paints only after its entry
  downloads and evaluates.
* \+ The offline precache shrank from 6.18 MB to 4.89 MB, because WebP files no longer pay base64
  overhead. No precached file now needs more than Workbox's 2 MiB per-file default, so
  `build-native-web.mjs` dropped its 8 MiB allowance.
* \+ Native bundles keep their content. The Android release bundle still carries all 38 data URIs,
  all line art and `react-native-svg`. The native apps now resolve the deferred icons at launch
  rather than on first use, so the drawer's tools, which moved out of the startup set, have their
  icons before a child can open the drawer.
* − Each lazy surface has two platform files whose exports must agree. TypeScript checks consumers
  against the native file only. The parity test covers the sheets; the outline hook's two
  implementations share a signature by convention.
* − On web, a sheet's first open waits for its chunk. After install the chunk comes from the service
  worker cache, but a Farm page's outline and Magic fill can paint a frame after the paper does.
* \+ The third cut moved the throttled first load from 3.15 s LCP to 2.69 s on phone and tablet, and
  the entry from 223.0 KB to 199.1 KB over the wire. A phone browser's first paint now draws the
  Fullscreen Toggle instead of an empty button.
* − The startup cap sits about 1.7× above the shipping budget and is set from measurement, not from
  the shipping number. The last 45,120 bytes over the target need another lever, or a static first
  paint.
* − On web, the drawer's tools draw from the deferred module. Opening the drawer before the
  background prewarm has run (in the first moments, or while a child keeps drawing) shows its tool
  buttons empty until the chunk arrives. Before this cut only the stroke-width tool did that.
* − On web, a sheet's first open also waits for the deferred icon chunk when the prewarm has not
  run.
* − `svg.web.ts` mirrors `react-native-svg`'s web prop rewrite. A `react-native-svg` upgrade that
  changes that rewrite does not reach the web export until the DOM parity test fails.
* − On web, the AI picture button and Send Feedback do nothing until the owners' chunk arrives,
  shortly after first paint. After install the chunk comes from the service worker cache.
* − The AI surfaces and the feedback sheet now download with their owners after every web launch,
  rather than on first open.
* − Web capture now does a network or cache fetch per file-served fill. A failed fetch fails the
  capture closed (an empty result), as a decode error already did.
* \+ The fourth cut took 45,874 bytes off the startup path with first paint unchanged, leaving it
  9,918 bytes over the target.
* − The web export imports Expo's launcher by its source path, and TypeScript checks that source. An
  Expo upgrade that moves it fails `native-web-expo-runtime.test.mjs`; one that changes its globals
  can fail the native type check.
* − The RSD element library now loads with the Settings chunk. A second lazy chunk that reads
  `html.*` as a value would move it into a shared chunk both wait on.
* \+ The fifth cut took 62,027 bytes off the startup path, leaving it 10,650 bytes under the target.
* − Both fifth-cut levers are Expo experiments. An Expo upgrade that drops or changes either shows
  as a startup over the cap, or fails `native-web-export-scope.test.mjs`. No committed E2E tier
  drives the RN web export, so the flows they were proven under ran from a review script.
* − On web, a lazy surface's first open can fetch its shared chunks as well as its own, more
  requests than the one `__common` load they replace. After install they come from the service
  worker cache.
