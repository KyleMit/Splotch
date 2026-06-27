<!-- cspell:ignore keytool IARC temurin libexec gradlew andro -->

# Splotch — Android: Setup, Build, Test & Release

Android-specific toolchain, build/sign/run commands, on-device testing, Chrome
remote profiling, and the Google Play release checklist. For the general
build model and shared assets see **[native.md](native.md)**; iOS lives in
**[ios.md](ios.md)**.

> Minimum supported OS: **Android 7.0 / API 24** (`minSdkVersion` in
> `android/variables.gradle`). This is safely older than the web floor because
> the System WebView updates via Play independently of the OS — see
> [docs/COMPATIBILITY.md](../../../docs/COMPATIBILITY.md).

## 1. Toolchain setup

### macOS

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
   Command-line Tools — it installs the API 33 system image, creates the
   `Pixel_7_Pro_API_33` AVD, and (on macOS/Linux) installs the Maestro
   smoke-test CLI automatically. It's idempotent — re-run it any time.

5. **Run the app** — two flows:
   * **Web dev server over USB** (fastest iteration): `npm run dev`, then
     `npm run adb:reverse`, then open `http://localhost:5173` in Chrome on the
     phone. See "Running the web app on a real device" below.
   * **Native debug build**: `npm run android:run` (cap:sync + build + install)
     works on macOS and Windows alike — the `android:*` scripts go through
     `scripts/gradle.mjs`, which resolves the right Gradle wrapper per platform
     (ADR-0017). You can also use Capacitor's runner: `npx cap run android`.

6. **Debug with Chrome DevTools**: on desktop Chrome open
   `chrome://inspect/#devices` and click **Inspect** on the phone's tab — see
   "Performance profiling with Chrome DevTools" below for the full flow.

### Windows

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

## 2. Build / sign / run commands

Each runs `cap:sync` first (the shared web build — see [native.md](native.md)),
then Gradle:

```bash
npm run android:apk     # debug APK  -> android/app/build/outputs/apk/debug/app-debug.apk
npm run android:run     # build + install the debug app onto the connected device/emulator
npm run android:bundle  # SIGNED release AAB (see §4 Signing for the prerequisite)
npm run android:clean   # gradle clean (no cap:sync)
```

> **Prerequisites for the `android:*` scripts** (one-time, see §1):
> 1. **Node 22** active (`nvm use 22.11.0` — needs an elevated shell to stick).
> 2. **`JAVA_HOME`** pointing at the **full JDK 21** — Gradle reads it. It's set
>    at user scope, so a freshly-opened terminal already has it (an *already-open*
>    terminal from before setup won't — reopen it).
> 3. For `android:bundle`, `android/keystore.properties` must exist (see §4).
>
> These scripts run the Gradle wrapper through `scripts/gradle.mjs`, which picks
> `gradlew.bat` on Windows and `./gradlew` on macOS/Linux (ADR-0017), so the same
> `npm run android:*` command works on every platform — no `.\gradlew` vs
> `./gradlew` footgun.

From Android Studio: **Run ▶** to test on emulator/device; **Build → Generate
Signed Bundle/APK** to produce a release `.aab`.

### Running the web app on a real device

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
   `web/vite.config.ts` so this script is always correct.
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

#### Troubleshooting `android:run`

* **`adb: more than one device/emulator`** (or Gradle installs onto the wrong
  target) — you have both a physical phone and an emulator connected. Set
  `ANDROID_SERIAL` to the phone's serial (from `npm run adb:devices`) so adb and
  Gradle agree on the target, e.g. `npm run android:run:device`, which pins the
  serial. Closing the emulator also resolves it.
* **`INSTALL_FAILED_UPDATE_INCOMPATIBLE: … signatures do not match`** — a copy of
  `art.splotch.app` is already installed that was signed with a *different* key
  (a Play Store build, or a debug build from another machine — each machine's
  debug keystore is unique). Android won't overwrite across signing keys.
  Uninstall the old copy first, then reinstall:
  ```bash
  adb -s <serial> uninstall art.splotch.app   # <serial> from adb:devices
  npm run android:run:device
  ```
  ⚠️ Uninstalling wipes that app's local data (drawings, saved settings, stored
  access code). Harmless on a throwaway test device; warn the user if it's their
  real phone.

To preview the dev server on a phone that isn't on your local network, use an
outbound tunnel. Off-cloud, any quick tunnel works (e.g. `cloudflared tunnel
--url http://localhost:5173`, or `ngrok http 5173`). From a Claude Code cloud
session the egress is a TLS-terminating, HTTP-only MITM gateway and those tools
fail — the working path is a self-hosted chisel reverse tunnel. See
**[docs/CLOUD.md](../../../docs/CLOUD.md)** and
**[ADR-0021](../../../docs/adrs/0021-cloud-session-tunneling.md)**.

## 3. Testing

* **Native smoke test**: `npm run test:android` boots an emulator, builds +
  installs, and runs the Maestro flow. See the `testing` skill for Maestro
  installation and the full three-tier strategy.

### Performance profiling with Chrome DevTools (remote debugging)

> For an **automated** capture + report (drives a scripted session and writes a
> machine-readable profile), use `npm run perf:android` — see the `profiling`
> skill (ADR-0032). The manual flow below is for interactive, free-form profiling.

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

## 4. Release checklist

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
* [ ] Test App Pinning: pin Splotch, reopen the Parent Center → the lock section
  shows a green ✓ + the unpin steps (via the custom `DeviceLock` plugin,
  `android/app/src/main/java/art/splotch/app/DeviceLockPlugin.java`, registered in
  `MainActivity`).

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
  you into the **Families policy** (below).
* [x] Privacy Policy URL → `https://splotch.art/privacy` (see [native.md](native.md)).
* [ ] Store listing copy + graphics (see [native.md](native.md) §3).
* [ ] Set up **Closed testing** track first; promote to Production after review.

### Families policy (kids compliance)

See [native.md](native.md) §4 for the shared baseline (no ad/analytics SDKs,
COPPA/GDPR-K, privacy policy). Google Play adds:

* [ ] Opt into **Designed for Families** / declare a child audience in *Target
  audience & content*.
* [ ] **Privacy Policy is mandatory** even with zero data collection. Host one
  at a stable URL (`https://splotch.art/privacy`). It must state: no personal
  data collected, no ads, no tracking, no third-party analytics; explain the
  optional AI feature (drawing sent to the AI service only when the child/parent
  taps the button) and that it isn't used to identify anyone.
* [ ] **COPPA / GDPR-K**: confirm compliance. No personal info from under-13s is
  collected, so this is straightforward, but the Console will ask you to attest.
* [ ] If you want the **"Teacher Approved"** badge, you can opt into review
  (optional).
* [ ] Account/permission hygiene: don't request permissions you don't use (we
  only request network state + legacy storage).

## 5. Known follow-ups (Android-specific)

* [ ] Consider `@capacitor/app` to handle the Android hardware back button
  (currently it will try to navigate/exit by default).

See [native.md](native.md) §5 for cross-platform follow-ups.
