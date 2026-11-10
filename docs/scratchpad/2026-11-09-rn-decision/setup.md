# Setup lane: both arms ready on both devices

2026-11-09, 21:53–22:08 EST. Devices: the Galaxy (S21 FE, Android 16) and the iPad (Pro 12.9-inch
5th gen, iPadOS 26.5). Device identifiers, artifact paths and copy-paste install, launch and swap
commands are in the untracked rig file (`RIG.md`, "Setup lane additions").

## Installed after setup

| Device | Bundle / application ID            | Arm                   | Source      | Build                                                     |
| ------ | ---------------------------------- | --------------------- | ----------- | --------------------------------------------------------- |
| Both   | `art.splotch.app`                  | store                 | v1.6.0      | untouched                                                 |
| Both   | `art.splotch.app.dev`              | RN                    | `427756f14` | Release, perf probe ON (from preflight, unchanged)        |
| Both   | `art.splotch.app.baseline.main`    | shipping              | `ef3d1eb20` | Release, production web bundle, API `https://splotch.art` |
| iPad   | `art.splotch.app.baseline.release` | v1.6.0 reconstruction | `6572ed535` | older campaign, left in place                             |

Not installed, ready to swap in over `art.splotch.app.dev`: RN Release with the probe OFF, both
platforms.

## How each artifact was built

| Artifact             | Method                                                                                                                                                                                                                                                                                                           | Checks                                                                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shipping Android     | `npm run android:apk:release` (`cap:sync` + `:app:assembleRelease`, R8 on). Uncommitted edit to the release build type: `applicationIdSuffix ".baseline.main"` and the debug signing config; reverted after the build. Shipping has no documented suffix flag; earlier campaigns used the same local-edit route. | `postbuild:cap` gates passed (release seams, version 1.6.0, static bundle, native budget 6.13/7.0 MB); APK badging `art.splotch.app.baseline.main` 1.6.0 (8); Android Debug certificate |
| Shipping iOS         | The `ios:archive` invocation as a `build` (`-scheme App -configuration Release -destination generic/platform=iOS -xcconfig ../local.xcconfig -allowProvisioningUpdates`). Uncommitted `PRODUCT_BUNDLE_IDENTIFIER` edit in the pbxproj, reverted after the build.                                                 | Apple Development signing, team wildcard profile; `CFBundleIdentifier` `art.splotch.app.baseline.main`                                                                                  |
| Shipping web payload | One `cap:sync` fed both platforms                                                                                                                                                                                                                                                                                | The 249 web files hash identically in `web/build`, the APK and `App.app`                                                                                                                |
| RN probe (copied)    | Preflight's artifacts, copied before rebuilding                                                                                                                                                                                                                                                                  | APK byte-identical to the Galaxy's installed `base.apk`                                                                                                                                 |
| RN plain Android     | `DEVELOPMENT.md` "Performance probe" with both probe variables unset: `./gradlew :app:createBundleReleaseJsAndAssets --rerun :app:assembleRelease -PreactNativeArchitectures=arm64-v8a`                                                                                                                          | Hermes bundle 4.81 MB vs probe 5.89 MB; replay driver strings (`SplotchReplay`, `emissionLateness`, trace names) absent; debug certificate unchanged, so `install -r` swaps in place    |
| RN plain iOS         | Same, `xcodebuild -workspace Splotch.xcworkspace -scheme Splotch -configuration Release`, separate derived data                                                                                                                                                                                                  | `main.jsbundle` 5.76 MB vs probe 6.85 MB; replay strings absent; `art.splotch.app.dev`, same team                                                                                       |

Both frozen trees end clean (`git status` empty). No commits in either.

## Verification on device

| Check                                   | Galaxy                                                | iPad                                                                               |
| --------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Shipping launches                       | Yes, light paper, portrait                            | Yes, Night Mode paper, landscape                                                   |
| Drag draws ink                          | Yes: `adb shell input swipe` drew one purple line     | **Not verified**: no touch injection available (below)                             |
| Version shown                           | Settings › About: "Version 1.6.0"                     | Not read on screen; bundle carries 1.6.0 (8), web bundle identical to the Galaxy's |
| RN probe launches (appearance baseline) | Light paper, portrait, same chrome layout as shipping | Night Mode paper, landscape                                                        |

Screenshots: `setup/` in the campaign scratch folder.

## What later lanes must know

1. **iPad touch injection is down.** WebDriverAgent's runner fails with "Timed out while enabling
   automation mode" (an expired UI-automation grant only a person at the iPad can clear), and the
   borrowed Appium's discovery reports "Unknown device or simulator UDID" (empty tunnel registry).
   Shipping on the iPad can be launched and screenshotted, not driven. The RN probe's replay still
   draws without touch. Owner-packet candidate added.
2. **Every app is labelled "Splotch" with the same icon**, store copy included, on both devices.
   Launch by ID only; an owner case must name the icon's position, not its label.
3. **The RN tree's `android/app/build/outputs/apk/release/app-release.apk` is now the plain build.**
   `DEVELOPMENT.md`'s install line would install the probe-off app; take the probe from the campaign
   `builds/rn-probe/`.
4. **RN iOS builds need a lock workaround.** The installed `Pods/` came from a local `pod install`
   whose checksums differ from the committed `Podfile.lock`, so a build fails at "Check Pods
   Manifest.lock". The build script copies `Pods/Manifest.lock` over `Podfile.lock` for the build
   and restores the tracked file.
5. **Shipping started a coloring-book download on first launch** (Galaxy Settings: "1 extra book
   ready"). Let background downloads settle, or `pm clear`, before a timing capture.
6. **Observed parity difference (cosmetic, RN only):** on the iPad in landscape the RN palette rail
   shows 12 swatches and drops Indigo; shipping shows 13. Both apply the same trim order, so RN
   computes one fewer slot. Not investigated further; for the parity lane.
7. Version strings cannot tell arms apart: both report 1.6.0 (8). Use the bundle ID.

## Could anything here flip the decision?

No. The only risk to the campaign is item 1: iPad comparisons that need real touch on shipping wait
on the owner until the grant is cleared.
