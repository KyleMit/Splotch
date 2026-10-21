---
name: build
description: Build the signed release artifacts for the current version (Android .aab, iOS .ipa)
---

You are building the **release artifacts** for Splotch — the signed binaries you upload to the app
stores. The stores ship the React Native app in `experiments/native-architecture`. This is phase 2
of three, and the phases are ordered for a reason:

| Phase      | Skill               | Produces                                                |
| ---------- | ------------------- | ------------------------------------------------------- |
| 1. Release | `cut-release`       | version bump, tag, notes, GitHub Release (no artifacts) |
| 2. Build   | `build` (you)       | the signed `.aab` / `.ipa` for that version             |
| 3. Publish | `publish-artifacts` | those artifacts attached to the GitHub Release          |

`cut-release` must come first because an artifact can only carry a version that is already committed
— which is why `cut-release` attaches nothing, and why the artifacts you build here are attached
afterwards by `publish-artifacts` (ADR-0077). `build` on its own is also fine any time you just want
a fresh local build.

**Store identity is opt-in** (ADR-0182). Only the store scripts below build `art.splotch.app`, the
ID that installs over the store copy. Every other build of the app, Release included, is
`art.splotch.app.dev`. A store artifact reaches a device only through the stores: installed by hand,
it collides with the store-installed copy and puts the drawings that copy holds at risk. For a
Release build to install, use `npm run native:android:apk` or a plain `xcodebuild`, which stay
`.dev`.

**Each script deletes its previous artifact before building**, so a file at the artifact path after
a failed build is not this build's. Still confirm the version per the verify steps below rather than
treating "the file exists" as "the build succeeded".

This builds **Android** (a signed `.aab`) and **iOS** (an App Store `.ipa`; macOS + Xcode + the
shipping signing team only — see the `mobile` skill).

Optional argument: a platform (`android` or `ios`). If omitted, build every platform this machine
can (iOS requires macOS with full Xcode — check `xcodebuild -version` works before attempting it,
and skip iOS with a note if it doesn't).

## Android

1. **Show what will be built.** Read the `version` in `package.json` and the `androidVersionCode`
   from the matching `releases/<version>.md`. Tell the user the version + versionCode this build
   will carry, so they can confirm it's the one they expect (it reflects the last `cut-release`).

2. **Check signing is configured.** Confirm
   `experiments/native-architecture/android/keystore.properties` exists. If it does not, **stop**:
   the store build refuses to configure without the upload key. Tell the user to create it from
   `keystore.properties.example` beside it, with `storeFile` naming the shipping upload keystore
   (`../../../android/upload-keystore.jks`) — Play accepts the update only under that key.

3. **Build the signed bundle.** Run `npm run native:android:bundle`. It runs
   `gradlew -Psplotch.store=true :app:bundleRelease` in the React Native Android project, then
   checks the signature with `jarsigner` (`tools/mobile/android/verify-release-bundle.mjs`, which
   prints just `jar verified.` on success). It is slow (minutes) — let it finish. If Gradle or the
   signature check fails, surface the error and stop.

4. **Verify the bundle carries the identity and version you expected.** Run
   `npm run release:publish -- --only=android --dry-run`. It reads the app ID, versionName and
   versionCode out of the `.aab` itself and checks them against `art.splotch.app` and
   `releases/<version>.md`, along with the signature block and the R8 mapping. A version mismatch
   means Gradle did not produce a new bundle; a `.dev` app ID means the bundle was not built by the
   store script. Surface either and stop rather than reporting success.

5. **Report.** Tell the user:
   * the app ID, version + versionCode read back out of the built `.aab` and its path
     (`experiments/native-architecture/android/app/build/outputs/bundle/release/app-release.aab`),
   * that signature verification passed.

   Uploading to the Google Play Console is still a **manual** step (no Fastfile/CI lane yet) — point
   the user at the Console and the `.aab`. The matching Play "What's new" text lives at
   `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt`.

## iOS

1. **Show what will be built.** Same version check as Android — the iOS
   `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION` in `Splotch.xcodeproj` are bumped by `cut-release`
   alongside Android, so report the same version + build number.

2. **Check the toolchain + signing.** `xcodebuild -version` must work (full Xcode, not Command Line
   Tools), and `pod` must be on `PATH`. Signing is automatic, but it needs the shipping team in
   `experiments/native-architecture/ios/local.xcconfig` (`DEVELOPMENT_TEAM = …`, from
   `local.xcconfig.example` beside it). If that file is missing, **stop** and tell the user to
   create it; never write a team into `project.pbxproj`. A different team cannot update the store
   app (see the `mobile` skill's `ios.md`).

3. **Build the `.ipa`.** Run `npm run native:ios:ipa`. It runs `pod install`, archives Release with
   `-xcconfig Store.xcconfig` (the opt-in that clears the `.dev` suffix) and
   `-allowProvisioningUpdates`, then exports per
   `experiments/native-architecture/ios/ExportOptions.plist`. Slow (minutes) — let it finish. If
   xcodebuild fails, surface the error and stop.

4. **Verify the `.ipa` carries the identity and version you expected.** Run
   `npm run release:publish -- --only=ios --dry-run`, which reads `CFBundleIdentifier`,
   `CFBundleShortVersionString` and `CFBundleVersion` out of the exported `.ipa` and checks them
   against `art.splotch.app` and `releases/<version>.md`. A mismatch means the export reused an
   older archive or skipped the store opt-in — surface it and stop rather than reporting success.

5. **Report.** Tell the user:
   * the bundle ID, version + build number read back out of the exported `.ipa` and its path
     (`experiments/native-architecture/ios/build/ipa/Splotch.ipa`),
   * that uploading is **manual**: drag the `.ipa` into Apple's **Transporter** app (or Xcode
     Organizer). The matching "What's New" text lives at
     `fastlane/metadata/en-US/release_notes.txt`.

## Next step

If this build was for a version that has already been released, finish with **`publish-artifacts`**
to attach what you just built to the GitHub Release for it. Suggest it explicitly — an artifact that
is built but never attached is the normal way a release ends up with no downloadable binary.

If you built without a matching release (just a local build), there is nothing to attach; say so
rather than pointing at the publish step.
