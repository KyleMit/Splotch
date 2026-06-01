<!-- cspell:ignore prerendered keytool IARC -->

# Splotch — Native App (Capacitor) Guide & Release Checklist

This document tracks everything needed to ship Splotch as native **Android** and
**iOS** apps via [Capacitor](https://capacitorjs.com/). The web app
(splotch.art) is unchanged and still deploys to Netlify; the native apps bundle
the same code as a static, offline-first shell.

> **Current focus: Android first, iOS after.** iOS items are listed but parked.

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

### Prerequisites (one-time)

* [ ] Install **Android Studio** (bundles the JDK + Android SDK + emulator).
  This machine currently has **no JDK/SDK/Android Studio** — install before
  building.
* [ ] In Android Studio, install an SDK Platform (API 34+) and create or attach
  a device/emulator.
* [ ] (iOS, later) macOS + **Xcode** + CocoaPods.

### Commands

```bash
npm run build:cap     # static build into build/ (CAPACITOR=true)
npm run cap:sync      # build:cap + copy web assets & plugins into native projects
npm run cap:android   # cap:sync + open the Android project in Android Studio
npm run cap:ios       # cap:sync + open the iOS project in Xcode (after add)
```

From Android Studio: **Run ▶** to test on emulator/device; **Build → Generate
Signed Bundle/APK** to produce a release `.aab`.

Regenerate launcher icons / splash after changing artwork in `assets/`:

```bash
npx @capacitor/assets generate --android   # (and --ios later)
```

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

* [ ] Create an **upload keystore** (`keytool`) and store it + passwords in a
  password manager. **Losing it means you can't update the app.**
* [ ] Configure signing in `android/app/build.gradle` (or via Android Studio).
  Keep the keystore **out of git** (add to `.gitignore`).
* [ ] Enroll in **Play App Signing** (recommended) when creating the app.
* [ ] Produce a release **`.aab`** (Android App Bundle) — Play requires AAB.

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
* [ ] Privacy Policy URL (required — see §5).
* [ ] Store listing copy + graphics (see §4).
* [ ] Set up **Closed testing** track first; promote to Production after review.

## 4. Store listing assets & copywriting (to write)

### Copywriting

* [ ] **App title** (≤30 chars), e.g. "Splotch — Drawing for Kids".
* [ ] **Short description** (≤80 chars).
* [ ] **Full description** (≤4000 chars) — emphasize: simple, ad-free, no
  tracking, works offline, made for toddlers 2+.
* [ ] Release notes / "What's new".

### Graphics (Google Play)

* [ ] **App icon** 512×512 PNG (32-bit, with alpha).
* [ ] **Feature graphic** 1024×500.
* [ ] **Phone screenshots** — min 2, 16:9 or 9:16, 320–3840px. Capture the
  drawing canvas, color picker, coloring book, AI result, parent center.
* [ ] **7" and 10" tablet screenshots** (recommended; required if you target
  tablets in Families).
* [ ] (Optional) short promo video.

> Tip: capture screenshots on an emulator or device; the in-app camera button
> saves clean PNGs. Keep them text-light and kid-friendly.

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

### Apple App Store (iOS, later)

* [ ] Use the **Kids Category** (optional but fitting). Kids Category apps **must
  not** include third-party analytics/advertising and must gate any external
  links / purchases behind a **parental gate**.
* [ ] **Privacy Nutrition Label** ("App Privacy") in App Store Connect — declare
  data types. The AI image upload = "User Content" used for app functionality,
  not linked to identity, not for tracking.
* [ ] Privacy Policy URL (same one).
* [ ] Note: the AI button is an external network feature — confirm it doesn't
  need a parental gate (it sends the child's own drawing for processing; no
  external browsing/links). Re-check against current Kids Category rules.

### Legal / privacy artifacts to produce

* [ ] **Privacy Policy** page (host on splotch.art). ← required by both stores.
* [ ] (Optional) **Terms of Use**.
* [ ] Decide the wording for the **photo-library add** permission prompt
  (iOS `NSPhotoLibraryAddUsageDescription`, Android runtime prompt).

## 6. iOS (parked — after Android ships)

* [ ] `npx cap add ios` (needs macOS + Xcode + CocoaPods).
* [ ] Set Bundle ID `art.splotch.app`, signing team, version.
* [ ] Add `NSPhotoLibraryAddUsageDescription` to `Info.plist` (gallery save).
* [ ] `npx @capacitor/assets generate --ios`.
* [ ] Apple Developer Program enrollment ($99/yr).
* [ ] App Store Connect listing, privacy label, screenshots (per device sizes).
* [ ] TestFlight beta → App Review → release.

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
