<!-- cspell:ignore prerendered -->

# Splotch — Native App (Capacitor): General Guide

This file covers everything **common to both native targets** (Android + iOS): how the static build
works, what runs offline vs. online, storage, the privacy/data posture stores ask about, the shared
store-listing assets, and cross-platform follow-ups. For platform-specific build/test/release steps
see **[android.md](android.md)** and **[ios.md](ios.md)**.

> Both platforms are active: the `android/` and `ios/` projects live in the repo. Android
> development works on macOS or Linux; iOS builds require macOS + Xcode.

## 1. How the native build works

Splotch is a SvelteKit app. For the web it builds with `adapter-netlify` (SSR + the
`/api/generate-image` serverless function + the `/admin` console). The native apps can't run a
server, so they build a **fully static** export instead:

* **`CAPACITOR=true vite build`** swaps in `adapter-static` (see `web/svelte.config.js`) and skips
  the PWA service worker (see `web/vite.config.ts`).
* Output goes to **`build/`**, which Capacitor copies into the native projects (`webDir` in
  `capacitor.config.json`).
* The server-only routes (`/api`, `/admin`, `/dev`) are excluded from the bundle (`strict: false`).
  The home page is prerendered to `index.html`; `200.html` is the SPA fallback.
* The admin console is **web-only** and has no native counterpart. It is also unlinked from the app
  on every platform — reached by typing `/admin`. A hidden in-app gesture that reveals a
  token-minting console is exactly the shape Play's Deceptive Behavior policy and App Review 2.3.1
  are written against, and worse in an app declared for a children's audience.
* Routes that must not reach the bundle at all are listed in `web/nativeExcludedRoutes.ts`, whose
  Vite plugin blanks their module source at build time; `tools/mobile/check-static-bundle.mjs` scans
  the built output and fails `build:cap` if a forbidden host or web-only boot-service marker
  survives. A route's `prerender` flag alone drops only its HTML — the JS chunk, and every string in
  it, still ships.

### Offline vs. online

The **core engine is 100% offline**: canvas, colors, stroke widths, eraser, sounds, the Farm starter
coloring book, and screenshots are bundled on-device. No network is needed to draw or use anything
already installed.

Two background features use the network. The **AI "magic image" button** calls the hosted endpoint
`https://splotch.art/api/generate-image` (`__NATIVE_API_BASE__`, injected at build time in
`web/vite.config.ts`). When the device is offline the AI button is **hidden** automatically
(`web/src/lib/state/network.svelte.ts` + `@capacitor/network`). When Coloring Book is enabled, the
seven non-starter books download automatically, one complete verified book at a time (ADR-0103).
Turning it off cancels active background work without deleting completed packs. Compact screens
receive 1,152 px overlays/fills and canonical 400 px thumbnails; larger or denser screens receive
the canonical tier. Android WorkManager stores the selected bytes under `noBackupFilesDir`; iOS
background `URLSession` stores them in Application Support with backup exclusion. The picker exposes
a book only after its install marker is written.

### Storage

`web/src/lib/storage.ts` is dual-layer:

* Synchronous **localStorage** for fast reads (web + native WebView).
* On native, every write is also mirrored to **Capacitor Preferences** (durable
  `UserDefaults`/`SharedPreferences`). On launch, `hydrateDurableStorage()` restores any settings
  the WebView may have evicted. The web is unaffected.

### Loading native plugins (read before adding one)

Two rules, both load-bearing:

**1. Gate every plugin code path on the literal `__IS_CAPACITOR__`** (usually
`__IS_CAPACITOR__ && isNative()`). `isNative()` alone is a runtime check Rollup can't tree-shake
across modules, so without the compile-time literal the plugin chunks ship in the web bundle and get
precached by the service worker. In a component (function scope), inline the `import()` inside the
gated branch; in a shared `.ts` module, use `lazyPluginModule()` with the ternary below — Rollup
retains a module-level thunk even when every caller is dead code, so the `import()` itself must sit
behind the literal.

**2. Destructure the plugin out of the module namespace *after* awaiting:**

```ts
const getPrefs = lazyPluginModule(() =>
  __IS_CAPACITOR__
    ? import('@capacitor/preferences')
    : Promise.reject(new Error('native-only plugin'))
);
const { Preferences } = await getPrefs();
```

Never let a Promise resolve to the plugin object itself (e.g.
`import('…').then((m) => m.Preferences)` or `async () => (await import('…')).Preferences`). A
registered plugin is a Proxy whose every property — `then` included — is a native-method call, so
it's "thenable": promise assimilation invokes `plugin.then(resolve, reject)`, Capacitor dispatches a
native method named `then` ("not implemented"), and it **never settles**. The awaiting promise hangs
forever. This silently blanked a since-removed native page whose render gated on an awaited plugin
load, until the loaders were funnelled through `lazyPluginModule`. A gated inline
`import('…').then(({ Plugin }) => …)` in a component is equally safe — it resolves to the module
namespace, never the proxy.

### Custom native plugins

When no published plugin exposes a native capability, add a small **local** plugin in the app target
itself (see `DeviceLock`, ADR-0027, and `ColoringPacks`, ADR-0103):

* iOS — the key gotcha: **Capacitor 8 does not auto-discover plugin classes.**
  `CapacitorBridge.registerPlugins()` only loads its built-ins plus the `packageClassList` that
  `cap sync` writes into `capacitor.config.json` from installed **npm plugin packages**. An
  app-local class is never in that list, so it must be registered by hand — otherwise every call
  fails with `"<name>" plugin is not implemented on ios` (our JS catches this and silently reads
  "unlocked"). Two files, both added to the App target's Compile Sources:
  * `DeviceLockPlugin.swift` — an `@objc(...)` class conforming to `CAPPlugin` **and**
    `CAPBridgedPlugin` (provide `identifier`, `jsName`, `pluginMethods` in Swift;
    `registerPluginInstance` casts to `CAPPlugin & CAPBridgedPlugin`, so the conformance is
    required).
  * `MainViewController.swift` — subclass `CAPBridgeViewController` and override
    `capacitorDidLoad()` to call `bridge?.registerPluginInstance(DeviceLockPlugin())`. Then point
    the root VC at it in `ios/App/App/Base.lproj/Main.storyboard`
    (`customClass="MainViewController" customModule="App" customModuleProvider="target"`).
    `capacitorDidLoad()` runs right after the bridge is created, before the web view loads.
  * Do **not** use the legacy Obj-C `CAP_PLUGIN` macro `.m` for an app-local plugin — its
    category-based conformance is unreliable in the app target and is moot anyway, since discovery
    is by explicit registration, not runtime enumeration.
  * Both Swift files need `project.pbxproj` entries (`PBXBuildFile`, `PBXFileReference`, App
    `PBXGroup` children, `PBXSourcesBuildPhase`) — the App target uses classic Xcode file
    references, not synchronized groups, and `cap sync` won't add them. Mirror `AppDelegate.swift`.
    No `Package.swift` edit (SPM, ADR-0020).
* Android — a `@CapacitorPlugin` class in `android/app/src/main/java/art/splotch/app/`
  (`DeviceLockPlugin.java`), registered via `registerPlugin(...)` **before** `super.onCreate` in
  `MainActivity`.
* JS side — a typed `registerPlugin(...)` facade with a `web` fallback
  (`web/src/lib/plugins/deviceLock.ts`), loaded through `lazyPluginModule()`.

A second local plugin, **`PencilEraser`** (ADR-0028, iOS-only), shows the **event-emitting** variant
and how to **attach a UIKit interaction to the web view**: the Apple Pencil double-tap
(`UIPencilInteraction`) never reaches the WebView, so `PencilEraserPlugin.swift` conforms to
`UIPencilInteractionDelegate`, and `MainViewController.capacitorDidLoad()` both
`registerPluginInstance`s it **and** calls `attach(to: bridge?.webView)` to install the interaction
(hold the instance strongly — `UIPencilInteraction.delegate` is weak). It has empty `pluginMethods`
and instead `notifyListeners("doubleTap", …)`; the JS facade (`web/src/lib/plugins/pencilEraser.ts`)
subscribes with `addListener` and exports `initPencilEraser()`, which `DrawingCanvas.svelte`
lazy-starts only when `isNative()` so `@capacitor/core` never loads on web. The web fallback's
`addListener` is inert. The feature is on by default but parent-disablable: the listener's
`handleDoubleTap()` sets a sticky `applePencilSeen` flag (lazy detection — there's no web API to
query pencil pairing) and only toggles when `pencilEraserEnabled` is on; Settings shows that toggle
only `{#if settings.applePencilSeen}` so it appears solely on pencil-capable devices.

Adding native plugin code needs a **fresh native build** (`android:run` / `ios:run`); `cap:sync`
alone won't compile/register the new Swift/Java classes.

### Screen orientation

The Settings rotation toggle (`lockRotationEnabled` + `forceLandscapeOrientation`) is applied by
`web/src/lib/platform/orientation.ts`. On native it locks via **`@capacitor/screen-orientation`**,
which calls Android's `Activity.setRequestedOrientation` — this **overrides the OS Auto-Rotate
setting**, so the parent's choice is honored even on a device with rotation turned off. The Web
Screen Orientation API (the web fallback) can't do this: it only chooses an orientation within what
the OS already permits, so with Auto-Rotate off it silently no-ops. The branch is keyed on
`isNative()` (ADR-0013). Adding/removing this plugin requires a fresh native build — `cap:sync`
alone won't register it.

### Data & privacy posture (important for store forms)

The reviewed machine-readable declaration is `tools/mobile/privacy-permission-inventory.json`.
Tools-tier drift guards compare it with the native manifests, store data categories, retention
constants, production outbound call sites, and `/privacy`; store forms remain human-submitted from
the platform checklists.

* **No analytics, tracking, ads, accounts, or advertising/analytics/tracking SDKs.** The native
  dependency set is Capacitor plus functional plugins for device APIs, storage, media saving,
  networking, screen orientation, and coloring-pack downloads.
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
* Photos are saved **locally** to the device gallery (a "Splotch" album).

## 2. Shared web-asset / sync commands

These produce the static web bundle and copy it into both native projects; the platform-specific
Gradle/Xcode commands build on top of them (see the platform files).

```bash
npm run build:cap     # static build into build/ (CAPACITOR=true)
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

Everything lives in **`store-assets/`** (see its README for sizes and regeneration notes) and is
generated from the real app where possible:

* [x] **Copywriting** — Google Play fields in `store-assets/STORE-LISTING-ANDROID.md`; App Store
      fields (name, subtitle, promo text, keywords, categories, privacy label) in
      `store-assets/STORE-LISTING-IOS.md`.
* [x] **Screenshots, both stores** — `npm run gen:store-assets` drives the app in headless Chromium
      and captures Play phone/tablet sets **and** App Store iPhone 6.9" / iPad 13" sets at the exact
      required pixel sizes, plus the Play feature graphic. Re-run after meaningful UI changes.
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

* [x] **Privacy Policy** page — created at `/privacy` (`web/src/routes/privacy/+page.svelte`), live
      at `https://splotch.art/privacy` and bundled into both native apps. ← required by both stores.
      Contact is through Splotch's private feedback form. Native opens the hosted form behind the
      external-link gate because the static app cannot run the form's server action; the hosted
      page's conditional email fallback is excluded from the native bundle. The policy must state:
      no background drawing collection, ads, tracking, or third-party analytics; explain the
      automatic allowance and coloring-pack requests, ordinary ephemeral AI processing, private
      feedback, and the confirmed-report-only 30-day retention rule.
* [ ] (Optional) **Terms of Use**.
* [x] Wording for the **photo-library add** permission prompt: iOS
      `NSPhotoLibraryAddUsageDescription` is set in `ios/App/App/Info.plist` and guarded by the
      privacy-permission inventory; the Android runtime prompt is system-worded.

## 5. Known follow-ups / nice-to-haves (cross-platform)

* [ ] **Final hi-res app icon** (placeholder is upscaled from 512px) — produce a crisp **1024×1024**
      source at `assets/icon.png` (and tune `assets/splash.png`), then rerun
      `npx @capacitor/assets generate` for both platforms.
* [ ] **AI access token on native**: today a parent types the invite code in Settings. Consider
      **deep links** (Android App Links / iOS Universal Links) so an `?ai_access_token=…` invite
      link opens the app and applies the token automatically.
* [ ] Consider `@capacitor/status-bar` + `@capacitor/splash-screen` for finer control over the
      status bar color and splash dismissal timing.
* [ ] Verify the **Wake Lock** behavior inside the WebView on real devices; if unreliable, add a
      native keep-awake plugin.
* [ ] (Android) `@capacitor/app` to handle the hardware back button — see
      **[android.md](android.md)**.

## 6. Uploading builds to the stores

> **Both uploads are currently manual.** The npm pipeline ends at producing the signed binary;
> getting it to the store is a hands-on step today.

* **Android** — `npm run android:bundle` → `app-release.aab`, then upload it in the **Play Console
  web UI** (drag the `.aab` into a release on a track). `npm run android:open` reveals the output
  folder.
* **iOS** — `npm run ios:ipa` → `App.ipa`, then drag it into the **Transporter** app (free, Mac App
  Store) and hit Deliver. `npm run ios:open` reveals the output folder. (Xcode → Organizer →
  Distribute App is the GUI alternative.)

For a solo project shipping infrequently this is fine — you're already in both consoles doing the
listing/compliance work, and the GUIs give the clearest validation feedback. Automate only when the
manual step starts to hurt.

### Future: fastlane (the intended automation path)

The repo is already **fastlane-shaped**: `fastlane/metadata/` holds the store copy and per-release
changelogs in fastlane's exact format, generated by `npm run gen:releases` (see §3). What's missing
is the upload wiring — there is **no `Fastfile`/`Appfile` yet**, so nothing actually runs fastlane.
fastlane is the natural finish because one tool uploads **both** platforms *and* pushes that
already-generated metadata in the same run; bespoke `altool`/service-account scripts would bypass
the metadata pipeline that's already in place.

When release cadence justifies automating, set it up roughly as:

1. **Install** fastlane (a `Gemfile` + `bundle add fastlane`, or `brew install
   fastlane`).
2. **`fastlane/Appfile`** — iOS bundle ID `art.splotch.app`, the Android package name, and the path
   to the Google Play service-account JSON.
3. **`fastlane/Fastfile`** with two lanes:
   * **iOS** — build via the existing `npm run ios:ipa`, then `upload_to_app_store` (deliver) to
     push `App.ipa` **plus** `fastlane/metadata/en-US/`.
   * **Android** — build via `npm run android:bundle`, then `upload_to_play_store` (supply) to push
     `app-release.aab` **plus** `fastlane/metadata/android/en-US/`.
4. **Credentials** (gitignored, same posture as `ios/local.xcconfig` and
   `android/keystore.properties`):
   * iOS — an **App Store Connect API key** (`.p8` + Key ID + Issuer ID), App Manager role.
   * Android — a **Google Cloud service-account JSON**, granted release permission in Play Console →
     Users & permissions.
5. **npm scripts** per ADR-0019 — `ios:publish` / `android:publish` (build + upload), each with a
   matching `scripts-info` entry, routed through a `tools/` Node helper where shell specifics are
   involved.

Because the metadata folders are already in fastlane format, deliver/supply consume them directly —
don't duplicate that copy step.
