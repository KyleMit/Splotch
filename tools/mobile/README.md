# Mobile tooling

This capability owns repository automation shared by Splotch's Android and iOS apps: native app
identity checks, Capacitor static-export pruning and validation, and the Maestro smoke-test support
used by both platform runners. Platform-specific build and lifecycle entry points live under
[`android/`](android/) and [`ios/`](ios/).

`privacy-permission-inventory.json` is the reviewed machine-readable declaration of native
permissions, store data categories, retention boundaries, and production outbound-host classes. The
tools-tier tests compare it with both native manifests, the iOS usage strings, the privacy manifest,
implementation constants and call sites, the scheduled purge functions' `schedule` literals and
every Markdown copy of their cadence, the store checklists, and `/privacy`. Web and worker
first-party calls remain same-origin in development and deploy previews; only native builds pin the
production `splotch.art` host.

## Entry points

| Entry point               | Public hook                  | Purpose                                                                                                                                                                                      |
| ------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check-app-ids.mjs`       | `precheck`                   | Verify app identifiers and display names across native owners                                                                                                                                |
| `strip-static-assets.mjs` | `build:cap`                  | Remove web-only assets from the static Capacitor export                                                                                                                                      |
| `check-static-bundle.mjs` | `postbuild`, `postbuild:cap` | Prove native-only lifecycle code stays out of the web bundle; reject web-only routes, services, or assets in the native export; and require the store-mandated pages to ship *and* be linked |
| `report-app-size.mjs`     | `report:app-size`            | Report store download size and on-device install size for the shipping app and the React Native app, per platform, from release artifacts                                                    |

The build entry points read `capacitor.config.json`, native project configuration, active mobile
documentation, and `web/build/`. Pruning changes only the freshly generated `web/build/` output; it
never edits `web/static/`. The checker proves the resume lifecycle is present only in the native
build, requires the bundled privacy and changelog pages, permits only the starter coloring book, and
fails if web-only hosts, admin copy, or PWA boot markers remain.

## App size: shipping vs React Native

`npm run report:app-size` measures what a user downloads from the store and what the app occupies
once installed, so the RN cutover decision compares sizes the way the stores serve them. It takes
release artifacts, not source, and builds nothing itself:

```sh
npm run report:app-size -- \
  --android-shipping=<app-release.aab> --android-rn=<app-release.aab> \
  --ios-shipping=<App.xcarchive> --ios-rn=<Splotch.xcarchive> \
  --json=<report.json>
```

Pass any subset; a platform with both apps also gets an RN-vs-shipping delta line.

* **Android** runs `bundletool build-apks`, then `get-size total` for the download Play would serve
  the reference device and the range across every device configuration, and `extract-apks` for that
  device's splits, whose total is the install size. Install size excludes ART-compiled code and app
  data. The reference device is `android-reference-device-spec.json`, the profiling Galaxy S21 FE
  trimmed to the fields that select splits (ABI, density, SDK, locale); `--android-device-spec`
  names another `bundletool get-device-spec` file. A universal `.apk` is accepted and measured with
  `apkanalyzer`, but it carries every ABI and density, so the report flags it as not comparable.
* **iOS** exports the archive with `<thin-for-all-variants>` through `xcodebuild -exportArchive`
  (method `debugging`, automatic signing) and reads Xcode's `App Thinning Size Report.txt`: download
  is the variant's compressed size, install its uncompressed size, for the profiling iPad
  (`iPad13,8` on iPadOS 26.5) unless `--ios-device` and `--ios-os` name another model and OS. A
  variant's os-version is its minimum OS, so the report takes the newest variant that OS can
  install, never a newer one the device could not run. `--allow-provisioning-updates` passes the
  same flag to `xcodebuild` when export needs a profile created. A thinning report `.txt` is also
  accepted directly. The App Store encrypts the executable before delivery, which compresses worse,
  so App Store Connect reports a somewhat larger download than the thinning report.

Prerequisites: `bundletool` on `PATH` (`brew install bundletool`) or `BUNDLETOOL_JAR` naming a
`bundletool-all` jar, Java, the Android SDK's `apkanalyzer` for `.apk` input, and Xcode with a
development signing identity for `.xcarchive` input. Thinning the RN app also needs Xcode's Metal
Toolchain (`xcodebuild -downloadComponent MetalToolchain`), because react-native-svg bundles
`.metallib` shaders; the shipping app has none. Each measurement fails on its own with the tool's
output; the report still prints the ones that succeeded, exits non-zero, and writes no JSON.

Producing the inputs:

* Shipping Android: the `app-release.aab` attached to the GitHub Release is the exact store upload
  (`gh release download <tag> -p app-release.aab`); `npm run android:bundle` builds one from source.
* Shipping iOS: `npm run ios:archive` at the release tag writes `ios/App/build/App.xcarchive`.
* RN Android: `./gradlew bundleRelease` from `experiments/native-architecture/android`, which signs
  the `art.splotch.app.dev` bundle with the local debug key; size does not depend on the identity or
  key. Leave the perf-probe variables unset.
* RN iOS: after `pod install`,
  `xcodebuild -workspace Splotch.xcworkspace -scheme Splotch -configuration Release -destination generic/platform=iOS -archivePath <out>.xcarchive archive`
  from `experiments/native-architecture/ios`, with the team in its untracked `local.xcconfig`.

`tools/mobile/tests/app-size.test.mjs` pins the bundletool and thinning-report parsers and the flag
handling.

## Shared support

`lib/static-export.mjs` owns the web-only static-file catalog and matching head-tag rewrite.
`lib/maestro.mjs` resolves the Maestro executable, while `lib/mobile-smoke-test.mjs` runs the shared
`.maestro/smoke.yaml` flow after a platform runner builds and installs the app. These modules are
support code, not standalone commands.

Mobile builds require the normal project dependencies. Static pruning and checking require a fresh
Capacitor build; a missing or inconsistent export exits nonzero with the affected path or marker.
Keep cross-platform policy here, Android SDK/Gradle concerns under `android/`, and Xcode/simulator
concerns under `ios/`. When native identity, excluded routes, or static assets change, update their
owning source and the corresponding drift guard rather than duplicating another literal.

Focused repository checks:

```sh
npm run test:tools -- tools/mobile
npm run check
```
