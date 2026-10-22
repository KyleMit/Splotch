<!-- cspell:ignore keytool IARC temurin libexec gradlew andro -->

# Splotch — Android: Setup, Build, Test & Release

Android-specific toolchain, build/sign/run commands, on-device testing, native profiling, and the
Google Play release checklist. For the general build model and shared assets see
**[native.md](native.md)**; iOS lives in **[ios.md](ios.md)**.

> Minimum supported OS: **Android 7.0 / API 24** (`android.minSdkVersion` in
> `experiments/native-architecture/android/gradle.properties`). This governs the RN runtime and
> native modules independently of the web browser floor — see
> [docs/COMPATIBILITY.md](../COMPATIBILITY.md).

## 1. Toolchain setup

The React Native project's wrapper and SDK values live in
`experiments/native-architecture/android/gradle/wrapper/gradle-wrapper.properties` and
`experiments/native-architecture/android/gradle.properties`. Expo/React Native's Gradle plugins
resolve AGP and Kotlin; review the aligned SDK/native scripts before installing an upgrade.

Use a full JDK 21 for the repository's Android workflow. The project explicitly opts out of AGP's
built-in Kotlin and new DSL defaults because Expo's SDK template applies the Kotlin Android plugin
and old DSL. Those opt-outs are in its Gradle properties; the former Java-only Capacitor advice to
remove them is obsolete. Release enables R8 minification and resource shrinking in
`experiments/native-architecture/android/app/build.gradle`.

### macOS

1. **Install Android Studio** (brings the SDK, `adb`, and the emulator):

   <https://developer.android.com/studio>

   Launch it once and complete the setup wizard — it installs the SDK to `~/Library/Android/sdk`,
   including `platform-tools` (`adb`).

2. **Install a full JDK 21** for the repository's native build workflow:

   ```bash
   brew install --cask temurin@21
   ```

3. **Wire up the shell environment** — add to `~/.zshrc`, then open a new terminal:

   ```bash
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
   export JAVA_HOME="$(/usr/libexec/java_home -v 21)"
   ```

   In Android Studio, also set Settings → Build, Execution, Deployment → Build Tools → Gradle →
   **Gradle JDK** to JDK 21 (or "JAVA_HOME"), or in-IDE builds will fail.

4. **Connect a device**: on the phone enable **Developer options** (tap *Build number* 7× in *About
   phone*) → **USB debugging → ON**, plug in via USB, accept the "Allow USB debugging?" prompt, then
   verify:

   ```bash
   npm run adb:devices   # should list the phone as "device", not "unauthorized"
   ```

   For an emulator instead: run `npm run android:setup` after installing Command-line Tools — it
   installs the API 33 system image, creates the `Pixel_7_Pro_API_33` AVD, and installs the Maestro
   smoke-test CLI automatically. It's idempotent — re-run it any time.

5. **Run the app** — two flows:
   * **Web preview**: use a verified Netlify deploy preview for a phone browser. For local export
     inspection use the `run-splotch` skill on the development machine.
   * **Native Release build**: `npm run android:apk` builds the React Native app as
     `art.splotch.app.dev`; install on the explicitly selected device with
     `adb -s <serial> install -r`.

6. **Debug the appropriate runtime**: Chrome DevTools can inspect a phone browser tab running the
   web export. It does not inspect RN ink. Use the native development guide and `docs/PROFILING.md`
   for Metro, the Release probe and platform traces.

### Linux

* **Android SDK** installed (via Android Studio or the standalone command-line tools; default
  `~/Android/Sdk`, override with `ANDROID_HOME`), with `platform-tools` and `emulator` on `PATH`.
* **Node** satisfying the root `package.json` engine range.
* **Full JDK 21** on `PATH` with `JAVA_HOME` set; use the same toolchain locally and in CI.

`npm run android:setup` handles the emulator image, AVD, and Maestro on both macOS and Linux.

## 2. Build / sign / run commands

The scripts build the React Native app in `experiments/native-architecture`:

```bash
npm run android:apk       # art.splotch.app.dev Release APK -> experiments/native-architecture/android/app/build/outputs/apk/release/app-release.apk
npm run android:apk:store # store-identity Release APK for the deploy smoke; never install it on a device
npm run android:bundle    # SIGNED store AAB (see §4 Signing for the prerequisite)
npm run android:verify    # jarsigner check of that AAB
```

> **Prerequisites for the `android:*` build scripts** (one-time, see §1):
>
> 1. **Node ≥ 22** active.
> 2. **`JAVA_HOME`** pointing at the **full JDK 21** — Gradle reads it (set it in your shell profile
>    per §1; reopen a terminal that was open before you set it).
> 3. For `android:bundle`, `experiments/native-architecture/android/keystore.properties` must exist
>    (see §4). Without it the build fails at configuration rather than writing an unsigned bundle.

From Android Studio: **Run ▶** to test on emulator/device; **Build → Generate Signed Bundle/APK** to
produce a release `.aab`.

Before attaching a bundle, `npm run release:publish -- --only=android --dry-run` checks its embedded
release version and requires an embedded R8 mapping with compiler metadata and class mappings. A
mapping proves R8 processed the bundle; it does not independently prove every optimization setting
or a runtime performance gain. Inspect
`experiments/native-architecture/android/app/build/outputs/mapping/release/` for the effective
configuration and mapping, and install/smoke the optimized Release APK when changing AGP or keep
rules. Google Play recommendation clearance can only be checked after Play analyzes the next
uploaded bundle.

### React Native store build

The store release builds the React Native app in `experiments/native-architecture`; its store AAB is
`experiments/native-architecture/android/app/build/outputs/bundle/release/app-release.aab`.

Store identity is opt-in (ADR-0182). A Gradle build of that project is `art.splotch.app.dev`, signed
with the local debug key, unless its command line carries `-Psplotch.store=true`, and the explicit
`android:bundle` / `android:apk:store` scripts pass it; a `splotch.store` in `gradle.properties` or
the environment fails the build instead. So a Debug build, `android:apk`, and any Release build
installed for testing or device performance install beside the store copy, never over it. The store
build signs with the upload key named in
`experiments/native-architecture/android/keystore.properties` (git-ignored; template
`keystore.properties.example` beside it), whose `storeFile` points at the shipping
`android/upload-keystore.jks`: Play accepts the update only under that key. Without the file the
build fails at configuration rather than writing an unsigned bundle. The script then runs the
`jarsigner` check `android:verify` runs, and `npm run release:publish -- --only=android --dry-run`
checks the bundle's embedded app ID, version, signature block and R8 mapping.

### Running on a real device

Use the RN app's `experiments/native-architecture/DEVELOPMENT.md` for development builds and Metro
iteration. Build a `.dev` APK with `npm run android:apk` and verify its app ID before installing on
the explicitly selected device. Never replace or clear the store-installed app and its drawings. The
local web verification host uses isolated test credentials and is not a LAN or public preview.

## 3. Testing

* **Native smoke test**: `npm run test:android` builds the React Native app's `.dev` Release APK
  (`android:apk`), boots a headless emulator, installs the APK, and runs the Maestro boot check: the
  drawing screen's `Settings` button paints (ADR-0120). Locally it smokes `.dev` because a
  store-identity APK signs with whatever key `keystore.properties` names, which on a developer's
  machine is the upload key or nothing. See the `testing` skill for Maestro installation and the
  full three-tier strategy.
* **Pull requests**: the `Native compile` workflow builds the `.dev` Release APK (`android:apk`, one
  ABI) on every pull request that touches the app, so a Kotlin, C++, Gradle, R8 or JavaScript
  bundling failure fails its own PR.
* **Release configuration**: the tagged deploy workflow creates a disposable test key, builds the
  store-identity Release APK (`android:apk:store`, all four ABIs) once, uploads the APK, and boots
  that same artifact through the Maestro matrix on the current API 33 emulator and the declared API
  24 floor. This exercises R8, `proguard-android-optimize.txt`, and resource shrinking without
  putting the Play upload key in CI.

### Drawing performance

The RN app paints native ink through Skia, not a WebView. Use the app's probe and device-parity
tools described in `docs/PROFILING.md` and `tools/device-parity/README.md`. Chrome browser profiling
measures the web export; it does not measure native drawing.

## 4. Release checklist

### App configuration (mostly done — verify)

* [x] App ID `art.splotch.app`, name **Splotch**
      (`experiments/native-architecture/android/app/build.gradle`, `strings.xml`).
* [x] Permissions declared: `INTERNET`, `ACCESS_NETWORK_STATE`, `WRITE_EXTERNAL_STORAGE` (maxSdk 28
      only) — `AndroidManifest.xml`.
* [x] Placeholder launcher icons + splash generated from the logo.
* [ ] **Replace placeholder icons with final hi-res art.** Current icons are upscaled from the 512px
      web logo — produce a crisp **1024×1024** source at `assets/icon.png` (and tune
      `assets/splash.png`), then regenerate the launcher icons and splash under
      `experiments/native-architecture/android/app/src/main/res`.
* [ ] Confirm `npm run release` bumped `versionCode` / `versionName` —
      `tools/release/cut-release.mjs` (`setAndroidVersion`) derives both and writes them into the
      React Native `experiments/native-architecture/android/app/build.gradle`, which is the source
      of truth. Only a hand-built release needs them set manually.
* [ ] Confirm both Android rows in the shared
      [native support matrix](native.md#6-native-support-matrix) passed for this tag before
      publishing signed artifacts.
* [x] `targetSdkVersion` meets the current Play requirement:
      `experiments/native-architecture/android/gradle.properties` sets **36** (Android 16), which
      satisfies the **Aug 31, 2026** deadline. Play raises this yearly — recheck each August against
      the
      [target API level policy](https://support.google.com/googleplay/android-developer/answer/11926878).
* [ ] Test the AI flow on a real device: enter an access code in Settings, verify the image
      round-trips against `https://splotch.art`.
* [ ] Test offline: enable airplane mode → AI button disappears; Farm and every previously
      downloaded coloring book still work. On a clean install only Farm is present.
* [ ] Test coloring-pack background work: on Wi-Fi, books appear one at a time; disabling Coloring
      Book cancels WorkManager but keeps completed packs, re-enabling resumes; with default
      settings, metered/Data Saver conditions pause WorkManager; Settings removal returns to Farm.
* [ ] Test "save to gallery" → confirm a **Splotch** album with the PNG, stored under
      `Pictures/Splotch` (`adb shell content query --uri content://media/external/images/media`),
      and that it is still in Photos after uninstalling the app. On Android 10+ there is no
      permission prompt; on Android 7–9 the first save asks for storage access once, and after a
      denial every save still lands, without asking again, in app-specific storage that the
      uninstall removes.
* [ ] Test App Pinning: pin Splotch, reopen Settings → the lock section shows a green ✓ + the unpin
      steps (via the native device-lock module,
      `experiments/native-architecture/android/app/src/main/java/art/splotch/app/SplotchDeviceLock.kt`,
      registered in `MainApplication`).
* [ ] Test system Back, by button and by edge gesture (ADR-0165): it closes Settings, the coloring
      picker, the color picker, the AI cards, and the Grown-Ups Only check (without unlocking
      anything, and without ending a lockout); on an empty canvas it leaves Splotch; on a drawing it
      asks **Leave Splotch?**, where Back again or Keep drawing stays and Leave leaves. Returning
      shows the drawing. Also try Android 7–11, where the platform default would have finished the
      activity.

### Signing & bundling

* [x] **Signing is wired up:** the React Native
      `experiments/native-architecture/android/app/build.gradle` signs a store build
      (`-Psplotch.store=true`) with the upload key named in
      `experiments/native-architecture/android/keystore.properties` (git-ignored; template beside
      it), and refuses to configure one without that file. Every other build is
      `art.splotch.app.dev`, signed with the local debug key.
* [x] **Upload keystore created** at `android/upload-keystore.jks` (alias `upload`, RSA 2048, ~valid
      to 2053), and `android/keystore.properties` is filled in. Both are git-ignored. **Store the
      `.jks` + passwords in a password manager — losing them means you can't update the app.**
  * To recreate from scratch: from `android/` (the git-ignored folder that holds the upload key),
    ```bash
    keytool -genkeypair -v -keystore upload-keystore.jks -alias upload \
      -keyalg RSA -keysize 2048 -validity 10000
    ```
    then `cp keystore.properties.example keystore.properties` in
    `experiments/native-architecture/android/` and fill it in; its `storeFile` names this same
    keystore by its path relative to that folder.
  * ⚠️ In `keystore.properties`, do **not** wrap values in quotes — Java `.properties` treats quotes
    as literal characters, so a quoted password fails with *"keystore password was incorrect"*.
* [x] Enroll in **Play App Signing** (recommended) when creating the app. Done: Play makes it
      mandatory for apps created after August 2021 that upload an AAB, so the key Play registered
      for developer verification is the Play-held app signing key, not the upload key.
* [ ] **Produce the signed release `.aab`:** `npm run android:bundle` →
      `experiments/native-architecture/android/app/build/outputs/bundle/release/app-release.aab`
      (Play requires AAB). The script ends with the `jarsigner` check (expect `jar verified`; the
      self-signed / no-timestamp warnings are normal for an upload key).

### Google Play Console setup

* [x] Create a **Google Play Developer account** ($25 one-time). Allow time for identity
      verification (can take days). Done: the "Kyle Mit Dev" developer account exists and is
      verified.
* [x] Create the app; choose **App** (not Game), **Free**. Done: "Splotch" (`art.splotch.app`)
      exists in Play Console.
* [x] **Register the app in Play Console** to meet the
      [Android developer verification](https://developer.android.com/developer-verification)
      requirement — an unregistered app faces **global removal from Play** after 2026-09-30. Done
      2026-09-09: Play Console Home reports "All of your apps have been successfully registered",
      and *Android developer verification* lists `art.splotch.app` as **Registered** with one
      **Verified** signing-key fingerprint
      (`1A:4D:83:FF:20:35:42:B6:40:D1:EF:36:57:43:46:2B:CE:AE:4D:9D:C7:38:15:AC:85:C9:45:4A:93:6D:F5:98`).
      Re-check that page after any signing-key change, and register any new key there. Splotch is
      **distributed through Play only** — no direct `.apk`, no other store — so no additional
      package-name + key pair needs registering; the debug and CI test-signed APKs are local test
      installs, not distribution. If that ever changes, register the new pair on the same page
      before shipping (issue 1521).
* [ ] Complete **Data safety** from the exact declarations in
      `store-assets/STORE-LISTING-ANDROID.md`. “No data collected” is wrong: declare the deliberate
      AI images, private feedback, optional diagnostics, and the confirmed-report-only 30-day
      retention. Be precise — this is legally binding.
* [ ] Complete **AI-generated content**: Yes (image-to-image), in-app reporting: Yes, free-form
      prompts: No. Every output is labelled, a gated confirmation sends an actionable private
      report, and humans review within 24 hours.
* [ ] Complete **Content rating** questionnaire (IARC) from the documented facts and accept its
      calculated result. Play does **not allow unrated apps**, so this gates release rather than
      merely decorating it.
* [ ] **Target audience & content**: select **Children** age bands → this opts you into the
      **Families policy** (below).
* [x] Privacy Policy URL → `https://splotch.art/privacy` (see [native.md](native.md)).
* [ ] Store listing copy + graphics (see [native.md](native.md) §3).
* [x] Set up **Closed testing** track first; promote to Production after review. Done: "Splotch:
      Drawing for Kids" is on the Closed testing track as of 2026-09-09.

### Families policy (kids compliance)

See [native.md](native.md) §4 for the shared baseline (no ad/analytics SDKs, COPPA/GDPR-K, privacy
policy). Google Play adds:

* [ ] Opt into **Designed for Families** / declare a child audience in *Target audience & content*.
* [ ] **Privacy Policy is mandatory** even with zero data collection. Host one at a stable URL
      (`https://splotch.art/privacy`). It must disclose ordinary ephemeral AI processing, private
      feedback, and the confirmed-report-only 30-day evidence retention; no ads, tracking, or
      third-party analytics.
* [ ] **COPPA / GDPR-K**: confirm the exact shipped flows. Splotch asks for no child's name,
      account, email, or location, but deliberate AI/support content still needs disclosure.
* [ ] If you want the **"Teacher Approved"** badge, you can opt into review (optional).
* [ ] Account/permission hygiene: don't request permissions you don't use (we only request internet,
      network state, and legacy storage through Android 9).
* [x] **Backups disabled** (`android:allowBackup="false"` in the manifest): no app data — settings,
      the AI access token, or secure-storage ciphertext — is copied to Google cloud backup or
      device-to-device transfer. Drawings are unaffected (they save to the photo gallery). Keep it
      `false`; if selective backup is ever wanted, use `android:dataExtractionRules` (API 31+).

### Third-party AI integrations (User Data policy)

Play's [User Data](https://support.google.com/googleplay/android-developer/answer/10144311) policy
explicitly covers third-party AI integrations, and **the developer stays responsible** for limited
use, disclosure, and consent — the vendor running the model does not shift that. Splotch's one such
integration is `/api/generate-image` → OpenAI (ADR-0113). What keeps it compliant, and what to
re-verify if that flow changes:

* **Adult action** — generation is never automatic; it fires only on a tap. The Play build's AI
  policy defaults to a grown-up check every time. A fresh installation can make ten successful free
  creations while the project allowance is available. After that, a parent can type an access code
  or BYO OpenAI key in Settings, or receive an admin-minted invite link. Key entry and opening
  Settings are not themselves gated, but the generation action remains governed by its Parent Center
  policy. The math gate protects the action boundary; it is not proof of legal consent.
* **Limited use** — ordinary generation passes the drawing to OpenAI. Splotch holds the input and
  output only for its asynchronous job: collection deletes the job immediately; an uncollected job
  expires after 20 minutes and an hourly cleanup removes it. Only a grown-up's separate, gated
  confirmation of “Report this picture” or “Report this refusal” retains evidence in the private
  report store. Both retain the input, server-resolved prompt, style, and timestamp; a refusal
  report also retains the provider's signed refusal reason, and a picture report retains the output.
  A daily purge deletes the bundle after its 30-day retention date. `lib/server/usage.ts` separately
  stores a 30-day, HMAC-keyed access-code tally containing timestamps plus closed style/outcome
  categories, never the instruction or raw code. Its deadline does not extend with later use; a
  daily purge removes expired records, and revocation requests immediate deletion. Allowance records
  retain the installation pseudonym and attempt/success/failure accounting defined by ADR-0105.
* **Disclosure** — `/privacy` names OpenAI, states the ordinary request is ephemeral, and
  distinguishes the managed key from a parent's BYO key. Two things there are easy to get wrong and
  must stay right: BYOK changes the **billing and data controller, not the routing** (the drawing
  still passes through `/api/generate-image` with the parent's key —
  `experiments/native-architecture/src/ai/transport.ts`), and the two halves of OpenAI's data
  posture are not the same claim — API content is **not** used to train its models, and it **is**
  retained for abuse monitoring. Say both. The retention half is a window, not a deletion promise:
  the ordinary one is 30 days, but OpenAI's policy allows longer where the law requires it or where
  it is needed to prevent harm, and an image its classifier flags as potential CSAM is held for
  manual review regardless of the account's data controls. Write "normally deleted after 30 days",
  never "deleted after 30 days" — the difference matters most for exactly this app, whose inputs are
  children's drawings. The exact Data safety and AI-content answers live in
  `store-assets/STORE-LISTING-ANDROID.md`.
* **Under-18 processing** — OpenAI's under-18 API guidance asks developers serving minors for
  age-appropriate content filters, disclosures, and reporting/escalation paths, which the safety
  instruction (ADR-0023), `/privacy`, and the in-app report flow cover. It also says personal data
  of children under 13 should not be processed **without zero data retention enabled on the OpenAI
  account**, which is granted by OpenAI on request rather than configured — see ADR-0114. Until that
  is in place the 30-day abuse-monitoring window above is the accurate disclosure, so do not
  describe the flow as leaving nothing behind anywhere.

### Policies that don't apply (verified — don't re-derive)

These come up in Play policy announcements but have no Splotch surface. Re-check only if the listed
assumption breaks:

| Policy                                          | Why it's N/A                                                                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Anonymous / random chat, Child Safety Standards | No chat, social, or user-to-user features at all. Settings report form is one-way to our GitHub issue tracker.                       |
| SMS & Call Log Permissions (`READ_CALL_LOG`)    | Manifest declares only `INTERNET`, `ACCESS_NETWORK_STATE`, `WRITE_EXTERNAL_STORAGE` (maxSdk 28). No accounts, no phone verification. |
| Location disclosures                            | No location permission and no Geolocation use; `securityHeaders.ts` denies `geolocation=()` outright.                                |
| Personal Loans / Earned Wage Access             | Not a financial app.                                                                                                                 |
| Ads, analytics, advertising ID                  | No ad/analytics/attribution SDKs; the reviewed Expo/RN native dependency set is functional app tooling.                              |

## 5. Known follow-ups (Android-specific)

See [native.md](native.md) §5 for cross-platform follow-ups.
