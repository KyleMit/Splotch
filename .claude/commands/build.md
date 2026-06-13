---
description: Build the signed release artifacts for the current version (Android .aab, iOS .ipa)
---

You are building the **release artifacts** for Splotch — the signed binaries you
upload to the app stores. This is **separate from `/release`**: `/release` bumps
the version and writes the changelog/notes; `/build` just compiles the artifacts
for whatever version is currently committed. So `/build` is normally run *after*
`/release` (or any time you want a fresh local build).

This builds **Android** (a signed `.aab`) and **iOS** (an App Store `.ipa`;
macOS + Xcode + a signing team only — see the `mobile` skill).

Optional argument: a platform (`android` or `ios`). If omitted, build every
platform this machine can (iOS requires macOS with full Xcode — check
`xcodebuild -version` works before attempting it, and skip iOS with a note if
it doesn't).

## Android

1. **Show what will be built.** Read the `version` in `package.json` and the
   `androidVersionCode` from the matching `releases/<version>.md`. Tell the user
   the version + versionCode this build will carry, so they can confirm it's the
   one they expect (it reflects the last `/release`).

2. **Check signing is configured.** Confirm `android/keystore.properties` exists.
   If it does not, **stop** — without it the `.aab` builds unsigned and can't be
   uploaded. Tell the user to create it from `android/keystore.properties.example`.

3. **Build the signed bundle.** Run `npm run android:bundle`. This syncs the web
   build into the native project and runs `gradlew :app:bundleRelease`. It is
   slow (minutes) — let it finish. If Gradle fails, surface the error and stop.

4. **Verify the signature.** Run `npm run android:verify`. This wraps `jarsigner`
   in `scripts/android-verify.mjs`, which prints just `jar verified.` and exits 0
   on success. On success that one line is all you'll see. If it fails, the script
   dumps the full jarsigner output and exits non-zero — surface that and stop.

5. **Report.** Tell the user:
   - the version + versionCode of the built `.aab` and its path
     (`android/app/build/outputs/bundle/release/app-release.aab`),
   - that signature verification passed,
   - that `npm run android:open` will reveal the file in Explorer.

   Uploading to the Google Play Console is still a **manual** step (no
   Fastfile/CI lane yet) — point the user at the Console and the `.aab`. The
   matching Play "What's new" text lives at
   `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt`.

## iOS

1. **Show what will be built.** Same version check as Android — the iOS
   `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION` are bumped by `/release`
   alongside Android, so report the same version + build number.

2. **Check the toolchain + signing.** `xcodebuild -version` must work (full
   Xcode, not Command Line Tools). Signing is automatic via Xcode, but it needs
   a Team configured on the App target — if the archive step fails with a
   signing/provisioning error, tell the user to open `npm run cap:ios` →
   Signing & Capabilities and select their team (Apple Developer Program
   account required; see the `mobile` skill §6).

3. **Build the `.ipa`.** Run `npm run ios:ipa`. This syncs the web build,
   archives Release, and exports per `ios/App/ExportOptions.plist`. Slow
   (minutes) — let it finish. If xcodebuild fails, surface the error and stop.

4. **Report.** Tell the user:
   - the version + build number of the exported `.ipa` and its path
     (`ios/App/build/ipa/App.ipa`),
   - that uploading is **manual**: drag the `.ipa` into Apple's **Transporter**
     app (or Xcode Organizer). The matching "What's New" text lives at
     `fastlane/metadata/en-US/release_notes.txt`.
