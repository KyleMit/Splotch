---
name: mobile
description: Capacitor native app guide — Android/iOS toolchain setup (macOS + Windows), build/sign/run commands, on-device testing, Chrome remote profiling, and the store release & kids-compliance checklists. Use before touching anything Android, iOS, or Capacitor related.
---

<!-- cspell:ignore prerendered keytool IARC temurin libexec gradlew andro xcodebuild simctl xcarchive pbxproj xcconfig -->

# Splotch — Native App (Capacitor) Guide & Release Checklist

This document tracks everything needed to ship Splotch as native **Android** and
**iOS** apps via [Capacitor](https://capacitorjs.com/). The web app
(splotch.art) is unchanged and still deploys to Netlify; the native apps bundle
the same code as a static, offline-first shell.

> Both platforms are active: the `android/` and `ios/` projects live in the
> repo. Android development works on Windows or macOS; iOS builds require
> macOS + Xcode (§2). Store status: Android in §3, iOS in §6.

## 1. How the native build works

Splotch is a SvelteKit app. For the web it builds with `adapter-netlify` (SSR +
the `/api/generate-image` serverless function + the `/admin` console). The
native apps can't run a server, so they build a **fully static** export instead:

* **`CAPACITOR=true vite build`** swaps in `adapter-static` (see
  `svelte.config.js`) and skips the PWA service worker (see `vite.config.js`).
* Output goes to **`build/`**, which Capacitor copies into the native projects
  (`webDir` in `capacitor.config.json`).
* The server-only routes (`/api`, `/admin`, `/dev`) are excluded from the bundle
  (`strict: false`). The home page is prerendered to `index.html`; `200.html` is
  the SPA fallback.
* The admin console is still reachable on device: the bundle includes a
  prerendered `/admin/native`, a static page that manages the same access tokens through
  the hosted `/api/admin/*` endpoints (bearer-session auth, stored in the
  Keychain/Keystore — see the `api` skill). The About-tab admin link points
  there on native.

### Offline vs. online

The **core engine is 100% offline**: canvas, colors, stroke widths, eraser,
sounds, coloring books, screenshots — all bundled on-device (fonts via
`@fontsource-variable/quicksand`, sounds in `static/sounds`, coloring pages in
`static/coloring`). No network needed.

The **only** online feature is the **AI "magic image" button**. On native it
calls the hosted endpoint `https://splotch.art/api/generate-image`
(`__NATIVE_API_BASE__`, injected at build time in `vite.config.js`). When the
device is offline the AI button is **hidden** automatically
(`src/lib/state/network.svelte.js` + `@capacitor/network`).

### Storage

`src/lib/storage.js` is dual-layer:

* Synchronous **localStorage** for fast reads (web + native WebView).
* On native, every write is also mirrored to **Capacitor Preferences** (durable
  `UserDefaults`/`SharedPreferences`). On launch, `hydrateDurableStorage()`
  restores any settings the WebView may have evicted. The web is unaffected.

### Data & privacy posture (important for store forms)

* **No analytics, no tracking, no ads, no accounts, no third-party SDKs.**
* The only data that ever leaves the device is the **drawing image** the user
  explicitly sends to the AI endpoint (plus an invite token). Nothing is sold or
  used for tracking. The endpoint logs token usage for abuse prevention only.
* Photos are saved **locally** to the device gallery (a "Splotch" album).

## 2. Developer workflow

### Prerequisites (macOS)


1. **Install Android Studio** (brings the SDK, `adb`, and the emulator):

   <https://developer.android.com/studio>

   Launch it once and complete the setup wizard — it installs the SDK to
   `~/Library/Android/sdk`, including `platform-tools` (`adb`).

2. **Install a full JDK 21** — Capacitor 8 plugins need a Java 21 toolchain
   (Android Studio's bundled JBR is too old and isn't a full JDK):

   ```bash
   brew install --cask temurin@21
   ```

3. **Wire up the shell environment** — add to `~/.zshrc`, then open a new
   terminal:

   ```bash
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
   export JAVA_HOME="$(/usr/libexec/java_home -v 21)"
   ```

   In Android Studio, also set Settings → Build, Execution, Deployment → Build
   Tools → Gradle → **Gradle JDK** to JDK 21 (or "JAVA_HOME"), or in-IDE builds
   will fail.

4. **Connect a device**: on the phone enable **Developer options** (tap *Build
   number* 7× in *About phone*) → **USB debugging → ON**, plug in via USB,
   accept the "Allow USB debugging?" prompt, then verify:

   ```bash
   npm run adb:devices   # should list the phone as "device", not "unauthorized"
   ```

   For an emulator instead: run `npm run android:setup` after installing
   Command-line Tools (see below) — it installs the API 33 system image and
   creates the `Pixel_7_Pro_API_33` AVD automatically.

5. **Run the app** — two flows:
   * **Web dev server over USB** (fastest iteration): `npm run dev`, then
     `npm run adb:reverse`, then open `http://localhost:5173` in Chrome on the
     phone. See "Running the web app on a real Android device" below.
   * **Native debug build**: the `android:apk`/`android:run`/`android:bundle`
     scripts invoke `.\gradlew` and are **Windows-only**. On macOS run Gradle
     directly:

     ```bash
     npm run cap:sync
     cd android && ./gradlew :app:installDebug
     ```

     or use Capacitor's cross-platform runner: `npx cap run android`.

6. **Debug with Chrome DevTools**: on desktop Chrome open
   `chrome://inspect/#devices` and click **Inspect** on the phone's tab — see
   "Performance profiling with Chrome DevTools" below for the full flow.

#### iOS toolchain (macOS-only)

1. **Install full Xcode** from the Mac App Store (the Command Line Tools alone
   are **not** enough — no `xcodebuild`, no simulators). After installing,
   point the developer tools at it and accept the license:

   ```bash
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   sudo xcodebuild -license accept
   xcodebuild -version   # should print Xcode 16.x or newer
   ```

   Launch Xcode once so it installs an iOS platform/simulator runtime (or run
   `xcodebuild -downloadPlatform iOS`).

2. **No CocoaPods needed.** The iOS project uses **Swift Package Manager**
   (`ios/App/CapApp-SPM/Package.swift`, regenerated by `cap sync`) — no Ruby,
   no `pod install`. Xcode resolves the packages automatically on first open.

3. **Open and run**: `npm run cap:ios` opens the project in Xcode; pick a
   simulator and **Run ▶**. Or skip Xcode entirely: `npm run ios:run` builds,
   installs, and launches via the Capacitor CLI (it prompts for a target).

4. **Real device**: requires a (free or paid) Apple Developer account signed
   into Xcode and a Team selected under **App target → Signing &
   Capabilities** (see §6 — `DEVELOPMENT_TEAM` is not committed). A free
   account can run on your own device; distributing needs the paid program.

5. **Debug with Safari Web Inspector** (the iOS equivalent of
   `chrome://inspect`): Safari → Settings → Advanced → "Show features for web
   developers", then **Develop → \<device/simulator\> → Splotch**.

### Prerequisites (Windows OS)


* [x] **Android Studio** + Android SDK installed (SDK at
  `%LOCALAPPDATA%\Android\Sdk`; platforms 34 & 36, build-tools 34/35, `adb`,
  emulator, several AVDs).
* [x] **Node 22** (via nvm-windows) — Capacitor 8 requires Node ≥ 22. The repo's
  default node was 18; run `nvm use 22.11.0` in an **elevated** terminal once to
  make 22 the persistent default (the symlink swap needs admin).
* [x] **Android SDK `platform-tools` on PATH** — Android Studio installs `adb`
  at `%LOCALAPPDATA%\Android\Sdk\platform-tools` but does not add it to PATH
  automatically. Add it once (user scope, new terminal required to take effect):
  ```powershell
  [Environment]::SetEnvironmentVariable(
    "Path",
    [Environment]::GetEnvironmentVariable("Path","User") + ";$env:LOCALAPPDATA\Android\Sdk\platform-tools",
    "User"
  )
  ```
* [x] **Full JDK 21** at `%USERPROFILE%\.jdks\jdk-21.0.11+10` — Capacitor 8
  plugins need a Java **21** toolchain, and Android Studio's bundled JBR is only
  17. `JAVA_HOME` (user scope) points here. NOTE: it must be a *full* JDK (with
  `jlink`/`jmods`); a JetBrains JBR will fail AGP's `JdkImageTransform`.
  - In **Android Studio**: Settings → Build → Build Tools → Gradle → set
    **Gradle JDK** to this JDK 21 (or "JAVA_HOME"), else in-IDE builds fail.
* iOS cannot be built on Windows — Xcode and the simulators are macOS-only.
  (No CocoaPods anywhere: the iOS project uses Swift Package Manager.)

### Commands

**Web-asset / sync commands:**

```bash
npm run build:cap     # static build into build/ (CAPACITOR=true, via cross-env)
npm run cap:sync      # build:cap + copy web assets & plugins into native projects
npm run cap:android   # cap:sync + open the Android project in Android Studio
npm run cap:ios       # cap:sync + open the iOS project in Xcode (macOS-only)
```

**Android build/sign commands** (each runs `cap:sync` first, then Gradle):

```bash
npm run android:apk     # debug APK  -> android/app/build/outputs/apk/debug/app-debug.apk
npm run android:run     # build + install the debug app onto the connected device/emulator
npm run android:bundle  # SIGNED release AAB (see Signing below for the prerequisite)
npm run android:clean   # gradle clean (no cap:sync)
```

> **Prerequisites for the `android:*` scripts** (one-time, see §2 prereqs):
> 1. **Node 22** active (`nvm use 22.11.0` — needs an elevated shell to stick).
> 2. **`JAVA_HOME`** pointing at the **full JDK 21** — Gradle reads it. It's set
>    at user scope, so a freshly-opened terminal already has it (an *already-open*
>    terminal from before setup won't — reopen it).
> 3. For `android:bundle`, `android/keystore.properties` must exist (see Signing).
>
> **Why `.\gradlew` in the scripts?** This machine has
> `NoDefaultCurrentDirectoryInExePath=1`, so `cmd.exe` (npm's shell) won't run a
> bare `gradlew` from the current dir — the explicit `.\` is required. These
> scripts are therefore Windows-oriented; on macOS/Linux run `./gradlew` directly
> from `android/`.

From Android Studio: **Run ▶** to test on emulator/device; **Build → Generate
Signed Bundle/APK** to produce a release `.aab`.

**iOS build/run commands** (macOS-only; each runs `cap:sync` first except
`ios:live`/`ios:clean`):

```bash
npm run ios:run       # build, install, and launch on a simulator or device (cap CLI)
npm run ios:build     # debug .app for the simulator -> ios/App/build/Build/Products/Debug-iphonesimulator/
npm run ios:live      # live reload against the dev server on port 5173 (pair with dev:cap)
npm run ios:archive   # signed release archive -> ios/App/build/App.xcarchive
npm run ios:ipa       # ios:archive + export the App Store .ipa -> ios/App/build/ipa/
npm run ios:clean     # xcodebuild clean
npm run test:ios      # smoke test: boots a simulator, builds + installs, runs Maestro, tears down
```

`ios:archive`/`ios:ipa` need a signing team configured (§6); `ios:build`,
`ios:run` on a simulator, and `test:ios` need no signing at all. The `.ipa`
export settings live in `ios/App/ExportOptions.plist` (App Store Connect
method, automatic signing).

Regenerate launcher icons / splash after changing artwork in `assets/`:

```bash
npx @capacitor/assets generate --android
npx @capacitor/assets generate --ios
```

### Running the web app on a real Android device

Two options depending on what you want to test:

**Option A — Web dev server (fastest iteration, real touch input)**

Useful when you want to test or profile the web build without a full Capacitor
sync. The phone's browser hits your local dev server over USB.

1. Start the dev server: `npm run dev`
2. Connect the phone via USB and run:
   ```bash
   npm run adb:reverse
   ```
   This forwards the phone's port 5173 to the desktop's dev server
   (`adb reverse tcp:5173 tcp:5173`), so `http://localhost:5173` on the phone
   resolves to your machine. The dev server port is pinned to 5173 in
   `vite.config.ts` so this script is always correct.
3. Open Chrome on the phone and navigate to `http://localhost:5173`.

Re-run `npm run adb:reverse` after each USB reconnect.

If port 5173 is already in use from a stale dev server, kill it first:
```bash
npm run dev:kill
```

**Option B — Install the debug APK (tests the Capacitor shell)**

```bash
npm run android:run
```

This does a full `cap:sync` + Gradle build + ADB install. Use this when testing
Capacitor plugins, storage, or the offline AI flow — not needed for canvas/perf
work.

---

### Performance profiling with Chrome DevTools (remote debugging)

Remote debugging lets you run Chrome DevTools on your desktop while drawing on
the phone with real multi-touch input — the best way to get accurate profiles.

#### One-time setup

1. On the Android device: **Settings → Developer options → USB debugging → ON**.
   (Enable Developer options by tapping *Build number* 7 times in *About phone*.)
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
3. Find your device and the open tab, then click **Inspect**. A DevTools window
   opens, connected to the phone's Chrome instance.
4. In DevTools, open the **Performance** panel.
5. Click **Record** (⏺), draw on the phone for 10–15 seconds (use multi-touch
   freely — this captures real finger input), then click **Stop**.
6. Export the trace: click the **⋮** menu → **Save profile…** → save as `.json`.

## 3. Android release checklist

### App configuration (mostly done — verify)

* [x] App ID `art.splotch.app`, name **Splotch** (`capacitor.config.json`,
  `android/app/build.gradle`, `strings.xml`).
* [x] Permissions declared: `INTERNET`, `ACCESS_NETWORK_STATE`,
  `WRITE_EXTERNAL_STORAGE` (maxSdk 28 only) — `AndroidManifest.xml`.
* [x] Placeholder launcher icons + splash generated from the logo.
* [ ] **Replace placeholder icons with final hi-res art.** Current icons are
  upscaled from the 512px web logo — produce a crisp **1024×1024** source at
  `assets/icon.png` (and tune `assets/splash.png`), then rerun
  `npx @capacitor/assets generate --android`.
* [ ] Bump `versionCode` / `versionName` in `android/app/build.gradle` for each
  release (currently `1` / `1.0`).
* [ ] Confirm `targetSdkVersion` meets the current Play requirement (review
  `android/variables.gradle`).
* [ ] Test the AI flow on a real device: enter an access code in Parent Center,
  verify the image round-trips against `https://splotch.art`.
* [ ] Test offline: enable airplane mode → AI button disappears, everything else
  works.
* [ ] Test "save to gallery" → confirm a **Splotch** album with the PNG, and
  that the photo-add permission prompt reads sensibly.

### Signing & bundling

* [x] **Signing is wired up:** `android/app/build.gradle` reads creds from
  `android/keystore.properties` (git-ignored; `.gitignore` updated, template at
  `android/keystore.properties.example`). Without that file, release builds are
  unsigned; with it, `bundleRelease` is signed automatically.
* [x] **Upload keystore created** at `android/upload-keystore.jks` (alias
  `upload`, RSA 2048, ~valid to 2053), and `android/keystore.properties` is filled
  in. Both are git-ignored. **Store the `.jks` + passwords in a password manager —
  losing them means you can't update the app.**
  - To recreate from scratch: from `android/`,
    ```bash
    keytool -genkeypair -v -keystore upload-keystore.jks -alias upload \
      -keyalg RSA -keysize 2048 -validity 10000
    ```
    then `cp keystore.properties.example keystore.properties` and fill it in.
  - ⚠️ In `keystore.properties`, do **not** wrap values in quotes — Java
    `.properties` treats quotes as literal characters, so a quoted password fails
    with *"keystore password was incorrect"*.
* [ ] Enroll in **Play App Signing** (recommended) when creating the app.
* [x] **Produce a signed release `.aab`:** `npm run android:bundle`
  → `android/app/build/outputs/bundle/release/app-release.aab` (Play requires AAB).
  Verify it's signed with `npm run android:verify` (expect `jar verified`; the
  self-signed / no-timestamp warnings are normal for an upload key).

### Google Play Console setup

* [ ] Create a **Google Play Developer account** ($25 one-time). Allow time for
  identity verification (can take days).
* [ ] Create the app; choose **App** (not Game), **Free**.
* [ ] Complete **Data safety** form: declare **no data collected/shared**, *or*
  if you count the AI upload, declare "Photos" → used for **App functionality**,
  **not** shared, **not** for tracking, processed at user request. Be precise —
  this is legally binding.
* [ ] Complete **Content rating** questionnaire (IARC) → should land at
  *Everyone*.
* [ ] **Target audience & content**: select **Children** age bands → this opts
  you into the **Families policy** (see §5).
* [x] Privacy Policy URL → `https://splotch.art/privacy` (see §5).
* [ ] Store listing copy + graphics (see §4).
* [ ] Set up **Closed testing** track first; promote to Production after review.

## 4. Store listing assets & copywriting

Everything lives in **`store-assets/`** (see its README for sizes and
regeneration notes) and is generated from the real app where possible:

* [x] **Copywriting** — Google Play fields in `store-assets/STORE-LISTING.md`;
  App Store fields (name, subtitle, promo text, keywords, categories, privacy
  label) in `store-assets/APP-STORE-LISTING.md`.
* [x] **Screenshots, both stores** — `npm run gen:shots` drives the app in
  headless Chromium and captures Play phone/tablet sets **and** App Store
  iPhone 6.9" / iPad 13" sets at the exact required pixel sizes, plus the Play
  feature graphic. Re-run after meaningful UI changes.
* [x] **Play app icon** 512×512 (`store-assets/icon-512.png`); the App Store
  icon ships inside the binary's asset catalog (no separate upload).
* [x] **Release notes / "What's new"** — generated per release from
  `releases/<version>.md` into `fastlane/metadata/` (`npm run gen:releases`).
* [ ] (Optional) short promo video.

> Keep screenshots text-light and kid-friendly, and only show the generic
> coloring books (no trademarked packs) — see `store-assets/README.md`.

## 5. Kids / Families compliance (the extra hurdles)

Because the audience is children, **both** stores apply stricter rules. Even
though Splotch collects nothing, you must still *prove* it.

### Google Play — Families policy

* [ ] Opt into **Designed for Families** / declare a child audience in *Target
  audience & content*.
* [ ] **Privacy Policy is mandatory** even with zero data collection. Host one
  at a stable URL (e.g. `https://splotch.art/privacy`). It must state: no
  personal data collected, no ads, no tracking, no third-party analytics;
  explain the optional AI feature (drawing sent to the AI service only when the
  child/parent taps the button) and that it isn't used to identify anyone.
* [ ] Ensure **no ad SDKs / no analytics SDKs** ship (Splotch has none — keep it
  that way).
* [ ] **COPPA / GDPR-K**: confirm compliance. No personal info from under-13s is
  collected, so this is straightforward, but the Console will ask you to attest.
* [ ] If you want the **"Teacher Approved"** badge, you can opt into review
  (optional).
* [ ] Account/permission hygiene: don't request permissions you don't use (we
  only request network state + legacy storage).

### Apple App Store — Kids Category

* [ ] Use the **Kids Category** (optional but fitting; age band **5 & Under**).
  Kids Category apps **must not** include third-party analytics/advertising and
  must gate any external links / purchases behind a **parental gate**.
* [ ] **Privacy Nutrition Label** ("App Privacy") in App Store Connect — declare
  data types. The AI image upload = "User Content" used for app functionality,
  not linked to identity, not for tracking. Exact declarations are written out
  in `store-assets/APP-STORE-LISTING.md`.
* [x] Privacy Policy URL (same one — `https://splotch.art/privacy`).
* [ ] Note: the AI button is an external network feature — confirm it doesn't
  need a parental gate (it sends the child's own drawing for processing; no
  external browsing/links). Re-check against current Kids Category rules.
* [ ] Audit outbound links (About tab / Parent Center → GitHub, privacy policy):
  Kids Category requires external links to sit behind a parental gate. The
  Parent Center itself may qualify as the gate — verify against the current
  guideline 1.3 wording before submitting.

### Legal / privacy artifacts to produce

* [x] **Privacy Policy** page — created at `/privacy`
  (`src/routes/privacy/+page.svelte`), live at `https://splotch.art/privacy`.
  ← required by both stores. Contact is via GitHub issues (no email).
* [ ] (Optional) **Terms of Use**.
* [x] Wording for the **photo-library add** permission prompt: iOS
  `NSPhotoLibraryAddUsageDescription` is set in `ios/App/App/Info.plist`
  ("Splotch saves the drawings you take a photo of to your photo library.");
  the Android runtime prompt is system-worded.

## 6. iOS release checklist

### App configuration (done — verify on first device run)

* [x] **`ios/` project committed** (`npx cap add ios`, Capacitor 8) using
  **Swift Package Manager** — plugins resolve via
  `ios/App/CapApp-SPM/Package.swift`, which `cap sync` regenerates. No
  CocoaPods (ADR-0020).
* [x] Bundle ID `art.splotch.app`, display name **Splotch**
  (`ios/App/App.xcodeproj`, `Info.plist`).
* [x] Version `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` match Android's
  `versionName`/`versionCode` — `scripts/release.mjs` bumps both via
  `capacitor-set-version`; never edit them by hand.
* [x] `NSPhotoLibraryAddUsageDescription` in `Info.plist` (gallery save uses
  iOS add-only photo permission — the code never reads the library on iOS).
* [x] `ITSAppUsesNonExemptEncryption = false` in `Info.plist` (HTTPS only), so
  TestFlight uploads skip the export-compliance question.
* [x] Icons + splash generated from `assets/` (`npx @capacitor/assets generate
  --ios`); the 1024×1024 `AppIcon` doubles as the App Store icon.
* [ ] Test on a real iPhone/iPad: AI flow (access code → image round-trip
  against `https://splotch.art`), offline airplane mode (AI button hides),
  save-to-photos (add-only permission prompt wording), Guided Access tips in
  the Parent Center read correctly for iOS.

### Apple Developer account (one-time)

1. Create/choose an **Apple Account** with two-factor auth enabled.
2. Enroll in the **Apple Developer Program** at
   <https://developer.apple.com/programs/enroll/> — $99/yr. Enroll as an
   **individual** (the app lists under your legal name) unless you have a
   DUNS-registered organization. Identity verification can take a few days.
3. Sign into Xcode (**Settings → Accounts → +**) with that account, then in
   `ios/App/App.xcodeproj` → App target → **Signing & Capabilities**: check
   *Automatically manage signing* and pick your Team. `DEVELOPMENT_TEAM` is a
   personal value — leave it out of commits (it's fine locally; don't commit
   the pbxproj diff that adds it).
4. Accept the agreements in App Store Connect
   (<https://appstoreconnect.apple.com> → Business) — uploads fail with a
   cryptic error until the Paid/Free Apps agreement is accepted.

> Signing is **automatic** (Xcode-managed certificates + profiles) — there is
> no iOS equivalent of `keystore.properties` to back up; Apple holds the
> distribution certificate and can revoke/reissue it. Losing the account ≠
> losing the app.

### Build & upload

* [ ] `npm run ios:ipa` → `ios/App/build/ipa/App.ipa` (archives with
  `-allowProvisioningUpdates`, exports per `ios/App/ExportOptions.plist`).
* [ ] Upload: drag the `.ipa` into Apple's **Transporter** app (Mac App
  Store), or use Xcode → Window → Organizer → Distribute App. (CLI
  alternative: `xcrun altool`/`notarytool` are deprecated for apps — use
  `xcodebuild -exportArchive` + Transporter.)
* [ ] First upload creates nothing by itself — create the app record first in
  App Store Connect: **My Apps → + → New App**, platform iOS, bundle ID
  `art.splotch.app`, SKU `splotch`.

### App Store Connect setup

* [ ] Listing fields + screenshots: copy/paste from
  `store-assets/APP-STORE-LISTING.md`, upload
  `store-assets/screenshots/iphone69/` and `ipad13/`.
* [ ] **App Privacy** nutrition label (declarations written out in
  `APP-STORE-LISTING.md`); privacy policy URL `https://splotch.art/privacy`.
* [ ] **Age rating** questionnaire → 4+; opt into **Kids Category, 5 & Under**
  (see §5 for the extra rules this triggers).
* [ ] **TestFlight**: internal testing needs no review; invite yourself, smoke
  the production build on hardware.
* [ ] Submit for **App Review**. Kids Category review is stricter and slower —
  in *App Review notes*, explain the Parent Center and the parent-enabled,
  bring-your-own-key AI feature up front.

## 7. Known follow-ups / nice-to-haves

* [ ] **Final hi-res app icon** (placeholder is upscaled from 512px).
* [ ] **AI access token on native**: today a parent types the invite code in the
  Parent Center. Consider **deep links** (Android App Links / iOS Universal
  Links) so an `?ai_access_token=…` invite link opens the app and applies the
  token automatically.
* [ ] Consider `@capacitor/status-bar` + `@capacitor/splash-screen` for finer
  control over the status bar color and splash dismissal timing.
* [ ] Consider `@capacitor/app` to handle the Android hardware back button
  (currently it will try to navigate/exit by default).
* [ ] Verify the **Wake Lock** behavior inside the WebView on real devices; if
  unreliable, add a native keep-awake plugin.
