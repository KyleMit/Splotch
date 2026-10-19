# ADR-0180: The React Native Web Export Paints a Prerendered First Frame, Then Hydrates It

**Status:** Proposed — amends [ADR-0179](0179-rn-web-startup-path-splits-by-platform.md) **Date:**
2026-10. On 2026-10-19 the owner decided three parts: the inlined paper texture, the pre-engine
burst with finger adoption, and the pre-hydration press feedback. The startup cap, the interactivity
tiers and the prerender mechanism are still proposals, with numbers below.

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
| Lighthouse devtools throttling, RN baseline  | 3,037 ms | 3,652 ms |
| Lighthouse devtools throttling, shipping app | 824 ms   | 824 ms   |
| Lighthouse simulated throttling, RN baseline | 1,051 ms | 2,785 ms |

The devtools rows ran on a quiet host, under the RN performance campaign's rig lock. The campaign
found Lighthouse's simulated mode scatters the shipping app between 1.1 and 3.9 s, so the devtools
rows are the comparison to trust. The simulated rows are what the `tools/page-load` gate reports.
Under applied throttling (a CDP probe), the RN baseline's controls take taps at 2,961 ms. Its
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
  * The paper texture, once, as `:root{--paper-texture:url("data:image/webp;base64,…")}` in the
    shell's own `<style>`. `PaperTexture.web.tsx` paints `var(--paper-texture, url(<file>))`, so the
    template-free 404 shell still loads the file. This is the owner's decision. Requested on its
    own, the texture held LCP a round trip behind first paint: 1,229 ms against 682 ms FCP.
    `check-native-web-startup.mjs` now scans inline CSS for inlined images too. Its
    `INLINED_IMAGE_EXCEPTIONS` names this one asset with its reason. A second copy fails, and so
    does the texture in a script or any other inlined image. ADR-0179 records the exception.
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

### Before the engine and the controls listen

These are the owner's decisions. Everything is painted from the first frame, and nothing moves when
a part goes live. Until a part is live, the shell itself answers a touch on it, before any app
script has run. There is no early ink and no second drawing engine.

* **The paper.**
  * A touch there throws a small burst of six palette-coloured dots from the boot script, outside
    `#root`: 520 ms, still dots that only fade under Reduce Motion.
  * The boot script records each finger that is down on the paper, and where it is, under
    `window.__splotchEarlyPointers` (`EARLY_POINTERS_GLOBAL`). It never draws or buffers a stroke.
  * `PaperInputView.web.tsx` attaches its listeners at hydration, then checks once a frame whether
    the engine would admit a stroke (`contactResponder.isReady()`, passed as `engineReady`). The
    paper must be measured and its ink ready, about 120 ms after hydration.
  * When it would, the input view starts each recorded finger's stroke where the finger is now,
    through its own start path (`setPointerCapture`, then the same `start` packet a fresh pointer
    sends). It then stamps `data-drawing-live`, which stops the bursts.
  * A finger that lands between hydration and readiness is left to the shell in the same way.
  * `takeEarlyPointers` validates the record and fails loudly on one it cannot read. The engine goes
    live regardless.
* **The controls.** Until `data-controls-live`, a press on a control does two things:
  * it squishes, through CSS `:active` (`scale`, which composes with the Clear Button's inline
    transform) and through the boot script's "not yet" animation, because a touch press does not
    always match `:active`;
  * it wiggles "not yet", a 320 ms translate. Under Reduce Motion the control only dims.

  The boot script stops the press at the window in the capture phase, so the app never sees it, and
  React has nothing to replay. The drawing content stamps `data-controls-live` in the commit that
  attaches its handlers (`platform/firstFrameControls.web.ts`).
* `platform/firstFrameContract.ts` declares the property, the attributes, the global and the paper's
  test id once, and the build imports them. `tools/tests/native-web-early-input.test.mjs` runs the
  boot script against a shell. `native-web-paper-adoption.test.mjs` mounts the real input view and
  holds the adoption: nothing before readiness, then a `start` at the finger's current position.

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

| Input                                   | Where                                                                      | Server     | Hydration                  | Handling                                                             |
| --------------------------------------- | -------------------------------------------------------------------------- | ---------- | -------------------------- | -------------------------------------------------------------------- |
| Install prompt owner at import          | `installPrompt.web.ts`                                                     | (throws)   | owner                      | `typeof window` guard; constant install server snapshot              |
| Shipping font faces at import           | `shippingFont.web.tsx`                                                     | (throws)   | faces                      | built on first mount, memoized                                       |
| Current page                            | `ProbeApp`, `BrowserBack.web.tsx`                                          | (throws)   | `drawing`                  | `prerenderedAppPage`; boot hydrates only the drawing paths           |
| In-memory stores                        | `lazyExport`, `lazySurface`, `bareGlass`, ink, halos, capture, library, AI | (throws)   | store value                | server snapshot is the same read                                     |
| Default orientation                     | `orientationDefault.web.ts`                                                | (throws)   | from `innerWidth`          | `portrait` on the server; feeds Settings only                        |
| Boot appearance                         | `bootAppearance.web.ts`                                                    | (throws)   | stamp                      | the variant's theme (`prerenderInputs.ts`)                           |
| System theme                            | `DrawingAppearanceProvider`                                                | light      | system                     | a Light and a Dark variant; boot resolves as the client              |
| Orientation lock applies                | `deviceOrientation.web.ts`                                                 | (throws)   | probe                      | `false`, read in the effect that already ran                         |
| Held first paint                        | `useFirstPaintHeld`                                                        | flat paper | flat paper                 | not held when prerendered                                            |
| Safe-area insets                        | `NativeFrame` provider                                                     | nothing    | nothing                    | zero insets while hydrating, measured next                           |
| Window size                             | 37 modules                                                                 | 0×0        | live window                | the variant viewport while hydrating; one relayout                   |
| Brushes loading                         | `useDrawingScreen`                                                         | dimmed     | dimmed                     | not dimmed when prerendered                                          |
| `SvgXml` parse                          | `platform/svg.web.ts`                                                      | no parser  | `DOMParser`                | the build lends happy-dom's parser                                   |
| Paper plane box, ink `viewBox`          | `NativeDrawingLayout`                                                      | window     | window, then measured area | invisible; corrected on measurement                                  |
| Palette gap off a variant's viewport    | `edgeLayout.ts`                                                            | variant    | variant, then live         | one relayout (390×844: 12.4 → 8 px, 3.6% of pixels)                  |
| Fingers down before the engine is ready | the paper                                                                  | —          | no listener                | the shell bursts and records them; adopted where they are when ready |
| Saved settings that change the frame    | toolbar style, button size, drawer, colours                                | defaults   | —                          | no frame for a visitor with a record; today's render                 |

Verification, on the SDK 57 build, the SDK 58 build and the SDK 58 build with the inlined style
sheet (the evidence package's `results/`, `results/sdk58/` and `results/quiet-host/`):

* **Pixels.** The static frame (bundle blocked) and the hydrated, settled screen differ in 0 pixels
  at every variant viewport, light and dark.
* **DOM.** The settled DOM after hydration equals a fresh client render of the same bundle element
  for element, with styles normalised through the CSSOM. That holds at six viewports, on and off the
  variants, and for a visitor with a saved record. This is the check that would catch an attribute
  React kept silently.

### Startup cap (proposed split, awaiting the owner)

The build measures 860,582 bytes against the 850,230 cap, so `native:web:build`'s post-check fails.
No CI job runs that build. The cap structure is unchanged until the owner decides.

| Part of the startup path                                   | Bytes   |
| ---------------------------------------------------------- | ------- |
| Inline CSS: `strict.css`                                   | 26,815  |
| Inline CSS: the paper texture rule                         | 10,493  |
| Inline CSS: React Native Web's critical rules              | 2,716   |
| Inline CSS: the feedback styles                            | 814     |
| Inline CSS: Expo's reset and the boot theme                | 528     |
| Inline JS: the boot scripts (theme, surface, frame, input) | 3,703   |
| The bundle: Expo's runtime and the entry chunk             | 815,513 |

Against the SDK 58 baseline (838,334), the prerender adds 22,248 bytes:

* 10,493 for the texture;
* 4,837 for the entry chunk's server snapshots, window seam, guards, adoption and live stamps;
* 3,388 for the boot scripts;
* 3,530 for the critical and feedback CSS.

With the bundle held until after first paint, one cap measures two different things. The proposal
splits it, each part set from measurement plus headroom by ADR-0179's rule:

* **A first-paint cap** on what the first frame needs before it can paint: the shell's inline CSS
  and inline scripts, now 45,069 bytes. The template markup is not in it; the shell document is
  23,335 bytes brotli. ADR-0179's 11,896 bytes of headroom would be a quarter of this cap, so it
  would catch nothing smaller than the whole feedback layer. A headroom below the smallest
  first-paint lever taken here, the 1,649-byte boot script, would catch it. One choice is 1,500
  bytes, giving a cap of 46,569.
* **A core-controls cap** on the bundle tier 2 needs. Without tiers that is Expo's runtime plus the
  entry chunk: 815,513 bytes, with ADR-0179's 11,896 bytes of headroom giving 827,409.

### Interactivity tiers (proposed, awaiting the owner)

The owner's order: (0) everything visible; (1) the drawing engine, as soon as possible; (2) palette,
brushes, stroke width and Undo; (3) Clear, drawer, coloring book and AI; (4) the settings cog and
parent gate, last. Today one whole-tree hydration makes every tier live at once. Measured on a phone
under applied throttling, from navigation start, in ms:

| Tier                                         | RN baseline   | This draft |
| -------------------------------------------- | ------------- | ---------- |
| 0: first paint and LCP                       | 2,972 / 3,628 | 724 / 724  |
| 1: a finger on the paper draws               | about 3,000   | 2,642      |
| 2–4: controls take presses (`controls-live`) | 2,961         | 2,519      |

The baseline's tier 1 is when its paper first appears. Before that a touch lands on nothing.

The entry chunk's source map (`results/early-input/entry-attribution.json`) bounds what tiering
could buy:

* **Libraries** load before anything can hydrate: React DOM 211,589 bytes, React Native Web 140,669,
  React 8,142, Expo's runtime 6,064 and others 24,033, about 390 KB.
* **The drawing engine** is 100,093 bytes.
* **The drawing chrome** (palette, actions panel, Clear, drawer) is 122,111 bytes.
* **Product, settings and the library** are 75,576 bytes.
* **Platform seams** are 27,517 bytes and other app code 25,029.

A tier-1 chunk needs the libraries, the engine and most of the seams: about 70% of the entry's
bytes. At Slow 4G's throughput (the entry is 197,360 bytes brotli) that brings the engine forward by
about 0.3 s, not to first paint. The library floor alone takes about 0.5 s to arrive. Suspense
boundaries with lazy chunks would split hydration that way.

The boot script already keeps a press on a part that is not live from the app, so the design needs
no React event replay. React 19's replay of a click on a still-dehydrated boundary was not verified
with React Native Web's pressables, because nothing here depends on it. Per-tier stamps would let
the same guard release each tier as it goes live.

### Prerender mechanism (proposed, awaiting the owner)

Two options were measured through the same shell and checks.

| Mechanism                                                | Hydrates          | Devtools LCP | Controls live | Build cost                     |
| -------------------------------------------------------- | ----------------- | ------------ | ------------- | ------------------------------ |
| Node render (this draft: Metro `environment: node`)      | yes, 0 mismatches | 724 ms       | 2,513 ms      | 7 s, warm cache; no browser    |
| Headless-browser snapshot (react-snap style, Playwright) | no: error #418    | 733 ms       | 2,555 ms      | 46 s for 12 variants; Chromium |

The snapshot is the settled screen: it already holds measured layout and client-only elements, so it
can never equal the client's first render. React reports minified error #418 (hydration mismatch) on
every load, discards the snapshot and re-renders the whole root. That hides the mismatch class this
ADR's checks exist to catch, and it re-does the work hydration should save.

The snapshot pattern also needs a browser at build time. Playwright is a development dependency, so
a Netlify web build would have to install it and its Chromium. It remains fit for a static
placeholder that is replaced rather than hydrated.

**Recommendation: keep the Node render.** It is the mechanism Expo Router's own static export uses.
Two parts are off that path and can be narrowed:

* The deep import of `@expo/cli`'s `exportEmbedAsync.js`. Pin it with a test that fails when Expo
  moves it, or reach Metro through Expo's public `expo export:embed` command.
* happy-dom's `DOMParser` at build time. Have `gen-native-icons.mjs` emit the icons' parsed element
  trees, so neither the client nor the build parses SVG text.

## Consequences

Phone, first visit, quiet host, medians of three, in ms. "Before" is the draft with only the frame
and inlined style sheet, before the owner's decisions.

| Tier                                    | Shipping | RN baseline | Before  | This draft                    |
| --------------------------------------- | -------- | ----------- | ------- | ----------------------------- |
| 0: first paint (devtools method)        | 824      | 3,037       | 682     | 724                           |
| 0: LCP (devtools method)                | 824      | 3,652       | 1,231   | 724                           |
| 0: LCP (Lighthouse simulated, the gate) | —        | 2,785       | 1,351   | 1,051                         |
| 1: time to first scribble (CDP probe)   | —        | about 3,000 | 2,600 ¹ | 2,642, finger held from 739 ² |
| 2–4: controls live (CDP probe)          | —        | 2,961       | 2,465   | 2,519                         |

¹ Estimated: that build has no live stamp. It is its hydration (2,465) plus the 120 ms or so the
engine takes to become ready. A touch before that was lost. ² The burst answers the touch at once,
and the held finger becomes ink at 2,642 without lifting.

* \+ First paint and LCP land together at 724 ms, ahead of shipping's 824, on the method the RN
  campaign trusts. The simulated LCP the `tools/page-load` gate reports fell from 2,785 to 1,051 ms
  on phone and tablet.
* \+ The whole drawing screen is visible from the first frame in the visitor's size class and theme.
  It is pixel-identical to the hydrated screen on the variants' viewports.
* \+ The time the frame shows before it listens is no longer dead. The paper answers a touch with a
  burst, and a finger held from then becomes a real stroke as soon as the engine can take it.
  Controls squish and wiggle "not yet", and their press reaches the app only once they listen.
* − The engine still takes about 1.9 s after first paint to listen, and the controls a little less.
  Interactivity tiers (proposed) would bring the engine forward by about 0.3 s. The library floor
  bounds anything more.
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
* − The window seam reroutes 37 modules' `useWindowDimensions` import. The web input view gains an
  `engineReady` prop that the native one ignores.
* − The build adds a Metro build and depends on Expo internals: a deep import of
  `@expo/cli/build/src/export/embed/exportEmbedAsync.js` and `@expo/router-server`'s flag helper. An
  Expo upgrade that moves either fails the build. Both survived the SDK 57 to 58 upgrade unchanged.
* − The build depends on happy-dom, a development dependency, for `DOMParser`. Shipping the web
  export from Netlify would need it moved (ADR-0070), or the icons pre-parsed.
* − The startup path is 22,248 bytes over the SDK 58 baseline and 10,352 over the cap, until the
  owner decides the split.

### Follow-ups

1. **Deviation stamps for saved settings.** Extend the boot script to stamp the settings that change
   the first frame, as ADR-0040 does. Then clone a matching variant instead of none.
2. **The hydrated-vs-fresh DOM comparison in CI.** Also a development-build pass that fails on
   React's hydration warnings.
3. **The cap split, the tiers and the mechanism** await the owner (above).
4. **Port first-frame geometry to CSS where it is cheap**, such as the palette gap, to shrink the
   post-hydration relayout.
