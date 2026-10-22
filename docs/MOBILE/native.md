<!-- cspell:ignore prerendered -->

# Splotch — React Native App: General Guide

This file covers everything **common to both native targets** (Android + iOS): how the native build
works, what runs offline vs. online, storage, the privacy/data posture stores ask about, the shared
store-listing assets, and cross-platform follow-ups. For platform-specific build/test/release steps
see **[android.md](android.md)** and **[ios.md](ios.md)**.

> Both platforms are active: the React Native `android/` and `ios/` projects live in `.`. Android
> development works on macOS or Linux; iOS builds require macOS + Xcode.

The store release builds the React Native app in `.`, under the shipping identity `art.splotch.app`
(the `android:*` and `ios:*` release scripts in [android.md](android.md#react-native-store-build)
and [ios.md](ios.md#react-native-store-build)). Physical-device development builds use
`art.splotch.app.dev`; the deploy smoke also has an explicit store-identity emulator/simulator
build. Its `DEVELOPMENT.md` covers development builds and how to check a JS-only change on a device
without a native rebuild.

## 1. How the native build works

Splotch is one Expo / React Native / React Strict DOM app (ADR-0182). Metro resolves platform files
at build time. Android uses Gradle and iOS uses CocoaPods plus xcodebuild; neither embeds a
SvelteKit export or runs a web server. Netlify separately builds the RN web export with
`npm run build:site` and serves the API through `netlify/functions/api.ts`.

### Offline vs. online

Drawing, the bundled Farm book and local picture saving work without a network. AI generation,
feedback and downloading additional books require the hosted service. The platform owners live in
`src/platform/`; the drawing and offline-library modules own their respective state. No
compatibility or data migration from the Capacitor app is provided.

### Storage and native modules

Platform adapters own settings, picture saving, orientation and credentials. The native AI bridge is
`SplotchAIEnvironment`: its typed adapter is `src/platform/ai.ts`, with Swift and Kotlin
implementations under the app's native projects. It validates native replies and uses device secure
storage for credentials. The web adapter owns browser storage separately.

Read the app's `DEVELOPMENT.md` before changing native module registration or deploying a local
build. Native source changes require a native rebuild. Physical device builds use
`art.splotch.app.dev`; store identity is opt-in through the release scripts.

### Data & privacy posture (important for store forms)

The reviewed machine-readable declaration is `tools/mobile/privacy-permission-inventory.json`.
Tools-tier drift guards compare it with the native manifests, store data categories, retention
constants, production outbound call sites, and `/privacy`; store forms remain human-submitted from
the platform checklists.

* **No analytics, tracking, ads, accounts, or advertising/analytics/tracking SDKs.** The native
  dependency set is Expo / React Native plus functional modules for drawing, device APIs, media
  saving, networking, orientation and downloads.
* Deliberate data-out features are a **drawing image**, chosen style, and generation credential sent
  for AI generation; a confirmed AI report; and private feedback. Nothing is sold or used for
  tracking. Ordinary AI jobs are temporary within Splotch: collected jobs are deleted immediately;
  uncollected jobs expire after 20 minutes and an hourly cleanup removes them. OpenAI separately
  normally keeps an abuse-monitoring copy for up to 30 days, subject to the exceptions in its
  published policy.
* While free AI is enabled, the app automatically checks its server-authoritative ten-creation
  allowance with a one-way installation pseudonym derived from the platform app/vendor identifier.
  The server stores the pseudonym with allowance attempts, successes, failures, timestamps, and
  short-lived reservations. Access-code and own-key requests also create operational generation
  metadata; the full key and drawing are excluded.
* A confirmed AI report retains the input, server-resolved prompt, style, and timestamp privately
  until a daily purge after its 30-day retention date; a refusal report also retains the provider's
  signed refusal reason, and a picture report retains the generated output. Optional feedback device
  details are private. Coloring-pack requests contain only public static asset paths and normal host
  request details, not a drawing or child identity.
* Photos are saved **locally**: iOS uses add-only photo access; Android 10+ writes shared
  `Pictures/Splotch` through MediaStore. Android 7–9 uses public Pictures when legacy storage is
  permitted, otherwise an app-specific media directory. The latter is removed on uninstall; do not
  promise uninstall survival for that fallback. The RN save owner is `src/platform/photoLibrary.ts`.

## 2. Native projects

The Capacitor sync pipeline (`build:cap`, `cap:sync`) is gone with the Capacitor projects; the React
Native app in `.` builds its own native projects (see [android.md](android.md) and
[ios.md](ios.md)). Its launcher, splash, and launch-screen files are committed under its `android/`
and `ios/` projects, and the themed Android launcher artwork is the 108dp VectorDrawable
`assets/icon-monochrome.xml` traced from the smiling S in `assets/icon.png`.

## 3. Store listing assets & copywriting (both stores)

Everything lives in **`store-assets/`** (see its README for sizes and regeneration notes) and is
framed from committed captures and artwork:

* [x] **Copywriting** — Google Play fields in `store-assets/STORE-LISTING-ANDROID.md`; App Store
      fields (name, subtitle, promo text, keywords, categories, privacy label) in
      `store-assets/STORE-LISTING-IOS.md`.
* [x] **Screenshots, both stores** — `npm run gen:store-assets` frames committed drawing captures
      into Play phone/tablet and App Store iPhone 6.9" / iPad 13" compositions at the required pixel
      sizes, plus the Play feature graphic. It does not drive the live RN app. A UI change requires
      deliberately refreshed captures before reframing; retained Svelte-era captures are historical
      source material, not evidence of the changed RN UI.
* [x] **Play app icon** 512×512 (`store-assets/icon-512.png`); the App Store icon ships inside the
      binary's asset catalog (no separate upload).
* [x] **Release notes / "What's new"** — generated per release from `releases/<version>.md` into
      `fastlane/metadata/` and the bundled `/changelog` page (`npm run gen:releases`).
* [ ] (Optional) short promo video.

> Keep screenshots text-light and kid-friendly, and only show the generic coloring books (no
> trademarked packs) — see `store-assets/README.md`.

## 4. Kids / Families compliance (shared posture)

Because the audience is children, **both** stores apply stricter rules. Splotch never collects a
drawing in the background, but it does automatically check the free AI allowance and download
enabled coloring packs. Those requests and its deliberate AI/support flows need exact disclosure.
The per-store attestations live with each platform's release checklist:

* Google Play — Families policy → **[android.md](android.md)**
* Apple App Store — Kids Category → **[ios.md](ios.md)**

The shared baseline both depend on:

* **No ad SDKs / no analytics SDKs** ship (Splotch has none — keep it that way).
* **COPPA / GDPR-K**: Splotch requests no child's name, account, email, or location. The consoles
  still require exact disclosure of the optional drawings, feedback, report evidence, and device
  snapshot described above.
* Don't request permissions you don't use.

### Legal / privacy artifacts (required by both stores)

* [x] **Privacy Policy** page — created at `/privacy` (the RN privacy content and its source
      metadata in `src/lib/privacy/contents.ts`), live at `https://splotch.art/privacy` and bundled
      into both native apps. ← required by both stores. Contact is through Splotch's private
      feedback form. RN opens `/feedback` inside the app and submits through the hosted API;
      destinations that leave the app use the external-link gate. The native privacy copy excludes
      the web-only conditional email fallback. The policy must state: no background drawing
      collection, ads, tracking, or third-party analytics; explain the automatic allowance and
      coloring-pack requests, ordinary ephemeral AI processing, private feedback, and the
      confirmed-report-only 30-day retention rule.
* [ ] (Optional) **Terms of Use**.
* [x] Wording for the **photo-library add** permission prompt: iOS
      `NSPhotoLibraryAddUsageDescription` is set in `ios/Splotch/Info.plist` and guarded by the
      privacy-permission inventory; the Android runtime prompt is system-worded.

## 5. Known follow-ups / nice-to-haves (cross-platform)

* [ ] **Final hi-res app icon** (placeholder is upscaled from 512px) — produce a crisp **1024×1024**
      source at `assets/icon.png` (and tune `assets/splash.png`), then replace the launcher icons
      and splash in both native projects.
* [ ] **AI access token on native**: today a parent types the invite code in Settings. Consider
      **deep links** (Android App Links / iOS Universal Links) so an `?ai_access_token=…` invite
      link opens the app and applies the token automatically. The old follow-ups proposing Capacitor
      splash/keep-awake plugins retired with that shell. Expo owns the native capabilities; new work
      should name an observed RN behavior before adding a module.

## 6. Native support matrix

This is a release-time compatibility matrix, not a UI journey matrix. Every automated row installs
the React Native app's Release build under the store identity, `art.splotch.app`, and runs the one
boot-and-paint assertion in `.maestro/smoke.yaml` (ADR-0120): the drawing screen's `Settings` button
paints. Phone/tablet layout and orientation behavior stay in the other test tiers. The automated
rows run on `v*` tags and can be started from `workflow_dispatch`. There is no periodic `schedule`
trigger: on-demand dispatch is the preflight and reproduction path, while the iOS floor row is
completed manually for each release. Pull requests that touch the app get the build half without the
device: the `Native compile` workflow builds the Android Release APK and the iOS Release simulator
app.

Before publishing signed artifacts, confirm all four rows for that tag:

| Coverage        | Target and check                                                                                                                                                      | Result and diagnostic evidence                                                                                                                                                                                                                                                               | Evidence owner                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Android current | Current Android API 33 on a throwaway `google_apis` / `x86_64` emulator; install the test-signed store-identity Release APK and wait for `Settings` to paint          | The `Maestro launch smoke test (API 33)` job status is the result. Its log identifies the API/image/architecture and install; `maestro-report-api-33` contains the Maestro flow log and screenshot.                                                                                          | GitHub Actions owns the run, job log, and artifact.                                                    |
| Android floor   | Android API 24 on the same emulator/image shape; install the same Release APK and run the same first-paint assertion                                                  | The `Maestro launch smoke test (API 24)` job status is the result. Its log identifies the API/image/architecture and install; `maestro-report-api-24` contains the Maestro flow log and screenshot.                                                                                          | GitHub Actions owns the run, job log, and artifact.                                                    |
| iOS current     | Newest installed iPhone simulator on `macos-latest`; build the store-identity Release simulator app without signing, then install it and wait for `Settings` to paint | The `Maestro launch smoke test (iOS simulator)` job status is the result. Maestro's log names the selected iPhone, its runtime and UDID; `maestro-ios-report` contains the Maestro flow log and screenshot.                                                                                  | GitHub Actions owns the run, job log, and artifact.                                                    |
| iOS floor       | iOS 16.4 on a named iPhone simulator or physical device; follow the [manual iOS 16.4 floor gate](ios.md#manual-ios-164-floor-gate)                                    | The GitHub Release notes state the exact OS version, simulator/device, and pass result. No Maestro artifact is expected: hosted 16.4 runs can build and boot the simulator, but Maestro 2.4.0 fails before it can observe the app; `docs/COMPATIBILITY.md` owns that infeasibility evidence. | The release operator owns the Release-notes entry before `publish-artifacts` attaches signed binaries. |

When an automated gate is red on a tag, that platform's deploy workflow files or updates its
platform-specific failure issue. A manual dispatch does not file an issue because its dispatcher
already owns the run; use the named job log and report artifact directly. The Android matrix derives
both API levels from code owners rather than YAML literals, and `docs/COMPATIBILITY.md` remains the
canonical ledger for what each row proves and what it leaves uncovered.

## 7. Uploading builds to the stores

> **Both uploads are currently manual.** The npm pipeline ends at producing the signed binary;
> getting it to the store is a hands-on step today.

* **Android** — `npm run android:bundle` → `app-release.aab`, then upload it in the **Play Console
  web UI** (drag the `.aab` into a release on a track).
* **iOS** — `npm run ios:ipa` → `Splotch.ipa`, then drag it into the **Transporter** app (free, Mac
  App Store) and hit Deliver. (Xcode → Organizer → Distribute App is the GUI alternative.)

For a solo project shipping infrequently this is fine — you're already in both consoles doing the
listing/compliance work, and the GUIs give the clearest validation feedback. Automate only when the
manual step starts to hurt.

### Upload automation

ADR-0182 chooses plain native build scripts and manual upload. The `fastlane/metadata/` directory
holds listing copy and changelogs; it is not an installed fastlane workflow. EAS and fastlane upload
automation are outside the release path.
