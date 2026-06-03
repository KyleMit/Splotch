---
description: Build, sign, and verify the Android release bundle (.aab) ready for the Play Store
---

You are producing the **Android release artifact** for Splotch — a signed `.aab`
ready to upload to the Google Play Console. This assumes a version has already
been cut with `/release` (which bumps `package.json`, `android/build.gradle`,
and generates the store changelog). If the version hasn't been bumped yet, tell
the user to run `/release` first.

Signing comes from `android/keystore.properties` (git-ignored). If that file is
missing, release builds come out **unsigned** — warn the user and stop, because
an unsigned `.aab` can't be uploaded.

Follow these steps:

1. **Confirm what will ship.** Read the `version` in `package.json` and the
   matching `releases/<version>.md` (for its `androidVersionCode`). Show the user
   the version + versionCode that this build will carry. If `git status` is dirty
   in a way that affects the build, mention it.

2. **Check signing is configured.** Confirm `android/keystore.properties` exists.
   If it does not, stop and tell the user to create it (the build would be
   unsigned and unpublishable).

3. **Build the signed bundle.** Run `npm run android:bundle`. This syncs the web
   build into the native project and runs `gradlew :app:bundleRelease`. It is
   slow (minutes) — let it finish. If Gradle fails, surface the error and stop.

4. **Verify the signature.** Run `npm run android:verify`. Confirm it reports the
   jar/bundle as verified. If verification fails, surface it and stop.

5. **Locate the artifact.** The bundle is at
   `android/app/build/outputs/bundle/release/app-release.aab`. Offer to open the
   folder with `npm run android:open`.

6. **Report and hand off.** Tell the user:
   - the version + versionCode of the built `.aab` and its path,
   - that signature verification passed,
   - the "What's new" text to paste into the Play Console is at
     `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt`.
   Uploading to the Google Play Console is currently a **manual** step (there is
   no Fastfile/CI lane yet) — point them to the Console and the `.aab`.
