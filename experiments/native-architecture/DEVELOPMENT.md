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
names is not precached, a bundled Farm page is missing from the precached chunks, or the precache
outgrows its budget. Serve `dist/web` from any static server that returns the exported bytes
unchanged: a host that rewrites HTML or assets (snippet injection, minification) makes every install
fail its integrity check. The entry registers `/sw.js` only in the web build
(`src/platform/serviceWorker.web.ts`).

A new worker waits until every window of the old one closes, so an update never interrupts a
drawing. The Install Banner and the Settings install guide (`src/install/`) follow the shipping
policy and storage keys; their copy is drift-guarded against the Svelte components by
`tools/tests/native-web-install-drift.test.mjs`.

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
