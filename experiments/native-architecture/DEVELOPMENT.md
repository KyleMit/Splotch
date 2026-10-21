# Native app development

This is the React Native (Expo) Splotch app. It is separate from the shipping Capacitor app and its
native smoke flow.

## Setup

Install JavaScript dependencies once with `pnpm install` at the repository root. The app has no
separate install step; Metro and the native builds resolve packages from the root `node_modules`.

## Checks

CI runs three checks over this app on every pull request, alongside the web app's:

* `npm run check:migration:types` type-checks this app's own TypeScript project (`tsconfig.json`),
  which `npm run check` does not reach. It runs in the Quality job.
* `npm run test:migration:rsd-selection` mounts the drawing screen's tests
  (`tools/migration/tests/rsd-native-*.test.mjs`) through the released native react-strict-dom
  renderer. It runs in the Browserless tests job.
* `npm run lint` holds `src/` to React's rules of hooks and exhaustive effect dependencies.

`tools/migration/tests/native-ci-wiring.test.mjs` fails if either command leaves its job.

## iOS

```sh
cd experiments/native-architecture/ios
pod install
```

Open `Splotch.xcworkspace` in Xcode (or use `xcodebuild -workspace Splotch.xcworkspace`) and build
the `Splotch` scheme for a simulator or device.

* **Release** embeds the JavaScript bundle and runs without Metro.
* **Debug** loads JavaScript from Metro. Start it from `experiments/native-architecture` with
  `npx expo start`, choosing a free port (`npm --silent run show:free-port`) and passing it with
  `--port`.

Both install as `art.splotch.app.dev`, beside the store app. Only the store archive
(`npm run native:ios:archive`, `docs/MOBILE/ios.md`) is `art.splotch.app`. A device build signs with
the team in the untracked `ios/local.xcconfig`; copy `ios/local.xcconfig.example` to start one.

`Pods/` and `build/` are ignored; `Podfile.lock` and the workspace are committed.

## Android

Every build is `art.splotch.app.dev`, signed with Android's local debug key, so it installs beside
the store-installed `art.splotch.app` and never over it. `npm run native:android:apk` builds the
Release APK, as does `./gradlew :app:assembleRelease` from
`experiments/native-architecture/android`:

```sh
npm run native:android:apk
adb -s <serial> install -r experiments/native-architecture/android/app/build/outputs/apk/release/app-release.apk
```

Only the store bundle (`npm run native:android:bundle`, `docs/MOBILE/android.md`) is
`art.splotch.app`; it signs with the upload key and is never installed on a device. Never touch the
store-installed `art.splotch.app`.

### Configuration changes

The drawing and its Undo history live in `MainActivity`'s React tree, so any configuration change
Android handles by recreating the activity erases them (issue 3135). `android:configChanges` in the
manifest therefore declares every change a parent can make mid-drawing: shipping's list plus
`fontScale`, `fontWeightAdjustment` (Bold text) and `layoutDirection`, which arrives with a locale
change. `tools/migration/tests/native-config-changes.test.mjs` fails if one goes missing. Font size
relays out live; Bold text applies at the next launch; a dialog open while Display size changes
keeps its old position until it reopens.

## Checking a JS-only change on a device

A change to TS or TSX alone needs no native rebuild. Build the Release app once per device as above,
then put each change's JavaScript into it with `tools/device-parity/swap-js-bundle.mjs`:

```sh
node tools/device-parity/swap-js-bundle.mjs --platform=android --base=<app-release.apk> \
  --bundle=art.splotch.app.dev --keystore=$HOME/.android/debug.keystore \
  --key-alias=androiddebugkey --ks-pass=pass:android --out=<new dir> --device=<serial>
```

It bundles and compiles the JavaScript exactly as the Release build does, in about ten seconds, and
the device keeps running a Release build, so the result holds for timing too.
`tools/device-parity/README.md` has the iOS form and the limits. A Kotlin, Swift or native config
change, an Android image or sound that is new, and a committed performance capture still take the
full build.

## Checking an SDK bump or a platform-I/O change on a device

The unit tests run file, network, keychain and Photos access in Node or against fakes, and the crash
matrix drives drawing, not those paths, so neither reaches the device runtime's I/O. On 2026-10-20 a
few minutes of hand use on the devices, and the recheck of each fix, found five defects that both
had passed:

* Expo SDK 58 made `File.write()` asynchronous, ten call sites kept calling it unawaited, and the
  stores that verify a file read it back before the bytes landed (issue 3062).
* React Native's `Blob` rejects `ArrayBuffer` and typed-array parts where Node's accepts them, so
  every AI upload threw before sending (issue 3063).
* Every real PNG AI result carries a C2PA `caBX` chunk, which the validators rejected (issue 3066).
* The new-architecture interop delivers a native `nil` to JavaScript as `undefined`, not `null`, so
  an empty iOS keychain slot failed its read and every AI credential save failed (issue 3068).
* iOS directory listings return `/private/var/...` URLs with a trailing slash, so the AI journal
  never matched the attempt folders it had built from `/var/...` (issue 3069).

After an Expo or React Native SDK bump, or any change to platform I/O, run this on a Release build
on each platform:

1. Change a setting, force-stop the app, relaunch it, and confirm the setting stuck.
2. Save an AI key, then reopen Settings and confirm it is still there.
3. Save a picture to Photos.
4. Run one AI generation, when the work has AI budget.

Rechecking a fix that touches only TS or TSX takes about ten seconds through
`node tools/device-parity/swap-js-bundle.mjs` (above).

## Performance probe

A Release bundle built with `EXPO_PUBLIC_SPLOTCH_PERF_PROBE=1` in the environment counts the live
stroke's work and writes one JSON line (`v` 2) per contact cohort to the device log. Without it the
probe is `false` at every call site (`src/drawing/perfProbe.native.ts`); the web export, Node and
the type checker resolve the no-op `src/drawing/perfProbe.ts` instead. `babel-preset-expo` inlines
`EXPO_PUBLIC_*` values into a production bundle when Metro transforms it, and both Release bundle
steps pass `--reset-cache`, so a cached transform never carries an earlier build's value. Gradle
does not treat the environment as an input of `:app:createBundleReleaseJsAndAssets` and reports it
up to date, so an Android build that turns the probe on or back off reruns that task.
`EXPO_PUBLIC_SPLOTCH_PERF_PROBE_BUILD` sets the line's `build` field.

```sh
export EXPO_PUBLIC_SPLOTCH_PERF_PROBE=1 EXPO_PUBLIC_SPLOTCH_PERF_PROBE_BUILD="$(git rev-parse --short HEAD)"
# iOS, from ios/ (after pod install)
xcodebuild -workspace Splotch.xcworkspace -scheme Splotch -configuration Release \
  -destination generic/platform=iOS build
# Android, from android/; unset the two variables and run the same command again to return to a
# build without the probe
./gradlew :app:createBundleReleaseJsAndAssets --rerun :app:assembleRelease
```

Read the lines from the host:

* **Android:** `adb logcat -s SplotchPerf:I -v raw`.
* **iOS device:** collect the log after the run rather than streaming it whenever the line's timing
  matters (`emissionLateness`, input-to-submission). A live stream
  (`pymobiledevice3 syslog live --udid <udid> -pn Splotch -m '"probe":"SplotchPerf"'`) keeps
  `diagnosticd` and the USB link busy about once a second. On the iPad that held the main thread 25
  to 50 ms in Skia's `CAMetalLayer` drawable wait and put every replay past a frame (issue 3003).
  The same replays measured with a collected archive stayed under 26 ms with the drawing sound off:

  ```sh
  T0=$(date +%s)   # just before launching the app
  pymobiledevice3 syslog collect --udid <udid> --start-time $((T0 - 2)) run.logarchive
  # The full path: zsh, the macOS default shell, has its own `log` builtin.
  /usr/bin/log show --archive run.logarchive --style compact \
    --predicate 'process == "Splotch" AND eventMessage CONTAINS "SplotchPerf"'
  ```

  On iPadOS 26.5, `idevicesyslog -p` with the app's process name printed nothing for the whole
  2026-10-19 campaign. The unified log caps a message near 1 KB, live or archived, so a long cohort
  line arrives cut off and fails to parse as JSON. Fields past the cut are missing from the device
  log, though the earlier ones survive.
* **iOS simulator:**
  `xcrun simctl spawn <udid> log stream --style compact --predicate 'category == "SplotchPerf"'`.

A cohort runs from the first input packet received while no contact is held to the packet that
leaves none held. Render work after the last lift still counts toward it until `COHORT_SETTLE_MS`
passes or the next contact begins; the line is written then, never while a later cohort is drawing
(`src/drawing/perfCohort.ts`).

| Field                                                  | Counts                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packets`, `samples`, `maxSamplesPerPacket`            | Packets `paperInputOwner` accepted, and the native samples they carried for the contacts each one changed                                                                                                                                                                                                         |
| `appended`, `duplicate`, `minDistanceRejected`         | What `sampleOutcome` (`src/drawing/model.ts`) kept of each sample after a stroke's first point                                                                                                                                                                                                                    |
| `strokes`, `points`                                    | Strokes the cohort committed, and the points in its longest                                                                                                                                                                                                                                                       |
| `inkLayoutEffectCommits`, `surfaceLayoutEffectCommits` | Commits in which `SkiaInk` or `DrawingSurface` rendered, counted by a layout effect without dependencies (React's `<Profiler>` does not report in a production renderer). Live ink renders neither: expect commits only where a cohort starts and ends                                                            |
| `liveFlush`, `sceneRecord`                             | Count, total and slowest milliseconds of one live ink flush (recording the samples since the last flush as ops and painting them on the ink layer; each packet flushes as it arrives, unless it came within `HANDOFF_SPACING_MS` of the last hand-off) and of recording the scene picture of the layer's tiles    |
| `inputToSubmission`                                    | For each new scene picture handed to the ink view through Skia's JSI setter: from the newest native sample it newly carries to the hand-off, as count and nearest-rank p50, p95, max and min. It ends at submission, not at a presented frame                                                                     |
| `oldestToSubmission`                                   | The same hand-offs, measured from the oldest native sample each newly carries: how long the first sample of a frame's batch waited                                                                                                                                                                                |
| `firstDotMs`                                           | From the cohort's first native sample to the first hand-off that carries it, or `null` when none did                                                                                                                                                                                                              |
| `handoffs`, `submissionGap`                            | Pictures handed to the ink view while a contact was held, and the milliseconds between consecutive ones (count and nearest-rank p50, p95, max and min): the cadence live ink updates at                                                                                                                           |
| `handoff`, `pictureRelease`, `audioVolume`             | Count, total and slowest milliseconds of handing a picture to the view through Skia's JSI setter, of releasing the picture it replaced, and of setting the drawing sound's player volume, a synchronous native call each sample makes                                                                             |
| `longestGap`                                           | The longest `submissionGap` and what happened inside it: `ms`, when it began (`atMs`, from the cohort's first packet), the `packets` received during it, the `memoryWarnings`, and the garbage collections (`gcs`) and their wall time (`gcMs`) Hermes counted, both `null` when the runtime does not report them |
| `packetGap`, `receiptLag`                              | Milliseconds between consecutive packets reaching JavaScript, and from each packet's newest native sample to its arrival there (count and nearest-rank p50, p95, max and min). A long gap with a short lag is input that was not sent; a long lag is input that waited for the JavaScript thread                  |
| `memoryWarnings`, `gc`                                 | Low-memory warnings during the cohort (React Native on iOS answers each with a full garbage collection on the JavaScript thread), and the collections Hermes ran from the cohort's first packet to its line (`n`, wall `ms`), or `null`                                                                           |
| `clockJoin`                                            | The clock both ends read: `performance.now()` is React Native's `HighResTimeStamp`, `mach_absolute_time` on iOS like `UITouch.timestamp`, and `CLOCK_MONOTONIC` on Android like `MotionEvent.getEventTime()`, whose whole milliseconds can make an interval read up to `errorMs` long                             |

### Replay

A probe build can also draw without a finger. Launched with a trace name, it waits for the paper
input view's first layout and `REPLAY_SETTLE_MS` more, then sends every packet of that trace on the
main thread at its scheduled time, open loop, through the same payload builder and `onPaperInput`
dispatch real touches use (`ios/Splotch/SplotchPaperReplay.swift`,
`android/app/src/main/java/art/splotch/app/SplotchPaperReplay.kt`). A sample carries the time it was
due at on the touch clock, so emission that runs late shows up in `inputToSubmission` as late touch
delivery would. Android delivers a real finger's moves batched once per frame, while the replay
emits each packet at its own time, so there it drives the packet path at the trace's rate rather
than the frame-aligned one. Only the probe's JavaScript asks the native driver for a trace
(`src/drawing/perfReplay.ts`); a build without the probe ignores the launch argument, and its bundle
holds neither the driver's caller nor the traces.

The traces live in `perf/replay/` (`src/drawing/replayTrace.ts` has their format). Positions are
fractions of the paper input view, so one trace covers any device and orientation.

| Trace              | Packets | Duration | What it holds                                                                                                                                 |
| ------------------ | ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `finger-session-1` | 2466    | 35.6 s   | An iPad finger session from the web input recorder: 23 strokes, up to two at once, one sample per packet at web handler-arrival times (~69/s) |
| `finger-session-2` | 1777    | 27.5 s   | A second such session: 30 strokes, up to three at once (~65/s)                                                                                |
| `long-no-lift`     | 2401    | 20.0 s   | One finger held down for 20 s, one sample per packet at 120 Hz                                                                                |
| `bursty-120-240`   | 1428    | 13.4 s   | Five strokes; packets at 120 Hz carry one or two 240 Hz samples, and every 60 frames a late packet carries three or four                      |
| `two-contact`      | 691     | 5.8 s    | Two fingers held together for 5 s, as one contact cohort                                                                                      |

`npm run gen:native-replay-traces` rewrites the three generated traces from their seed; adding
`-- --recordings=<folder>` also converts `session1.json` and `session2.json` from that folder, which
stays out of the repository.

Build and install a probe Release as above, then launch it with a trace name. Leave the screen
untouched until the replay's line appears. The `.dev` suffix renames the app, not its classes, so
Android names the activity in full:

```sh
# iOS device (devicectl hands the app DEVICECTL_CHILD_* variables, not dash arguments)
xcrun devicectl device install app --device <device> <derived data>/Build/Products/Release-iphoneos/Splotch.app
DEVICECTL_CHILD_SplotchReplay=long-no-lift xcrun devicectl device process launch \
  --device <device> --terminate-existing art.splotch.app.dev
# iOS simulator
xcrun simctl launch --terminate-running-process <udid> art.splotch.app.dev -SplotchReplay long-no-lift
# Android (-S stops the running app first, so the extra reaches a fresh launch)
adb -s <serial> install -r android/app/build/outputs/apk/release/app-release.apk
adb -s <serial> shell am start -S -n art.splotch.app.dev/art.splotch.app.MainActivity -e SplotchReplay long-no-lift
```

The replay writes one line to the same log as the cohort lines, with the trace in its `replay`
field, when its last packet has gone out; the last cohort's line follows within `COHORT_SETTLE_MS`.
A replay that fails writes `replay` and `error` instead.

| Field                   | Counts                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `timing`                | `generated`, or `web-handler-arrival` for the finger sessions                                                                                                                                                                                                                                                                                                                       |
| `packets`, `delivered`  | Packets emitted, and those that reached an attached paper input view                                                                                                                                                                                                                                                                                                                |
| `traceMs`, `durationMs` | The last packet's scheduled time, and the time from the first packet's scheduled time to the last one's emission                                                                                                                                                                                                                                                                    |
| `emissionLateness`      | Each packet's emission time minus its scheduled time, as count and nearest-rank p50, p95, max and min, and `maxAtMs`, the scheduled time of the latest packet. Lateness beyond a frame means the main thread held the replay back; discard that replay's cohort lines. On the iPad a live log stream alone makes most replays do so; read the line from a collected archive (above) |

## Web

`npm run native:web:build` exports the production web build into `dist/web` (gitignored) with
`expo export --platform web`, then makes it installable and offline-capable like the shipping PWA
(ADR-0022, ADR-0039): it copies the shipping `web/static/site.webmanifest`, the icons it and
`web/src/app.html` name, and that document's install head tags, then generates a Workbox worker
whose first precache entry is the exported `index.html` under a URL derived from its bytes. Every
entry carries the subresource integrity of the bytes this build wrote, so an install that receives
another deploy's document or chunks fails rather than pairing them
(`tools/tests/native-web-deploy-race.test.mjs`). Before the worker is generated,
`tools/migration/prerender-native-web.mjs` writes the drawing screen's prerendered first frame into
the shell, which the client hydrates (ADR-0180). Its post hook,
`tools/migration/check-native-web-precache.mjs`, fails when the shell is not first or not at its
content address, an entry is not pinned to the exported bytes, an exported file or a file the shell
names is not precached, a bundled Farm page is missing from the precached chunks, a lazily loaded
icon (`experiments/native-architecture/src/rsdDrawing/iconRegistry.ts`) reaches a script the shell
loads, or the precache outgrows its budget. Both documents open with a Content-Security-Policy meta
tag whose `script-src` lists the hash of each inline script they carry and never `'unsafe-inline'`
(`tools/migration/lib/native-web-csp.mjs`); the precache check fails a document whose policy misses
one. Serve `dist/web` from any static server that returns the exported bytes unchanged: a host that
rewrites HTML or assets (snippet injection, minification) makes every install fail its integrity
check. The export also writes `404.html`, the not-found page's own prerendered document, which a
static host answers any other path with; the worker leaves it out of its precache, and offline
answers with the app shell, which shows the same page off the drawing route
(`src/platform/appPath.web.ts`, the paths the worker's app-shell route answers). Its head carries
shipping's `viewport-fit=cover` viewport, so safe-area insets reach the app, and a boot style and
script that paint the paper in the saved or system theme before the bundle runs. The entry registers
`/sw.js` only in the web build (`src/platform/serviceWorker.web.ts`). After the worker is generated
the build copies the files the host serves beside the app from `web/static` (the coloring books,
`robots.txt`, `sitemap.xml`, the deny page and the link-preview images), so `dist/web` is the whole
site Netlify publishes (`netlify.toml`, `npm run build:site`). The web build calls the `/api`
function on its own origin; the native apps call `https://splotch.art`.

A new worker waits until every window of the old one closes, so an update never interrupts a
drawing. The Install Banner and the Settings install guide (`src/install/`) follow the shipping
policy and storage keys; their copy is drift-guarded against the Svelte components by
`tools/tests/native-web-install-drift.test.mjs`, and the banner's layout, inline icons and motion by
`tools/tests/native-install-banner-drift.test.mjs`.

Text uses the shipping font, Quicksand. RSD text inherits the `fonts` tokens in
`src/rsdDrawing/tokens.css.ts` from the screen and dialog roots, and headings take `boldText`; React
Native text imports `Text` and `TextInput` from `src/drawing/Text.tsx`, never from `react-native`.
`ShippingFontGate` (`src/platform/shippingFont.tsx`) wraps the screen.

* **Web** keeps the shipping stack and its variable face. Metro's web CSS pipeline does not bundle a
  stylesheet's local `url()` sources, so the gate registers the `@fontsource-variable/quicksand`
  faces itself (`shippingFont.web.tsx`) and renders at once, swapping the font in as the shipping
  app does; the precache carries their WOFF2 files.
* **Android and iOS** cannot register WOFF2, so the gate loads the 400, 500, 600 and 700 static
  faces from `@expo-google-fonts/quicksand` through `expo-font` and renders once they register (or,
  if they fail, in the system font). Each face is its own family, so
  `src/platform/nativeFontFamilies.ts` picks the family from the weight and sets the weight itself
  back to normal: Android resolves a weight of 700 or more on a registered family to a system bold
  face. `fontTheme.native.ts` applies the same faces to the RSD tokens.
* **Android** pads each text's line box out to the face's tallest glyph unless the text sets
  `includeFontPadding: false`, a style React Strict DOM drops.
  `patches/react-strict-dom@0.0.54.patch` sets it on every RSD text, so a line is the face's ascent
  plus descent, as Chromium's `line-height: normal` is.
* **Shipping's hub rows** (`HubList.svelte`) are `<button>`s that never inherit the page font, so a
  WebView sets them in the system face, which `src/rsdDrawing/hubRowFace.native.ts` names as
  `system-ui`. iOS resolves that family itself; Android rounds an unregistered family to regular or
  bold, so `MainApplication.kt` registers `system-ui` as the system typeface and the semibold title
  keeps its weight (`tools/migration/tests/native-system-face.test.mjs` binds the two names). The
  web build keeps the app font there: `src/strict.css` hands every form control the page font, and
  that unlayered rule outranks the layered StyleX style that would revert it.

`tools/tests/native-shipping-font.test.mjs` fails when the web faces drift from the package
stylesheet, a family stops matching the static package's exports, another weight is bundled, an RSD
heading or weight bypasses the font tokens, or a component imports `Text` from `react-native`.

### Large OS text

Native text follows the OS text size (iOS Dynamic Type reaches 3.571× at its largest accessibility
category); shipping's WebView does not, so these layouts have no shipping precedent to copy. A word
must never break across lines. Where a label can meet a narrow box, render it with `WholeWordText`
(`src/rsdDrawing/WholeWordText.native.tsx`): it reports a word the layout broke, and with `fit` it
shrinks only that text until its widest word fits. Dialog titles take their own row before they fit,
and a segmented track stacks its options once a label breaks. A live change of the OS text size
leaves already measured React Native text at its old frame until it remounts, so these adapters
remount on a font-scale key; other text corrects itself when the dialog reopens.

## Permissions

The Android manifest removes broad photo-read declarations merged by Expo FileSystem and
expo-media-library and declares `WRITE_EXTERNAL_STORAGE` with `maxSdkVersion=28`. Android 7–9
(API24–28) requests that write permission when first saving to the photo library. With permission,
`SplotchPhotoLibrary.kt` writes under public `Pictures/Splotch/`; after denial it attempts the
app-specific external media directory and scans the saved file. Android 10 and later (API29+) insert
into MediaStore under `Pictures/Splotch/` without a storage permission. Android's compiled manifest
can also report `READ_EXTERNAL_STORAGE` as an implied permission through API28 because write access
was requested; it is not a broad modern photo-library read request. Editable copies use app-private
storage and sharing uses a cache PNG. iOS asks only for add-only Photos access
(`NSPhotoLibraryAddUsageDescription`), never read access. expo-media-library's config plugin is
deliberately not registered in `app.json`: it would add the read permissions and
`requestLegacyExternalStorage`. `tools/migration/tests/native-permissions.test.mjs` guards the
manifest, including every permission expo-media-library declares. Check a built APK's merged
permissions when a dependency changes; `:app:processReleaseMainManifest` writes the merged manifest
under `android/app/build/intermediates/merged_manifest/release/`. `expo-haptics` merges the
normal-level `VIBRATE` permission for the drag-to-clear threshold haptic, as the shipping app's
`@capacitor/haptics` does.

## AI invite links

An admin hands out invite links shaped `https://splotch.art/?ai_access_token=<code>` (the parameter
is `AI_ACCESS_TOKEN_PARAM` in `web/src/lib/inviteLink.ts`). `src/index.ts` starts `startInviteLinks`
before the first render, and both targets apply a link the way the shipping page's
`captureAiAccessTokenFromUrl` does: the code is saved unverified into the access-code slot of the
secure AI vault, with no Parent Center gate and no on-screen confirmation; the server checks it on
first use. A code that fails `validCredential` (`src/ai/credentials.ts`), which every vault write
enforces, is ignored.

* **Web** (`src/platform/inviteLinks.web.ts`) reads the launch URL and removes the parameter only
  after the save succeeds, so a failed or superseded save leaves the link in place to retry. The
  browser Back owner reads page URLs without the parameter, so that scrub is not a navigation.
* **Native** (`src/platform/inviteLinks.ts`) reads `Linking.getInitialURL()` and `url` events and
  accepts only links that start with `https://splotch.art/?`. A launch link is dropped when any
  credential operation, such as a runtime invite or a typed code, happened while the launch URL was
  being read, so an older link never overwrites a newer credential. `AppDelegate.swift` already
  forwards `open url` and universal-link activities to `RCTLinkingManager`.

No link reaches the native app yet. The shipping Capacitor app declares no intent filter, URL
scheme, or associated domain, so this app adds none either. Routing invite links to the store builds
at cutover needs:

* **Android:** an `android:autoVerify="true"` `VIEW`/`BROWSABLE` intent filter for `https`
  `splotch.art`, with `/.well-known/assetlinks.json` on splotch.art naming the package and the Play
  App Signing certificate SHA-256. An intent filter cannot match a query string before Android 15's
  `uri-relative-filter-group`, so on older devices claiming `/` sends every splotch.art root visit
  to the app.
* **iOS:** the `com.apple.developer.associated-domains` entitlement with `applinks:splotch.art`, and
  an `apple-app-site-association` file on splotch.art whose component for `/` requires the
  `ai_access_token` query item, so other root visits stay in Safari.
