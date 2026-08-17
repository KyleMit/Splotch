<!-- cspell:ignore keytool IARC temurin libexec gradlew andro -->

# Splotch — Android: Setup, Build, Test & Release

Android-specific toolchain, build/sign/run commands, on-device testing, Chrome remote profiling, and
the Google Play release checklist. For the general build model and shared assets see
**[native.md](native.md)**; iOS lives in **[ios.md](ios.md)**.

> Minimum supported OS: **Android 7.0 / API 24** (`minSdkVersion` in `android/variables.gradle`).
> This is safely older than the web floor because the System WebView updates via Play independently
> of the OS — see [docs/COMPATIBILITY.md](../COMPATIBILITY.md).

## 1. Toolchain setup

### macOS

1. **Install Android Studio** (brings the SDK, `adb`, and the emulator):

   <https://developer.android.com/studio>

   Launch it once and complete the setup wizard — it installs the SDK to `~/Library/Android/sdk`,
   including `platform-tools` (`adb`).

2. **Install a full JDK 21** — Capacitor 8 plugins need a Java 21 toolchain (Android Studio's
   bundled JBR is too old and isn't a full JDK):

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
   * **Web dev server over USB** (fastest iteration): `npm run dev`, then `npm run adb:reverse`,
     then open `http://localhost:5173` in Chrome on the phone. See "Running the web app on a real
     device" below.
   * **Native debug build**: `npm run android:run` (cap:sync + build + install) — the `android:*`
     scripts go through `tools/mobile/android/run-gradle.mjs`, which resolves the Gradle wrapper and
     runs it from `android/` (ADR-0017). You can also use Capacitor's runner: `npx cap run android`.

6. **Debug with Chrome DevTools**: on desktop Chrome open `chrome://inspect/#devices` and click
   **Inspect** on the phone's tab — see "Performance profiling with Chrome DevTools" below for the
   full flow.

### Linux

* **Android SDK** installed (via Android Studio or the standalone command-line tools; default
  `~/Android/Sdk`, override with `ANDROID_HOME`), with `platform-tools` and `emulator` on `PATH`.
* **Node ≥ 22** (Capacitor 8 requires it).
* **Full JDK 21** on `PATH` with `JAVA_HOME` set — Capacitor 8 plugins need a Java 21 toolchain, and
  it must be a *full* JDK (with `jlink`/`jmods`), not a JetBrains JBR, or AGP's `JdkImageTransform`
  fails.

`npm run android:setup` handles the emulator image, AVD, and Maestro on both macOS and Linux.

## 2. Build / sign / run commands

Each runs `cap:sync` first (the shared web build — see [native.md](native.md)), then Gradle:

```bash
npm run android:apk     # debug APK  -> android/app/build/outputs/apk/debug/app-debug.apk
npm run android:apk:release # release APK -> android/app/build/outputs/apk/release/app-release.apk
npm run android:run     # build + install the debug app onto the connected device/emulator
npm run android:bundle  # SIGNED release AAB (see §4 Signing for the prerequisite)
npm run android:clean   # gradle clean (no cap:sync)
```

> **Prerequisites for the `android:*` scripts** (one-time, see §1):
>
> 1. **Node ≥ 22** active (Capacitor 8 requires it).
> 2. **`JAVA_HOME`** pointing at the **full JDK 21** — Gradle reads it (set it in your shell profile
>    per §1; reopen a terminal that was open before you set it).
> 3. For a signed `android:apk:release` or `android:bundle`, `android/keystore.properties` must
>    exist (see §4). Without it, Gradle still compiles the Release configuration but leaves the
>    artifact unsigned.
>
> These scripts run the Gradle wrapper through `tools/mobile/android/run-gradle.mjs`, which resolves
> the wrapper to an absolute path and runs it from `android/` (ADR-0017), so `npm run android:*`
> needs no inline `cd android && ./gradlew` dance.

From Android Studio: **Run ▶** to test on emulator/device; **Build → Generate Signed Bundle/APK** to
produce a release `.aab`.

### Running the web app on a real device

Two options depending on what you want to test:

**Option A — Web dev server (fastest iteration, real touch input)**

Useful when you want to test or profile the web build without a full Capacitor sync. The phone's
browser hits your local dev server over USB.

1. Start the dev server: `npm run dev`
2. Connect the phone via USB and run:
   ```bash
   npm run adb:reverse
   ```
   This forwards the phone's port 5173 to the desktop's dev server
   (`adb reverse tcp:5173 tcp:5173`), so `http://localhost:5173` on the phone resolves to your
   machine. The dev server port is pinned to 5173 in `web/vite.config.ts` so this script is always
   correct.
3. Open Chrome on the phone and navigate to `http://localhost:5173`.

Re-run `npm run adb:reverse` after each USB reconnect.

If port 5173 is already in use from a stale dev server, kill it first:

```bash
npm run dev:stop
```

**Option B — Install the debug APK (tests the Capacitor shell)**

```bash
npm run android:run
```

This does a full `cap:sync` + Gradle build + ADB install. Use this when testing Capacitor plugins,
storage, or the offline AI flow — not needed for canvas/perf work.

#### Troubleshooting `android:run`

* **`adb: more than one device/emulator`** (or Gradle installs onto the wrong target) — you have
  both a physical phone and an emulator connected. Set `ANDROID_SERIAL` to the phone's serial (from
  `npm run adb:devices`) so adb and Gradle agree on the target, e.g. `npm run android:run:device`,
  which pins the serial. Closing the emulator also resolves it.
* **`INSTALL_FAILED_UPDATE_INCOMPATIBLE: … signatures do not match`** — a copy of `art.splotch.app`
  is already installed that was signed with a *different* key (a Play Store build, or a debug build
  from another machine — each machine's debug keystore is unique). Android won't overwrite across
  signing keys. Uninstall the old copy first, then reinstall:
  ```bash
  adb -s <serial> uninstall art.splotch.app   # <serial> from adb:devices
  npm run android:run:device
  ```
  ⚠️ Uninstalling wipes that app's local data (drawings, saved settings, stored access code).
  Harmless on a throwaway test device; warn the user if it's their real phone.

To preview the dev server on a phone that isn't on your local network, use an outbound tunnel.
Off-cloud, any quick tunnel works (e.g. `cloudflared tunnel
--url http://localhost:5173`, or
`ngrok http 5173`). From a Claude Code cloud session the egress is a TLS-terminating, HTTP-only MITM
gateway and those tools fail — the working path is a self-hosted chisel reverse tunnel. See
**[docs/CLOUD/Claude.md](../CLOUD/Claude.md)** and
**[ADR-0021](../adrs/0021-cloud-session-tunneling.md)**.

## 3. Testing

* **Native smoke test**: `npm run test:android` boots an emulator, builds + installs, and runs the
  Maestro flow. See the `testing` skill for Maestro installation and the full three-tier strategy.
* **Release configuration**: the tagged deploy workflow creates a disposable test key, builds
  `android:apk:release`, and boots that APK through the same Maestro flow. This exercises R8,
  `proguard-android-optimize.txt`, and resource shrinking without putting the Play upload key in CI.

### Performance profiling with Chrome DevTools (remote debugging)

> For an **automated** capture + report (drives a scripted session and writes a machine-readable
> profile), use `npm run perf:android` — see the `profiling` skill (ADR-0032). The manual flow below
> is for interactive, free-form profiling.

Remote debugging lets you run Chrome DevTools on your desktop while drawing on the phone with real
multi-touch input — the best way to get accurate profiles.

#### One-time setup

1. On the Android device: **Settings → Developer options → USB debugging → ON**. (Enable Developer
   options by tapping *Build number* 7 times in *About phone*.)
2. Connect via USB; accept the "Allow USB debugging?" prompt on the device.
3. Choose "USB Tethering" as the USB connection mode
4. Verify ADB sees the device:
   ```bash
   npm run adb:devices
   ```
   The device should show as `device` (not `unauthorized`).

#### Recording a profile

1. Start the app on the phone (Option A or B above).
2. On the desktop, open Chrome and navigate to `chrome://inspect/#devices`.
3. Find your device and the open tab, then click **Inspect**. A DevTools window opens, connected to
   the phone's Chrome instance.
4. In DevTools, open the **Performance** panel.
5. Click **Record** (⏺), draw on the phone for 10–15 seconds (use multi-touch freely — this captures
   real finger input), then click **Stop**.
6. Export the trace: click the **⋮** menu → **Save profile…** → save as `.json`.

## 4. Release checklist

### App configuration (mostly done — verify)

* [x] App ID `art.splotch.app`, name **Splotch** (`capacitor.config.json`,
      `android/app/build.gradle`, `strings.xml`).
* [x] Permissions declared: `INTERNET`, `ACCESS_NETWORK_STATE`, `WRITE_EXTERNAL_STORAGE` (maxSdk 28
      only) — `AndroidManifest.xml`.
* [x] Placeholder launcher icons + splash generated from the logo.
* [ ] **Replace placeholder icons with final hi-res art.** Current icons are upscaled from the 512px
      web logo — produce a crisp **1024×1024** source at `assets/icon.png` (and tune
      `assets/splash.png`), then rerun `npx @capacitor/assets generate --android`.
* [ ] Confirm `npm run release` bumped `versionCode` / `versionName` —
      `tools/release/cut-release.mjs` (`setAndroidVersion`) derives both and writes them into
      `android/app/build.gradle`, which is the source of truth. Only a hand-built release needs them
      set manually.
* [x] `targetSdkVersion` meets the current Play requirement: `android/variables.gradle` sets **36**
      (Android 16), which satisfies the **Aug 31, 2026** deadline. Play raises this yearly — recheck
      each August against the
      [target API level policy](https://support.google.com/googleplay/android-developer/answer/11926878).
* [ ] Test the AI flow on a real device: enter an access code in Settings, verify the image
      round-trips against `https://splotch.art`.
* [ ] Test offline: enable airplane mode → AI button disappears; Farm and every previously
      downloaded coloring book still work. On a clean install only Farm is present.
* [ ] Test coloring-pack background work: on Wi-Fi, books appear one at a time; disabling Coloring
      Book cancels WorkManager but keeps completed packs, re-enabling resumes; with default
      settings, metered/Data Saver conditions pause WorkManager; Settings removal returns to Farm.
* [ ] Test "save to gallery" → confirm a **Splotch** album with the PNG, and that the photo-add
      permission prompt reads sensibly.
* [ ] Test App Pinning: pin Splotch, reopen Settings → the lock section shows a green ✓ + the unpin
      steps (via the custom `DeviceLock` plugin,
      `android/app/src/main/java/art/splotch/app/DeviceLockPlugin.java`, registered in
      `MainActivity`).

### Signing & bundling

* [x] **Signing is wired up:** `android/app/build.gradle` reads creds from
      `android/keystore.properties` (git-ignored; `.gitignore` updated, template at
      `android/keystore.properties.example`). Without that file, release builds are unsigned; with
      it, `bundleRelease` is signed automatically.
* [x] **Upload keystore created** at `android/upload-keystore.jks` (alias `upload`, RSA 2048, ~valid
      to 2053), and `android/keystore.properties` is filled in. Both are git-ignored. **Store the
      `.jks` + passwords in a password manager — losing them means you can't update the app.**
  * To recreate from scratch: from `android/`,
    ```bash
    keytool -genkeypair -v -keystore upload-keystore.jks -alias upload \
      -keyalg RSA -keysize 2048 -validity 10000
    ```
    then `cp keystore.properties.example keystore.properties` and fill it in.
  * ⚠️ In `keystore.properties`, do **not** wrap values in quotes — Java `.properties` treats quotes
    as literal characters, so a quoted password fails with *"keystore password was incorrect"*.
* [ ] Enroll in **Play App Signing** (recommended) when creating the app.
* [x] **Produce a signed release `.aab`:** `npm run android:bundle` →
      `android/app/build/outputs/bundle/release/app-release.aab` (Play requires AAB). Verify it's
      signed with `npm run android:verify` (expect `jar verified`; the self-signed / no-timestamp
      warnings are normal for an upload key).

### Google Play Console setup

* [ ] Create a **Google Play Developer account** ($25 one-time). Allow time for identity
      verification (can take days).
* [ ] Create the app; choose **App** (not Game), **Free**.
* [ ] **Register the app in Play Console** to meet the
      [Android developer verification](https://developer.android.com/developer-verification)
      requirement. ~99% of apps were auto-registered, but confirm `art.splotch.app` shows as
      registered on the Play Console Home page — an unregistered app faces **global removal from
      Play**.
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
* [ ] Set up **Closed testing** track first; promote to Production after review.

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
* [ ] Account/permission hygiene: don't request permissions you don't use (we only request network
      state + legacy storage).
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

* **Consent** — generation is never automatic; it fires only on a tap, and only after a grown-up
  supplied a credential. There are **two** unlock paths, and a Play reviewer asking how consent is
  obtained needs both:
  1. **Typed in Settings** — `AiKeyManager.svelte` verifies the input and stores it
     (`setAiAccessToken` for an access code, `setAiUserApiKey` for a BYO OpenAI key). Consent is the
     grown-up's own deliberate entry. Opening Settings is not itself a parental gate; if policy
     requires a challenge for credential entry, apply it to this operation.
  2. **An invite link** — `captureAiAccessTokenFromUrl` (`state/settings.svelte.ts:236-241`) reads
     `?ai_access_token=` on load, stores it, and rewrites the URL. The links are minted by
     `buildInvites` in `/admin` (`server/admin.ts:92-95`). Consent is still parent-mediated — an
     admin hands the link to a specific grown-up — but it is *not* a Settings interaction, so don't
     describe Settings as a gate.

  Keep both paths grown-up-initiated. Anything that unlocks generation without a credential a
  grown-up chose to supply breaks the consent story.
* **Limited use** — ordinary generation passes the drawing to OpenAI and returns the result without
  Splotch persistence. Only a grown-up's separate, gated confirmation of “Report this picture” or
  “Report this refusal” retains evidence in the private report store. Both retain the input,
  server-resolved prompt, style, and timestamp; a refusal report also retains the provider's signed
  refusal reason, and a picture report retains the output. A daily purge deletes the bundle after 30
  days. `lib/server/usage.ts` separately stores only a per-token tally and `deleteUsage` drops that
  tally when the token is revoked.
* **Disclosure** — `/privacy` names OpenAI, states the ordinary request is ephemeral, and
  distinguishes the managed key from a parent's BYO key. Two things there are easy to get wrong and
  must stay right: BYOK changes the **billing and data controller, not the routing** (the drawing
  still passes through `/api/generate-image` with the parent's key — `aiImage.ts`), and the two
  halves of OpenAI's data posture are not the same claim — API content is **not** used to train its
  models, and it **is** retained for abuse monitoring. Say both. The retention half is a window, not
  a deletion promise: the ordinary one is 30 days, but OpenAI's policy allows longer where the law
  requires it or where it is needed to prevent harm, and an image its classifier flags as potential
  CSAM is held for manual review regardless of the account's data controls. Write "normally deleted
  after 30 days", never "deleted after 30 days" — the difference matters most for exactly this app,
  whose inputs are children's drawings. The exact Data safety and AI-content answers live in
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
| Ads, analytics, advertising ID                  | No ad/analytics/attribution SDKs — Android deps are appcompat, splashscreen, and Capacitor plugins only.                             |

## 5. Known follow-ups (Android-specific)

* [ ] Consider `@capacitor/app` to handle the Android hardware back button (currently it will try to
      navigate/exit by default).

See [native.md](native.md) §5 for cross-platform follow-ups.
