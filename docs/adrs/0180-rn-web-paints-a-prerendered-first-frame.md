# ADR-0180: The React Native Web Export Paints a Prerendered First Frame, Then Hydrates It

**Status:** Proposed — amends [ADR-0179](0179-rn-web-startup-path-splits-by-platform.md) **Date:**
2026-10

## Context

ADR-0179 cut the React Native web export's startup path from 5.17 MB to 838,334 bytes and its
throttled Largest Contentful Paint (LCP) from 13.2 s to about 2.7 s. It named the remaining lever:
the export's document is empty until the bundle mounts, while the shipping app paints prerendered
HTML. The owner's priority is to get the first LCP down and accept a later time to interactive.

The baseline is `origin/codex/native-migration` at 00fcc5c78 (Expo SDK 58, React 19.3, after
ADR-0179's fifth cut). It was measured with Lighthouse 13.5.0 on the `tools/page-load` phone and
tablet profiles, through a local brotli server that revalidates with 304s, taking the median of
three runs. The investigation itself ran on 0cc444886 (SDK 57); the alternatives below come from
there. The evidence and harness are in
[`docs/scratchpad/2026-10-19-rn-web-static-first-paint/`](../scratchpad/2026-10-19-rn-web-static-first-paint/README.md).

| Phone, first visit, Slow 4G and 4× CPU       | FCP      | LCP      |
| -------------------------------------------- | -------- | -------- |
| Lighthouse devtools throttling, RN baseline  | 3,034 ms | 3,651 ms |
| Lighthouse devtools throttling, shipping app | 830 ms   | 830 ms   |
| Lighthouse simulated throttling, RN baseline | 1,051 ms | 2,785 ms |

The devtools rows ran on a quiet host, under the RN performance campaign's rig lock. The campaign
found Lighthouse's simulated mode scatters the shipping app between 1.1 and 3.9 s, so the devtools
rows are the comparison to trust. The simulated rows are what the `tools/page-load` gate reports.
Under applied throttling (a CDP probe), the RN baseline's controls take taps at 2,987 ms. Its
simulated repeat visit is 750 ms, and the tablet matches the phone. The LCP element is the paper
texture (`PaperTexture.web.tsx`): a `div` whose CSS background is the handmade-paper WebP, not the
flat paper colour the boot script paints.

### Why the first frame could not simply be server-rendered

A server render of today's tree paints only the flat paper. The drawing screen's first commit is
deliberately empty, and it depends on inputs a build cannot know:

* **Saved settings.** `useFirstPaintHeld` renders `RsdDrawingFirstPaint` until the settings and
  brush preferences load, so a child never sees defaults before their saved choices.
* **Safe-area insets.** `react-native-safe-area-context`'s provider renders nothing until the
  browser reports insets, an effect after mount. On web, `initialWindowMetrics` is null.
* **Window size.** The palette, the Actions Panel and the paper geometry are JavaScript functions of
  the window (`edgeLayout.ts`, `NativeDrawingLayout`), not CSS. React Native Web's
  `useWindowDimensions` reads the live window in its first render.
* **Theme.** The saved Light or Dark choice, or the system theme. The boot script stamps only a
  saved choice.
* **Browser globals read at import or during render.** The install prompt's owner, the shipping
  font's `FontFace`s, `defaultOrientation`, `bootAppearance` and the orientation-lock probe.
  Thirteen `useSyncExternalStore` calls had no server snapshot.

React 19 decides what a mismatch costs. A text or structure mismatch regenerates the root on the
client. An attribute mismatch only logs a development warning: React notes it "won't be patched up",
and production stays silent (`ReactFiberHydrationContext.js`). Expo issue 40073 shows that failure
in an Expo static export: a `useWindowDimensions` breakpoint kept its server value after hydration.
So the hydrating render must equal the markup; only a later render may move it.

### Prior art

* **React Native Web server rendering**
  (https://necolas.github.io/react-native-web/docs/rendering/). **Adopted** as the mechanism.
  * `AppRegistry.getApplication(appKey)` returns `{ element, getStyleElement }`. The element renders
    through `react-dom/server` and the style element is inlined.
  * The client runs the app with `hydrate: true`. React Native Web's sheet adopts
    `<style id="react-native-stylesheet">` instead of inserting its rules again
    (`StyleSheet/dom/createCSSStyleSheet.js`).
  * `Dimensions.set` takes a server-side estimate of the window.
  * Twitter is often cited as the reference user, but no primary source shows Twitter Lite
    server-rendering with React Native Web. A Twitter engineer said in 2017 that its backend "does
    no react rendering". It is cited here only as a React Native Web user.
* **Expo Router static rendering** (`web.output: "static"`,
  https://docs.expo.dev/router/web/static-rendering/).
  * How it works: `expo export` bundles a render module with Metro for `environment: node`,
    evaluates it, renders each route, and injects `globalThis.__EXPO_ROUTER_HYDRATE__=true`. Expo's
    web `registerRootComponent` reads that flag and calls `hydrateRoot`. This app already launches
    through that function (`platform/registerRoot.web.ts`).
  * **Adopted in parts:** the Node bundle, the flag, and Expo's own `AppRegistry`, which renders the
    bare root with no React Native Web `AppContainer`, so the client tree matches.
  * **The router itself is rejected on cost.** An empty Expo Router 57.0.28 app exports 1,089,327
    startup bytes (1,105,622 static); the same empty app on `registerRootComponent` exports 325,042.
    The roughly 764 KB difference is close to the whole cap, before any app code.
  * Evan Bacon's guidance for Expo Router: "hydration issues tend to happen when you use JS to
    dynamically configure styles".
* **Next.js with React Native Web, Solito, Tamagui.** The `with-react-native-web` example's
  `_document` uses the same `getApplication` and `getStyleElement` pair. For window-size mismatches,
  each uses one of three answers:
  * CSS media queries (Tamagui);
  * a mobile-first server default corrected after mount (Tamagui's `mediaQueryDefaultActive`;
    `useDidFinishSSR`, which is `useSyncExternalStore(noop, () => true, () => false)`);
  * no server render for that subtree (Dripsy's `ssr` gate, which Solito's author adopted after
    calling Dripsy's SSR support "built on top of many hacks").

  **Adopted:** the second, through `useSyncExternalStore` server snapshots, with one variant per
  size class so the correction is small.
* **Shipping's own prerender** (ADR-0040, ADR-0176). `/` is static HTML rendered from defaults.
  Orientation comes from CSS media queries, and a pre-paint head script stamps `<html>` with each
  saved setting that differs from its default, which CSS reads. This is the model for the saved-
  settings follow-up. Porting the React Native layout to CSS was not attempted: the same geometry
  lays out the native apps through Yoga.
* **Islands and resumability** (Astro `client:*` islands, React Server Components, Qwik). Not
  adopted. None has a React Native Web integration, Expo's server components exclude static output,
  and a single-screen drawing app is one island.
* **The PWA app shell** (https://developer.chrome.com/blog/app-shell). The export already precaches
  its shell. A hand-authored shell was measured as the alternative (below).

### Alternatives measured

All rows were measured on 0cc444886 (SDK 57): first visits, simulated Slow 4G and 4× CPU, phone,
median of three. Speed Index is abbreviated SI.

| Alternative                                                                     | FCP      | LCP      | SI       |
| ------------------------------------------------------------------------------- | -------- | -------- | -------- |
| Baseline (empty root)                                                           | 1,051 ms | 2,820 ms | 1,161 ms |
| Prerendered frame, hydrated, bundle deferred by the parser                      | 751 ms   | 2,338 ms | 751 ms   |
| **Prerendered frame, hydrated, bundle after first contentful paint (this ADR)** | 751 ms   | 1,201 ms | 901 ms   |
| Hand-authored full-viewport textured-paper layer, bundle after paint            | 752 ms   | 2,818 ms | 1,147 ms |
| Hand-authored paper layer placed like the app's paper, bundle after paint       | 752 ms   | 1,202 ms | 1,138 ms |

The table separates the two levers:

* **Holding the bundle until after the paint.** Lantern's simulated LCP counts every request started
  before the observed LCP. A parser-deferred bundle starts before the frame paints, so it counts.
* **Painting a real-sized frame from HTML.** A full-viewport layer is not taken as the LCP
  candidate: it painted at FCP, yet LCP stayed on the app's own paper at hydration. A hand-authored
  shell must therefore reproduce the paper's geometry per size class to move LCP. It then matches
  the prerender's LCP but not its Speed Index, because the palette and controls still arrive with
  the bundle.

## Decision

The web build prerenders the drawing screen's first frame into `index.html` and the client hydrates
it. The bundle loads after that frame has painted. A visitor with saved choices gets today's render.

### Build

`tools/migration/prerender-native-web.mjs` runs inside `native:web:build`, after `expo export`. It
runs after the template-free 404 shell has been copied and before the service worker pins the
document.

* **The Node bundle.** The tool asks Expo's out-of-band bundler for a request,
  `createMetroServerAndBundleRequestAsync` from `export:embed` (the request expo-updates uses). It
  sets `environment: node` on that request, as Expo Router's `ssrLoadModule` does, and builds
  `src/prerenderFirstFrame.tsx`. Babel folds `typeof window` to `'undefined'` there, so every
  `typeof window` guard takes its server branch.
* **The render.** It evaluates the bundle and renders `ProbeApp` through Expo's `AppRegistry` with
  `react-dom/server`.
  * It renders six viewports: phone, tablet and 13-inch tablet, each in portrait and landscape. The
    phone and tablet entries are the Lighthouse profiles.
  * It renders each viewport in Light and Dark: twelve variants in all.
  * `Dimensions.set` supplies the window.
  * The build lends happy-dom's `DOMParser`, and nothing else, so `SvgXml` can parse icons. The
    render has no `window`.
* **The document.** Each variant becomes an inert `<template>`. Twelve are 210,748 bytes raw and
  7,265 brotli, against 910 for an empty shell; with the inlined style sheet the shell is 14,599
  bytes brotli. The document also gets:
  * React Native Web's sheet as `<style id="react-native-stylesheet">`, cut to the rules the markup
    uses plus the sheet's group markers: 2,716 bytes, about a fifth of the full server sheet.
  * The paper texture, preloaded at `fetchpriority="high"`.
  * The bundle's `<script defer>` tags, moved into a JSON list.
* **The style sheet is inlined.** Expo links its extracted `strict.css` render-blocking, which cost
  the first paint one more round trip. The prerender inlines it where the link was, as the shipping
  drawing route inlines its CSS (ADR-0176). The startup bytes are unchanged, and the precache still
  holds the file for the 404 shell.
* **Expo's `getStyleElement` is not used.** It looks `getSheet` up on React Native Web's module
  object instead of its default export and returns an empty `<style>`.
  `platform/reactNativeWebSheet.ts` reads `StyleSheet.getSheet()` directly.

### Boot script

The boot script runs as the parser passes the root.

1. It acts on a drawing path, when the visitor has no settings, brush or drawer record. None exists
   until a visitor changes something; a first visit writes only a session counter and a network
   flag.
2. It picks the variant for the window's size class and orientation, and resolves the theme from the
   saved stamp, or failing that the system scheme.
3. It clones that variant into `#root`, names its viewport in `data-first-frame-viewport`, and sets
   Expo's hydration flag. The flag string comes from `@expo/router-server`'s
   `getHydrationFlagScriptContents`.
4. It loads the bundle, in order, when a `PerformanceObserver` reports `first-contentful-paint`. A 2
   s fallback covers browsers without Paint Timing.
   * An earlier version loaded it a frame and a task after the clone. That still started the bundle
     about 26 ms before the paint was presented.
   * When nothing was cloned, or the page is hidden, the bundle loads at once.

`check-native-web-startup.mjs` and `check-native-web-precache.mjs` read the JSON list, so the held
bundle still counts.

### Client

`platform/firstFrame.web.ts` exports `FIRST_FRAME_PRERENDERED` (always `false` in the native
`firstFrame.ts`). The hydrating render reads the frame's own inputs:

* **Window.** Every app module reads the window through `platform/windowDimensions(.web).ts`. Its
  server snapshot is the variant's viewport (`firstFrameWindow.ts` reads it off the root) and its
  live snapshot is React Native Web's `Dimensions`. React renders the variant's viewport while
  hydrating and relayouts once after. `tools/tests/native-web-first-frame.test.mjs` fails if a
  module imports `useWindowDimensions` from `react-native`.
* **Safe area.** `platform/safeAreaMetrics.web.ts` gives `NativeFrame` zero insets and the variant's
  frame while hydrating, and `null` on every later mount, which measures as before.
* **Settings.** The drawing screen does not hold for its settings when a frame was prerendered. It
  paints the defaults with the boot theme and takes the saved values when they load, a tick after
  hydration.
* **Brushes.** While the brush preferences load, the chrome is not drawn disabled. `busy` still
  refuses commands.

### Hydration inventory

Each input a server render or hydration reads differently. **(throws)** means the module threw in
Node before its fix.

| Input                                | Where                                                                      | Server     | Hydration                  | Handling                                                   |
| ------------------------------------ | -------------------------------------------------------------------------- | ---------- | -------------------------- | ---------------------------------------------------------- |
| Install prompt owner at import       | `installPrompt.web.ts`                                                     | (throws)   | owner                      | `typeof window` guard; constant install server snapshot    |
| Shipping font faces at import        | `shippingFont.web.tsx`                                                     | (throws)   | faces                      | built on first mount, memoized                             |
| Current page                         | `ProbeApp`, `BrowserBack.web.tsx`                                          | (throws)   | `drawing`                  | `prerenderedAppPage`; boot hydrates only the drawing paths |
| In-memory stores                     | `lazyExport`, `lazySurface`, `bareGlass`, ink, halos, capture, library, AI | (throws)   | store value                | server snapshot is the same read                           |
| Default orientation                  | `orientationDefault.web.ts`                                                | (throws)   | from `innerWidth`          | `portrait` on the server; feeds Settings only              |
| Boot appearance                      | `bootAppearance.web.ts`                                                    | (throws)   | stamp                      | the variant's theme (`prerenderInputs.ts`)                 |
| System theme                         | `DrawingAppearanceProvider`                                                | light      | system                     | a Light and a Dark variant; boot resolves as the client    |
| Orientation lock applies             | `deviceOrientation.web.ts`                                                 | (throws)   | probe                      | `false`, read in the effect that already ran               |
| Held first paint                     | `useFirstPaintHeld`                                                        | flat paper | flat paper                 | not held when prerendered                                  |
| Safe-area insets                     | `NativeFrame` provider                                                     | nothing    | nothing                    | zero insets while hydrating, measured next                 |
| Window size                          | 37 modules                                                                 | 0×0        | live window                | the variant viewport while hydrating; one relayout         |
| Brushes loading                      | `useDrawingScreen`                                                         | dimmed     | dimmed                     | not dimmed when prerendered                                |
| `SvgXml` parse                       | `platform/svg.web.ts`                                                      | no parser  | `DOMParser`                | the build lends happy-dom's parser                         |
| Paper plane box, ink `viewBox`       | `NativeDrawingLayout`                                                      | window     | window, then measured area | invisible; corrected on measurement                        |
| Palette gap off a variant's viewport | `edgeLayout.ts`                                                            | variant    | variant, then live         | one relayout (390×844: 12.4 → 8 px, 3.6% of pixels)        |
| Saved settings that change the frame | toolbar style, button size, drawer, colours                                | defaults   | —                          | no frame for a visitor with a record; today's render       |

Verification, on the SDK 57 build, the SDK 58 build and the SDK 58 build with the inlined style
sheet (the evidence package's `results/`, `results/sdk58/` and `results/quiet-host/`):

* **Pixels.** The static frame (bundle blocked) and the hydrated, settled screen differ in 0 pixels
  at every variant viewport, light and dark.
* **DOM.** The settled DOM after hydration equals a fresh client render of the same bundle element
  for element, with styles normalised through the CSSOM. That holds at six viewports, on and off the
  variants, and for a visitor with a saved record. This is the check that would catch an attribute
  React kept silently.

### Startup cap

On the SDK 58 base the build passes: 845,064 bytes against the 850,230 cap, from a baseline of
838,334. The prerender spends 6,730 of the cap's 11,896 bytes of headroom:

| Addition                                                     | Bytes  |
| ------------------------------------------------------------ | ------ |
| Entry-chunk code (server snapshots, the window seam, guards) | +2,365 |
| Boot script                                                  | +1,649 |
| Inlined critical CSS                                         | +2,716 |

ADR-0179 treats consumed headroom as the cue to take the next lever. Two are measured here:

* Babel's `minifyTypeofWindow` on web takes back 1,824 bytes. It is a stable `babel-preset-expo`
  option, which Expo disables on web only for Web Workers.
* With the bundle held until after first paint, those bytes gate interactivity, not paint. A
  first-paint cap (the shell, its inline code and its render-blocking CSS) and a separate
  interactive cap would say so.

## Consequences

* \+ On a phone's first visit under Lighthouse devtools throttling, LCP fell from 3,651 to 1,229 ms,
  against shipping's 830.
  * FCP fell from 3,034 to 680 ms, ahead of shipping's 830.
  * Under a CDP probe the repeat visit's LCP fell from 688 to 600 ms; shipping's is 636.
  * Lighthouse's simulated LCP fell from 2,785 to 1,351 ms on phone and tablet; CLS stayed 0.
  * The remaining first-visit gap is the paper texture's own request. Inlined as a data URI, it
    brings LCP to FCP, 725 ms (an experiment, follow-up 6).
* \+ The first paint shows the whole drawing screen in the visitor's size class and theme: palette,
  Clear Button, drawer toggle, Settings Button and textured paper. It is pixel-identical to the
  hydrated screen on the variants' viewports.
* − **A visible screen that does not respond.** Under the CDP probe the phone's frame paints at 672
  ms and its controls take taps at 2,466 ms.
  * For about 1.8 s a toddler who taps a swatch or draws gets no response. Today's 2,987 ms of
    waiting shows flat paper instead.
  * The controls answer 521 ms sooner than today. The bundle starts once the earlier paint lands,
    and hydration attaches handlers to swatches that are already there, without waiting for the
    settings to load.
  * Nothing replays those taps: React's event replay starts only once hydration has begun, and no
    listeners exist before the bundle loads.
  * Holding the bundle until after the paint cost 33–47 ms of interactivity against requesting it
    with the document (measured on SDK 57, style sheet linked).
* − Two renderers' discipline. Every first-frame read of the browser needs a server value and a
  matching hydration value.
  * A new `useSyncExternalStore` without a server snapshot, or a browser read at import or during
    render, throws in the build's render. That surfaces only in `native:web:build`.
  * A new input that renders differently but quietly, such as a JS-computed colour from a media
    query, would be kept stale by React in production. The evidence package's DOM comparison catches
    one, but it is not in CI.
* − A returning visitor with any saved choice gets no prerendered frame and paints as before.
* − Lighthouse's simulated repeat visit got 150 ms worse (750 to 900 ms), though the probed repeat
  visit paints sooner.
  * Holding the bundle lets the `load` event fire before the paint is presented.
  * Lantern then counts the favicon and manifest-icon revalidations that `load` triggers.
  * The page-load gate's repeat-visit cells would show the simulated number.
* − The window seam reroutes 37 modules' `useWindowDimensions` import.
* − The build adds a Metro build and depends on Expo internals: a deep import of
  `@expo/cli/build/src/export/embed/exportEmbedAsync.js` and `@expo/router-server`'s flag helper. An
  Expo upgrade that moves either fails the build. Both survived the SDK 57 to 58 upgrade unchanged.
* − The build depends on happy-dom, a development dependency, for `DOMParser`. Shipping the web
  export from Netlify would need it moved (ADR-0070).
* − 6,730 bytes more on the startup path, more than half the cap's headroom.

### Follow-ups

1. **Deviation stamps for saved settings.** Extend the boot script to stamp the settings that change
   the first frame, as ADR-0040 does. Then clone a matching variant instead of none.
2. **The hydrated-vs-fresh DOM comparison in CI.** Also a development-build pass that fails on
   React's hydration warnings.
3. **Win back the headroom or split the cap** (Startup cap, above).
4. **Port first-frame geometry to CSS where it is cheap**, such as the palette gap, to shrink the
   post-hydration relayout.
5. **Acknowledge early taps.** Design what a tap does before hydration, for example a CSS `:active`
   state on the swatches, so the dead window is not silent.
6. **Inline the paper texture.** Inlined into the shell as a data URI (14.6 to 22.5 KB brotli), it
   took devtools-throttled LCP from 1,229 to 725 ms. ADR-0179 keeps base64 images off the startup
   path, so this needs its own decision. One CSS rule carrying the image, not a copy per variant,
   would keep the shell small.
