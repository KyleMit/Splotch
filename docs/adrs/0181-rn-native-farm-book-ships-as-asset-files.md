# ADR-0181: The Native Apps Ship the Bundled Farm Book as Asset Files

**Status:** Active **Date:** 2026-10

> Amends [ADR-0179](0179-rn-web-startup-path-splits-by-platform.md), whose "images are data URIs on
> native" and "native keeps its synchronous, offline-complete bundle" no longer hold for the Farm
> book.

## Context

The React Native app (epic 2690) bundles one starter coloring book, Farm (ADR-0103):
`tools/migration/gen-bundled-farm.mjs` generates its modules in
`experiments/native-architecture/src/drawing/bundledFarm/` from the shipping files in
`web/static/coloring/farm/`. Until this decision the native apps carried all of it inside the Hermes
bytecode bundle:

* `images.ts` and `pickerImages.ts`: every fill, selector and cover as a base64 WebP data URI, about
  3.4 MB;
* one module per page holding its four outline variants as strings, about 1.3 MB.

Both apps store that bundle uncompressed: Android keeps `index.android.bundle` uncompressed in the
APK so Hermes can map it, and iOS installs `main.jsbundle` as a plain file. So base64 cost a third
more than the WebP bytes, and the line art could not be compressed at all. The bundle was 9.30 MB on
Android and 10.25 MB on iOS.

ADR-0179 had kept the data URIs on native for two reasons. Moving the images to assets "was
unverifiable without devices", because Skia's decode in `SkiaInk.tsx`, the readiness decode in
`useBundledFillReadiness.tsx` and SVG capture would each meet a new kind of URI. Making the line art
lazy would add "a render without the module", for no startup gain on native.

What changed:

* The size of the native apps became a cutover criterion (`npm run report:app-size`, comparing store
  download and installed size with the shipping app).
* The devices are available, so the asset path could be verified on them.
* Every consumer of a fill already loads file URIs: the downloaded offline books take the same code
  paths with `file://` fills (`offlineLibrary/artwork.tsx`). Skia's `Data.fromURI` reads an Android
  drawable or raw resource name and an iOS file URL, and React Native's `Image` and
  react-native-svg's `Image` both resolve Android resource names. `paperGrain.ts` already loaded a
  native Metro asset through Skia this way.

Alternatives considered:

* **Keep the data URIs and compress nothing.** It costs about 1.5 MB installed per platform for no
  user-visible benefit.
* **Move only the images.** It takes about two thirds of the bundle saving, but on Android the line
  art is the part the APK can compress, about 0.8 MB of the Android saving.
* **Copy the files into the native projects** (Android `assets/`, an Xcode resource folder) and read
  them through a native module. It adds Gradle and Xcode project wiring and a second copy of every
  file, where Metro assets need neither.
* **Ship the line art as generated JSON assets** instead of the shipping SVGs. It duplicates 1.1 MB
  of committed data that the SVGs already hold, and parsing those SVGs costs little: they are flat
  SVGO output that one small regex parser reads.

## Decision

The native apps import the shipped Farm files as Metro assets and never inline them in the bundle.

* **Images.** `images.ts` and `pickerImages.ts` import each WebP and resolve it with
  `nativeAssetUri` (`src/platform/nativeAsset.ts`), which returns `Image.resolveAssetSource`'s URI:
  a drawable resource name on Android, a file URL inside the app on iOS, the Metro server's URL in
  development. Metro puts WebP files in `res/drawable-mdpi` on Android and `assets/` in the iOS app.
  The web modules (`images.web.ts`, `pickerImages.web.ts`) import the same files through
  `webAssetUri`; one generator writes all four.
* **Line art.** `outlineFiles.ts` names each page's four overlay SVGs as native assets; Metro puts
  them in `res/raw` on Android, where the APK compresses them. `bundledOutlines.ts` reads a page's
  four through `readBundledText` (`src/platform/bundledText.native.ts`) and parses them on first
  use, behind the same `createLazyExport` contract the web export's per-page chunks use.
  `readBundledText` hands `nativeAssetUri`'s URI to expo-file-system's legacy `readAsStringAsync`,
  which opens an Android raw resource by its bare name and an iOS file URL in place, without a copy.
  A development build fetches the asset from Metro instead.
* **Not expo-asset.** expo-asset's `downloadAsync` looks like the documented way to read a bundled
  file, and it fails on Android: Metro records an SVG's dimensions, expo-asset treats any asset with
  dimensions as an image and reports its bare resource name as already local, and expo-file-system's
  `File` rejects that name as not absolute. Every Farm page lost its line art on the Galaxy until
  the reader moved to `readAsStringAsync`.
* **One parser.** `src/drawing/overlayOutline.ts` parses an overlay for both the generator (which
  still writes the web export's per-page modules) and the native runtime. Regenerating with it left
  every web page module byte for byte unchanged.
* **Decoded fills stay cached.** `decodeBundledImage` in `skiaInkPainter.ts` keeps a bundled fill's
  decoded image in the same least-recently-used cache a data URI's image used, so returning to a
  page does not decode its fill again.
* **The bundle-free check.** `tools/tests/native-bundled-farm-files.test.mjs` holds every native and
  web module to imports of the shipped files with no inlined image.
  `tools/tests/native-web-lazy-modules.test.mjs` holds the native runtime's parsed line art equal to
  the web chunk's. `tools/tests/native-bundled-text.test.mjs` holds `readBundledText` to reading
  Android resource names and iOS file URLs in place. `bundledText.native.ts` carries a `.native`
  suffix because only the native `bundledOutlines.ts` imports it.

Invariant: a native module that needs the line art synchronously must wait for it.
`usePageOutlineReady` already gates picture capture, and `PageArtMotion` enters the art once it has
loaded, so neither draws a page without its outline.

## Consequences

* \+ The JavaScript bundle shrinks from 9.30 to 4.83 MB on Android and from 10.25 to 5.79 MB on iOS.
* \+ Installed size, measured with `npm run report:app-size` against the profiling devices: Android
  (Galaxy spec) 54.0 → 52.6 MB and iOS (iPad13,8) 56.0 → 55.2 MB. Download size is unchanged on both
  (22.5 and 20.6 MB), because the stores already compressed the bundle. iOS gains less because it
  installs the line art uncompressed either way; only the base64 overhead goes.
* \+ Native and web read the same shipped files through one parser, so their line art cannot drift.
* \+ Measured on the devices, nothing a child sees changed. On a fresh install in airplane mode the
  Galaxy's picker, Farm pages, Cow page and Magic fill match the previous build pixel for pixel
  outside the Magic strokes' own sampling; so do the iPad's picker, Cow line art and Magic fill.
  Cold start to a drawable paper (Galaxy first launch 953 → 918 ms, iPad 391 → 377 ms) and first ink
  (Galaxy 33 → 37 ms, iPad 31 → 30 ms) stayed within run-to-run spread.
* − A Farm page's line art loads after the page is chosen on native: on first use per launch the app
  reads and parses four SVG files. Parsing a page takes 0.12 to 0.19 ms in Node, a few milliseconds
  in Hermes, and the Galaxy's page switch settled in 469 to 561 ms against 475 to 510 ms before,
  inside its spread. The art keeps its entrance animation, which starts when the art arrives.
* − The native line art can fail to load, which the bundle could not. A failure is logged and the
  next consumer retries, as `createLazyExport` does on web. With the files inside the app package,
  no failure is expected outside disk corruption.
