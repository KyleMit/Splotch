<!-- cspell:ignore prerendered -->

# Splotch — Native App (Capacitor): General Guide

This file covers everything **common to both native targets** (Android + iOS):
how the static build works, what runs offline vs. online, storage, the
privacy/data posture stores ask about, the shared store-listing assets, and
cross-platform follow-ups. For platform-specific build/test/release steps see
**[android.md](android.md)** and **[ios.md](ios.md)**.

> Both platforms are active: the `android/` and `ios/` projects live in the
> repo. Android development works on Windows or macOS; iOS builds require
> macOS + Xcode.

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

### Screen orientation

The parent-center rotation toggle (`lockRotationEnabled` +
`forceLandscapeOrientation`) is applied by `src/lib/orientation.ts`. On native it
locks via **`@capacitor/screen-orientation`**, which calls Android's
`Activity.setRequestedOrientation` — this **overrides the OS Auto-Rotate setting**,
so the parent's choice is honored even on a device with rotation turned off. The
Web Screen Orientation API (the web fallback) can't do this: it only chooses an
orientation within what the OS already permits, so with Auto-Rotate off it
silently no-ops. The branch is keyed on `isNative()` (ADR-0013). Adding/removing
this plugin requires a fresh native build — `cap:sync` alone won't register it.

### Data & privacy posture (important for store forms)

* **No analytics, no tracking, no ads, no accounts, no third-party SDKs.**
* The only data that ever leaves the device is the **drawing image** the user
  explicitly sends to the AI endpoint (plus an invite token). Nothing is sold or
  used for tracking. The endpoint logs token usage for abuse prevention only.
* Photos are saved **locally** to the device gallery (a "Splotch" album).

## 2. Shared web-asset / sync commands

These produce the static web bundle and copy it into both native projects; the
platform-specific Gradle/Xcode commands build on top of them (see the platform
files).

```bash
npm run build:cap     # static build into build/ (CAPACITOR=true, via cross-env)
npm run cap:sync      # build:cap + copy web assets & plugins into native projects
npm run cap:android   # cap:sync + open the Android project in Android Studio
npm run cap:ios       # cap:sync + open the iOS project in Xcode (macOS-only)
```

Regenerate launcher icons / splash after changing artwork in `assets/`:

```bash
npx @capacitor/assets generate --android
npx @capacitor/assets generate --ios
```

## 3. Store listing assets & copywriting (both stores)

Everything lives in **`store-assets/`** (see its README for sizes and
regeneration notes) and is generated from the real app where possible:

* [x] **Copywriting** — Google Play fields in
  `store-assets/STORE-LISTING-ANDROID.md`; App Store fields (name, subtitle,
  promo text, keywords, categories, privacy label) in
  `store-assets/STORE-LISTING-IOS.md`.
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

## 4. Kids / Families compliance (shared posture)

Because the audience is children, **both** stores apply stricter rules. Even
though Splotch collects nothing, you must still *prove* it. The per-store
attestations live with each platform's release checklist:

* Google Play — Families policy → **[android.md](android.md)**
* Apple App Store — Kids Category → **[ios.md](ios.md)**

The shared baseline both depend on:

* **No ad SDKs / no analytics SDKs** ship (Splotch has none — keep it that way).
* **COPPA / GDPR-K**: no personal info from under-13s is collected, so
  compliance is straightforward, but both consoles ask you to attest.
* Don't request permissions you don't use.

### Legal / privacy artifacts (required by both stores)

* [x] **Privacy Policy** page — created at `/privacy`
  (`src/routes/privacy/+page.svelte`), live at `https://splotch.art/privacy`.
  ← required by both stores. Contact is via GitHub issues (no email). It must
  state: no personal data collected, no ads, no tracking, no third-party
  analytics; explain the optional AI feature (drawing sent to the AI service
  only when the child/parent taps the button) and that it isn't used to
  identify anyone.
* [ ] (Optional) **Terms of Use**.
* [x] Wording for the **photo-library add** permission prompt: iOS
  `NSPhotoLibraryAddUsageDescription` is set in `ios/App/App/Info.plist`
  ("Splotch can save a screenshot of your drawing to your photo library.");
  the Android runtime prompt is system-worded.

## 5. Known follow-ups / nice-to-haves (cross-platform)

* [ ] **Final hi-res app icon** (placeholder is upscaled from 512px) — produce a
  crisp **1024×1024** source at `assets/icon.png` (and tune `assets/splash.png`),
  then rerun `npx @capacitor/assets generate` for both platforms.
* [ ] **AI access token on native**: today a parent types the invite code in the
  Parent Center. Consider **deep links** (Android App Links / iOS Universal
  Links) so an `?ai_access_token=…` invite link opens the app and applies the
  token automatically.
* [ ] Consider `@capacitor/status-bar` + `@capacitor/splash-screen` for finer
  control over the status bar color and splash dismissal timing.
* [ ] Verify the **Wake Lock** behavior inside the WebView on real devices; if
  unreliable, add a native keep-awake plugin.
* [ ] (Android) `@capacitor/app` to handle the hardware back button — see
  **[android.md](android.md)**.

## 6. Uploading builds to the stores

> **Both uploads are currently manual.** The npm pipeline ends at producing the
> signed binary; getting it to the store is a hands-on step today.

* **Android** — `npm run android:bundle` → `app-release.aab`, then upload it in
  the **Play Console web UI** (drag the `.aab` into a release on a track).
  `npm run android:open` reveals the output folder.
* **iOS** — `npm run ios:ipa` → `App.ipa`, then drag it into the **Transporter**
  app (free, Mac App Store) and hit Deliver. `npm run ios:open` reveals the
  output folder. (Xcode → Organizer → Distribute App is the GUI alternative.)

For a solo project shipping infrequently this is fine — you're already in both
consoles doing the listing/compliance work, and the GUIs give the clearest
validation feedback. Automate only when the manual step starts to hurt.

### Future: fastlane (the intended automation path)

The repo is already **fastlane-shaped**: `fastlane/metadata/` holds the store
copy and per-release changelogs in fastlane's exact format, generated by
`npm run gen:releases` (see §3). What's missing is the upload wiring — there is
**no `Fastfile`/`Appfile` yet**, so nothing actually runs fastlane. fastlane is
the natural finish because one tool uploads **both** platforms *and* pushes that
already-generated metadata in the same run; bespoke `altool`/service-account
scripts would bypass the metadata pipeline that's already in place.

When release cadence justifies automating, set it up roughly as:

1. **Install** fastlane (a `Gemfile` + `bundle add fastlane`, or `brew install
   fastlane`).
2. **`fastlane/Appfile`** — iOS bundle ID `art.splotch.app`, the Android package
   name, and the path to the Google Play service-account JSON.
3. **`fastlane/Fastfile`** with two lanes:
   * **iOS** — build via the existing `npm run ios:ipa`, then
     `upload_to_app_store` (deliver) to push `App.ipa` **plus**
     `fastlane/metadata/en-US/`.
   * **Android** — build via `npm run android:bundle`, then
     `upload_to_play_store` (supply) to push `app-release.aab` **plus**
     `fastlane/metadata/android/en-US/`.
4. **Credentials** (gitignored, same posture as `ios/local.xcconfig` and
   `android/keystore.properties`):
   * iOS — an **App Store Connect API key** (`.p8` + Key ID + Issuer ID), App
     Manager role.
   * Android — a **Google Cloud service-account JSON**, granted release
     permission in Play Console → Users & permissions.
5. **npm scripts** per ADR-0019 — `ios:publish` / `android:publish` (build +
   upload), each with a matching `scripts-info` entry, routed through a
   `scripts/` Node helper where shell specifics are involved.

Because the metadata folders are already in fastlane format, deliver/supply
consume them directly — don't duplicate that copy step.
