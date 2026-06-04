---
description: Build the signed release artifacts for the current version (Android now; iOS later)
---

You are building the **release artifacts** for Splotch — the signed binaries you
upload to the app stores. This is **separate from `/release`**: `/release` bumps
the version and writes the changelog/notes; `/build` just compiles the artifacts
for whatever version is currently committed. So `/build` is normally run *after*
`/release` (or any time you want a fresh local build).

Today this builds **Android** only (a signed `.aab`). iOS will be added here
later — when it is, build whichever platforms the user asks for, defaulting to
all available.

Optional argument: a platform (`android`). If omitted, build every platform
currently supported (just Android for now).

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

4. **Verify the signature.** Run `npm run android:verify` and confirm it reports
   the bundle as verified. If verification fails, surface it and stop.

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

Not set up yet. If the user asks for iOS, tell them it isn't wired up and stop.
