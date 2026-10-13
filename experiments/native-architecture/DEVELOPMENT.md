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
whose first precache entry is the build's own app shell. Its post hook,
`tools/migration/check-native-web-precache.mjs`, fails when the shell is not first, an exported file
is not precached, a bundled Farm page is missing from the precached chunks, or the precache outgrows
its budget. Serve `dist/web` from any static server; the entry registers `/sw.js` only in the web
build (`src/platform/serviceWorker.web.ts`).

A new worker waits until every window of the old one closes, so an update never interrupts a
drawing. The Install Banner and the Settings install guide (`src/install/`) follow the shipping
policy and storage keys; their copy is drift-guarded against the Svelte components by
`tools/tests/native-web-install-drift.test.mjs`.

## Permissions

The Android manifest removes Expo FileSystem's legacy `READ_EXTERNAL_STORAGE` and
`WRITE_EXTERNAL_STORAGE` declarations; saving uses app-private storage and sharing uses a cache PNG.
`tools/migration/tests/native-permissions.test.mjs` guards the manifest. Check a built APK's merged
permissions when a dependency changes.
