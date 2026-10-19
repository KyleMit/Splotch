# Native app development

This is the React Native (Expo) Splotch app. It is separate from the shipping Capacitor app and its
native smoke flow.

## Setup

Install JavaScript dependencies once with `pnpm install` at the repository root. The app has no
separate install step; Metro and the native builds resolve packages from the root `node_modules`.

## Checks

CI runs three checks over this app on every pull request, alongside the web app's:

* `npm run check:migration:types` type-checks this app's own TypeScript project (`tsconfig.json`),
  which `npm run check` does not reach. It runs in the Quality job.
* `npm run test:migration:rsd-selection` mounts the drawing screen's tests
  (`tools/migration/tests/rsd-native-*.test.mjs`) through the released native react-strict-dom
  renderer. It runs in the Browserless tests job.
* `npm run lint` holds `src/` to React's rules of hooks and exhaustive effect dependencies.

`tools/migration/tests/native-ci-wiring.test.mjs` fails if either command leaves its job.

## iOS

```sh
cd experiments/native-architecture/ios
pod install
```

Open `HelloWorld.xcworkspace` in Xcode (or use `xcodebuild -workspace HelloWorld.xcworkspace`) and
build the `HelloWorld` scheme for a simulator or device.

* **Release** embeds the JavaScript bundle and runs without Metro.
* **Debug** loads JavaScript from Metro. Start it from `experiments/native-architecture` with
  `npx expo start`, choosing a free port (`npm --silent run show:free-port`) and passing it with
  `--port`.

`Pods/` and `build/` are ignored; `Podfile.lock` and the workspace are committed.

## Android

Every Gradle invocation requires the four Release signing properties declared in
`android/app/build.gradle`. The keystore must be named `candidate-release.keystore` and live outside
the repository:

```sh
cd experiments/native-architecture/android
./gradlew assembleRelease \
  -Psplotch.probe.release.storeFile=/absolute/path/outside/repo/candidate-release.keystore \
  -Psplotch.probe.release.storePassword=... \
  -Psplotch.probe.release.keyAlias=... \
  -Psplotch.probe.release.keyPassword=...
```

The signed APK is `android/app/build/outputs/apk/release/app-release.apk`; install it with
`adb install -r`. A local keystore supports development only and is not store signing.

## Performance probe

A Release bundle built with `EXPO_PUBLIC_SPLOTCH_PERF_PROBE=1` in the environment counts the live
stroke's work and writes one JSON line (`v` 2) per contact cohort to the device log. Without it the
probe is `false` at every call site (`src/drawing/perfProbe.native.ts`); the web export, Node and
the type checker resolve the no-op `src/drawing/perfProbe.ts` instead. `babel-preset-expo` inlines
`EXPO_PUBLIC_*` values into a production bundle when Metro transforms it, and both Release bundle
steps pass `--reset-cache`, so a cached transform never carries an earlier build's value. Gradle
does not treat the environment as an input of `:app:createBundleReleaseJsAndAssets` and reports it
up to date, so an Android build that turns the probe on or back off reruns that task.
`EXPO_PUBLIC_SPLOTCH_PERF_PROBE_BUILD` sets the line's `build` field.

```sh
export EXPO_PUBLIC_SPLOTCH_PERF_PROBE=1 EXPO_PUBLIC_SPLOTCH_PERF_PROBE_BUILD="$(git rev-parse --short HEAD)"
# iOS, from ios/ (after pod install)
xcodebuild -workspace HelloWorld.xcworkspace -scheme HelloWorld -configuration Release \
  -destination generic/platform=iOS build
# Android, from android/, with the signing properties from the Android section; unset the two
# variables and run the same command again to return to a build without the probe
./gradlew :app:createBundleReleaseJsAndAssets --rerun :app:assembleRelease
```

Read the lines from the host:

* **Android:** `adb logcat -s SplotchPerf:I -v raw`.
* **iOS device:** `idevicesyslog -p HelloWorld -m '"probe":"SplotchPerf"'` (or
  `pymobiledevice3 syslog live -pn HelloWorld -m '"probe":"SplotchPerf"'`).
* **iOS simulator:**
  `xcrun simctl spawn <udid> log stream --style compact --predicate 'category == "SplotchPerf"'`.

A cohort runs from the first input packet received while no contact is held to the packet that
leaves none held. Render work after the last lift still counts toward it until `COHORT_SETTLE_MS`
passes or the next contact begins; the line is written then, never while a later cohort is drawing
(`src/drawing/perfCohort.ts`).

| Field                                                  | Counts                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packets`, `samples`, `maxSamplesPerPacket`            | Packets `paperInputOwner` accepted, and the native samples they carried for the contacts each one changed                                                                                                                                                                             |
| `appended`, `duplicate`, `minDistanceRejected`         | What `sampleOutcome` (`src/drawing/model.ts`) kept of each sample after a stroke's first point                                                                                                                                                                                        |
| `strokes`, `points`                                    | Strokes the cohort committed, and the points in its longest                                                                                                                                                                                                                           |
| `inkLayoutEffectCommits`, `surfaceLayoutEffectCommits` | Commits in which `SkiaInk` or `DrawingSurface` rendered, counted by a layout effect without dependencies (React's `<Profiler>` does not report in a production renderer). Live ink renders neither: expect commits only where a cohort starts and ends                                |
| `liveFlush`, `sceneRecord`                             | Count, total and slowest milliseconds of one display frame's live ink (recording the samples since the last frame as ops and painting them on the ink layer) and of recording the scene picture of the layer's tiles                                                                  |
| `inputToSubmission`                                    | For each new scene picture handed to the ink view through Skia's JSI setter: from the newest native sample it newly carries to the hand-off, as count and nearest-rank p50, p95, max and min. It ends at submission, not at a presented frame                                         |
| `clockJoin`                                            | The clock both ends read: `performance.now()` is React Native's `HighResTimeStamp`, `mach_absolute_time` on iOS like `UITouch.timestamp`, and `CLOCK_MONOTONIC` on Android like `MotionEvent.getEventTime()`, whose whole milliseconds can make an interval read up to `errorMs` long |

## Web

`npm run native:web:build` exports the production web build into `dist/web` (gitignored) with
`expo export --platform web`, then makes it installable and offline-capable like the shipping PWA
(ADR-0022, ADR-0039): it copies the shipping `web/static/site.webmanifest`, the icons it and
`web/src/app.html` name, and that document's install head tags, then generates a Workbox worker
whose first precache entry is the exported `index.html` under a URL derived from its bytes. Every
entry carries the subresource integrity of the bytes this build wrote, so an install that receives
another deploy's document or chunks fails rather than pairing them
(`tools/tests/native-web-deploy-race.test.mjs`). Its post hook,
`tools/migration/check-native-web-precache.mjs`, fails when the shell is not first or not at its
content address, an entry is not pinned to the exported bytes, an exported file or a file the shell
names is not precached, a bundled Farm page is missing from the precached chunks, a lazily loaded
icon (`experiments/native-architecture/src/rsdDrawing/iconRegistry.ts`) reaches a script the shell
loads, or the precache outgrows its budget. Serve `dist/web` from any static server that returns the
exported bytes unchanged: a host that rewrites HTML or assets (snippet injection, minification)
makes every install fail its integrity check. The export also writes `404.html`, a copy of the app
shell that a static host answers any other path with; off the drawing route
(`src/platform/appPath.web.ts`, the paths the worker's app-shell route answers) the shell shows
shipping's not-found page, and the worker leaves the file out of its precache. Its head carries
shipping's `viewport-fit=cover` viewport, so safe-area insets reach the app, and a boot style and
script that paint the paper in the saved or system theme before the bundle runs. The entry registers
`/sw.js` only in the web build (`src/platform/serviceWorker.web.ts`).

A new worker waits until every window of the old one closes, so an update never interrupts a
drawing. The Install Banner and the Settings install guide (`src/install/`) follow the shipping
policy and storage keys; their copy is drift-guarded against the Svelte components by
`tools/tests/native-web-install-drift.test.mjs`, and the banner's layout, inline icons and motion by
`tools/tests/native-install-banner-drift.test.mjs`.

Text uses the shipping font, Quicksand. RSD text inherits the `fonts` tokens in
`src/rsdDrawing/tokens.css.ts` from the screen and dialog roots, and headings take `boldText`; React
Native text imports `Text` and `TextInput` from `src/drawing/Text.tsx`, never from `react-native`.
`ShippingFontGate` (`src/platform/shippingFont.tsx`) wraps the screen.

* **Web** keeps the shipping stack and its variable face. Metro's web CSS pipeline does not bundle a
  stylesheet's local `url()` sources, so the gate registers the `@fontsource-variable/quicksand`
  faces itself (`shippingFont.web.tsx`) and renders at once, swapping the font in as the shipping
  app does; the precache carries their WOFF2 files.
* **Android and iOS** cannot register WOFF2, so the gate loads the 400, 500, 600 and 700 static
  faces from `@expo-google-fonts/quicksand` through `expo-font` and renders once they register (or,
  if they fail, in the system font). Each face is its own family, so
  `src/platform/nativeFontFamilies.ts` picks the family from the weight and sets the weight itself
  back to normal: Android resolves a weight of 700 or more on a registered family to a system bold
  face. `fontTheme.native.ts` applies the same faces to the RSD tokens.
* **Android** pads each text's line box out to the face's tallest glyph unless the text sets
  `includeFontPadding: false`, a style React Strict DOM drops.
  `patches/react-strict-dom@0.0.54.patch` sets it on every RSD text, so a line is the face's ascent
  plus descent, as Chromium's `line-height: normal` is.
* **Shipping's hub rows** (`HubList.svelte`) are `<button>`s that never inherit the page font, so a
  WebView sets them in the system face, which `src/rsdDrawing/hubRowFace.native.ts` names as
  `system-ui`. iOS resolves that family itself; Android rounds an unregistered family to regular or
  bold, so `MainApplication.kt` registers `system-ui` as the system typeface and the semibold title
  keeps its weight (`tools/migration/tests/native-system-face.test.mjs` binds the two names). The
  web build keeps the app font there: `src/strict.css` hands every form control the page font, and
  that unlayered rule outranks the layered StyleX style that would revert it.

`tools/tests/native-shipping-font.test.mjs` fails when the web faces drift from the package
stylesheet, a family stops matching the static package's exports, another weight is bundled, an RSD
heading or weight bypasses the font tokens, or a component imports `Text` from `react-native`.

### Large OS text

Native text follows the OS text size (iOS Dynamic Type reaches 3.571× at its largest accessibility
category); shipping's WebView does not, so these layouts have no shipping precedent to copy. A word
must never break across lines. Where a label can meet a narrow box, render it with `WholeWordText`
(`src/rsdDrawing/WholeWordText.native.tsx`): it reports a word the layout broke, and with `fit` it
shrinks only that text until its widest word fits. Dialog titles take their own row before they fit,
and a segmented track stacks its options once a label breaks. A live change of the OS text size
leaves already measured React Native text at its old frame until it remounts, so these adapters
remount on a font-scale key; other text corrects itself when the dialog reopens.

## Permissions

The Android manifest removes broad photo-read declarations merged by Expo FileSystem and
expo-media-library and declares `WRITE_EXTERNAL_STORAGE` with `maxSdkVersion=28`. Android 7–9
(API24–28) requests that write permission when first saving to the photo library. With permission,
`SplotchPhotoLibrary.kt` writes under public `Pictures/Splotch/`; after denial it attempts the
app-specific external media directory and scans the saved file. Android 10 and later (API29+) insert
into MediaStore under `Pictures/Splotch/` without a storage permission. Android's compiled manifest
can also report `READ_EXTERNAL_STORAGE` as an implied permission through API28 because write access
was requested; it is not a broad modern photo-library read request. Editable copies use app-private
storage and sharing uses a cache PNG. iOS asks only for add-only Photos access
(`NSPhotoLibraryAddUsageDescription`), never read access. expo-media-library's config plugin is
deliberately not registered in `app.json`: it would add the read permissions and
`requestLegacyExternalStorage`. `tools/migration/tests/native-permissions.test.mjs` guards the
manifest, including every permission expo-media-library declares. Check a built APK's merged
permissions when a dependency changes; without a keystore, `:app:processReleaseMainManifest` writes
the merged manifest under `android/app/build/intermediates/merged_manifest/release/`. `expo-haptics`
merges the normal-level `VIBRATE` permission for the drag-to-clear threshold haptic, as the shipping
app's `@capacitor/haptics` does.

## AI invite links

An admin hands out invite links shaped `https://splotch.art/?ai_access_token=<code>` (the parameter
is `AI_ACCESS_TOKEN_PARAM` in `web/src/lib/inviteLink.ts`). `src/index.ts` starts `startInviteLinks`
before the first render, and both targets apply a link the way the shipping page's
`captureAiAccessTokenFromUrl` does: the code is saved unverified into the access-code slot of the
secure AI vault, with no Parent Center gate and no on-screen confirmation; the server checks it on
first use. A code that fails `validCredential` (`src/ai/credentials.ts`), which every vault write
enforces, is ignored.

* **Web** (`src/platform/inviteLinks.web.ts`) reads the launch URL and removes the parameter only
  after the save succeeds, so a failed or superseded save leaves the link in place to retry. The
  browser Back owner reads page URLs without the parameter, so that scrub is not a navigation.
* **Native** (`src/platform/inviteLinks.ts`) reads `Linking.getInitialURL()` and `url` events and
  accepts only links that start with `https://splotch.art/?`. A launch link is dropped when any
  credential operation, such as a runtime invite or a typed code, happened while the launch URL was
  being read, so an older link never overwrites a newer credential. `AppDelegate.swift` already
  forwards `open url` and universal-link activities to `RCTLinkingManager`.

No link reaches the native app yet. The shipping Capacitor app declares no intent filter, URL
scheme, or associated domain, so this app adds none either. Routing invite links to the store builds
at cutover needs:

* **Android:** an `android:autoVerify="true"` `VIEW`/`BROWSABLE` intent filter for `https`
  `splotch.art`, with `/.well-known/assetlinks.json` on splotch.art naming the package and the Play
  App Signing certificate SHA-256. An intent filter cannot match a query string before Android 15's
  `uri-relative-filter-group`, so on older devices claiming `/` sends every splotch.art root visit
  to the app.
* **iOS:** the `com.apple.developer.associated-domains` entitlement with `applinks:splotch.art`, and
  an `apple-app-site-association` file on splotch.art whose component for `/` requires the
  `ai_access_token` query item, so other root visits stay in Safari.
