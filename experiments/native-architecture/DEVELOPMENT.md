# Native app development

This is the React Native (Expo) Splotch app. It is separate from the shipping Capacitor app and its
native smoke flow.

## Setup

Install JavaScript dependencies once with `pnpm install` at the repository root. The app has no
separate install step; Metro and the native builds resolve packages from the root `node_modules`.

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

## Permissions

The Android manifest removes the `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, and
`READ_MEDIA_VISUAL_USER_SELECTED` declarations that Expo FileSystem and expo-media-library merge in.
Editable copies use app-private storage, sharing uses a cache PNG, and saving to the photo library
inserts into MediaStore under `Pictures/Splotch/`, the shipping app's album, which needs no
permission on Android 11 and later. On Android 7–10 it is not attempted: the in-app copy is kept and
the notice says the gallery needs Android 11. iOS asks only for add-only Photos access
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
