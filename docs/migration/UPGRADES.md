# Native services and upgrade acceptance

This inventory defines what the replacement Android and iOS applications must preserve. It is a
contract for implementation and verification; every acceptance result below is pending. Development
apps installed beside the shipped app provide useful isolation but cannot establish upgrade safety.

## Identity, compatibility, and release owners

The production application identity belongs to [capacitor.config.json](../../capacitor.config.json).
[The app-ID guard](../../tools/mobile/check-app-ids.mjs) checks native and tooling declarations
against it. The replacement must update the existing store application with its existing Android
signing lineage and iOS team/keychain access. A different application ID or signing identity is a
separate installation, even when its screen looks identical.

The supported floors belong to [COMPATIBILITY.md](../COMPATIBILITY.md),
[Android variables](../../android/variables.gradle), and
[the iOS project](../../ios/App/App.xcodeproj/project.pbxproj). Dependency selection must establish
which released React Native, renderer, audio, and native-module versions meet those floors. An
increase requires a recorded architecture decision and corresponding compatibility changes.

Native versioning belongs to
[the release version writer](../../tools/release/lib/native-version.mjs). Signing and artifact
workflows belong to [the Android guide](../MOBILE/android.md) and [the iOS guide](../MOBILE/ios.md).
Preserve those owners rather than maintaining a second release version or application-ID registry in
the new application.

## Persistent data inventory

| Data                                 | Legacy location and format                                                                                                                                                                                         | Replacement obligation                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Parent settings and policy           | [STORAGE_KEYS](../../web/src/lib/storageKeys.ts) and [dual-layer storage](../../web/src/lib/storage.ts): localStorage plus native Preferences                                                                      | Recover recognized settings without resetting parent gates or overwriting newer mutations.                                   |
| Durable settings on Android          | Preferences' SharedPreferences file `CapacitorStorage`, with bare Splotch keys and string values                                                                                                                   | Read the existing file or migrate it transactionally into a chosen durable backend.                                          |
| Durable settings on iOS              | Preferences' `UserDefaults.standard` keys prefixed `CapacitorStorage.`, with string values                                                                                                                         | Read the prefixed keys; a different UserDefaults suite is not the legacy store.                                              |
| Pending removals                     | `STORAGE_KEYS.pendingDurableRemovals` contains a JSON key list                                                                                                                                                     | Complete recorded removals before treating surviving durable values as credentials or settings to restore.                   |
| BYO API key and managed code         | [secureStorage.ts](../../web/src/lib/secureStorage.ts): logical names `gemini-api-key` and `managed-access-code`                                                                                                   | Preserve historical addresses, confidentiality, and confirmed-absence versus read-failure behavior.                          |
| Secure plugin keys                   | Plugin prefix `capacitor-storage_` followed by the logical name; plugin payload is a JSON-encoded string                                                                                                           | A reader must decode the existing payload before returning the secret to application state.                                  |
| Android encrypted secrets            | SharedPreferences file `WSSecureStorageSharedPreferences`; matching prefixed AndroidKeyStore alias; AES/GCM ciphertext followed by U+0010 and IV, both Base64 without padding or wrapping; plaintext is UTF-8 JSON | Rebind the existing implementation or verify an equivalent reader; replacing the package alone does not recover old entries. |
| iOS secure secrets                   | KeychainSwift-backed items under the prefixed keys, with synchronization disabled and device-only accessibility selected by the application                                                                        | Preserve accessible keychain scope and device-only writes; verify reads against the previous signed artifact.                |
| Failed-save pictures                 | [unsavedPictureStore.ts](../../web/src/lib/drawing/unsavedPictureStore.ts): WebView IndexedDB database `splotch-unsaved-pictures`, store `held`, key `pictures`                                                    | Import exact bytes, MIME type, base name, failure outcome, and signature before retiring legacy storage access.              |
| Failed-save hint                     | `STORAGE_KEYS.unsavedPicturesHeld` is mirrored to Preferences; the hint contains no picture bytes                                                                                                                  | Do not equate reading the hint with recovering the pictures.                                                                 |
| Coloring books and pending downloads | Native directories, markers, and jobs described below                                                                                                                                                              | Keep verified installed content and reconcile background work across the upgrade.                                            |

Preferences and secure-plugin details describe the installed legacy implementation. Freeze the
previous artifact's dependency lock and inspect its actual implementation when writing the import
adapter; matching logical key names alone does not establish namespace, encoding, or keychain
compatibility. [pnpm-lock.yaml](../../pnpm-lock.yaml) identifies the repository's resolved tree.

[ADR-0005](../adrs/0005-dual-layer-storage.md) defines durable recovery. Credential hydration
follows durable recovery so a legacy plaintext credential surviving only in Preferences can migrate
before both plaintext copies are scrubbed.
[Persisted-state boot](../../web/src/lib/boot/persistedState.ts) and the credential coordinators
preserve that order. Import failure must keep its recoverable source and remain retryable; it must
not mark an unreadable vault empty or silently change an active gate.

### Legacy WebView picture bridge

The replacement must retain a narrowly scoped route to the old WebView's persistent data store and
origin until pending pictures have been recovered. Freeze the previous artifact's effective origin
and storage configuration. A legacy reader exports the validated IndexedDB record to the
replacement's durable picture store. Avoid directly parsing undocumented browser database files. The
destination acknowledges a complete durable write before the source is cleared.

The import is idempotent across interruption, process death, and repeated boot. It cannot overwrite
pictures captured by the replacement while an earlier read is settling. Missing records, failed
reads, invalid records, and successful imports have distinct outcomes. Keep source bytes on any
failed import. Bound transfers and run them away from the input/render hot path.

[Save-failure state](../../web/src/lib/state/saveFailure.svelte.ts) owns retention, deduplication,
and retry behavior. A parent returning from device Settings must be able to retry the original
failed picture even if the canvas was cleared or the operating system terminated the application.
Retire the bridge only after upgrade evidence demonstrates recovery or confirmed absence for
supported legacy states; the exact retirement policy remains an implementation decision.

## Installation allowance identity

[ADR-0105](../adrs/0105-server-authoritative-free-ai-grants.md) and
[installationId()](../../web/src/lib/state/freeGenerations.svelte.ts) own the pseudonym: SHA-256 of
the UTF-8 bytes of `splotch-free-generation-v1:<raw platform identifier>`. The legacy Android Device
implementation returns `Settings.Secure.ANDROID_ID`; iOS returns
`UIDevice.current.identifierForVendor.uuidString`. The replacement must preserve the raw value's
formatting and the namespace. A convenient random installation UUID is not equivalent.

Compare the legacy and replacement pseudonyms locally during same-ID upgrade verification. Do not
log or send the raw identifier. The existing server allowance must retain its spent state and cached
badge hints remain display hints, never authorization. Failed identity reads must not hash an empty
value into an allowance shared by unrelated installations. Reinstallation reset boundaries remain
those accepted in ADR-0105.

## Coloring storage and lifecycle continuity

[Android storage](../../android/app/src/main/java/art/splotch/app/ColoringPackStorage.java) uses
`noBackupFilesDir/coloring/<resolution>/<bookId>` and publishes `.installed` after verification. The
namespace is independent of application version. Preserve matching bytes, adopt still-valid files
when manifests change, and expose only complete books. The WorkManager unique work name is
`splotch-coloring-pack`; jobs live under the coloring root's `jobs` directory.

[The Android worker](../../android/app/src/main/java/art/splotch/app/ColoringPackWorker.java) and
storage have no Capacitor dependency. Reuse is plausible; scheduling, observers, cancellation, and
Promise replies in
[the plugin](../../android/app/src/main/java/art/splotch/app/ColoringPacksPlugin.java) need
replacement bindings. Preserve the worker class identity needed by already-enqueued jobs or
explicitly cancel and reconcile them without losing completed files.

[The iOS coordinator](../../ios/App/App/ColoringPacksPlugin.swift) stores books in Application
Support's `coloring/<resolution>/<bookId>` with backup exclusion. Its persisted job is the
`current.json` file below the runtime `coloring` → `jobs` directory. Background session identifiers
are `art.splotch.app.coloring-packs.wifi` and `art.splotch.app.coloring-packs.metered`.
[AppDelegate](../../ios/App/App/AppDelegate.swift) resumes pending work at launch and reconnects
background URLSession completion events. Extract the coordinator and rebind those callbacks without
orphaning sessions. Preserve metered-network policy, feature-disable cancellation, and offline
remove.

The existing [pack-store contract](../../web/src/lib/coloringPacks/store.ts) is a useful product
seam. [The native adapter](../../web/src/lib/coloringPacks/nativeStore.ts) converts file URLs
through Capacitor for WebView consumers; the replacement needs renderer-appropriate file resolution
rather than inheriting that conversion. [ADR-0103](../adrs/0103-progressive-coloring-book-packs.md)
owns manifest integrity, starter content, and the separation of background work from drawing.

## Native service bindings

Registration owners are
[Android MainActivity](../../android/app/src/main/java/art/splotch/app/MainActivity.java) and
[iOS MainViewController](../../ios/App/App/MainViewController.swift). Inventory package-provided
plugins as well as local classes; registration counts are not the capability inventory.

| Service                 | Reusable policy or implementation                                                                                                              | Replacement and acceptance requirement                                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Device lock             | ActivityManager lock-task state and main-thread UIAccessibility Guided Access query                                                            | Rebind both queries and preserve truthful locked/unlocked parent guidance.                                                                                              |
| Android Back            | [SystemBack](../../android/app/src/main/java/art/splotch/app/SystemBackPlugin.java) and [ADR-0165](../adrs/0165-android-system-back-plugin.md) | Close the top dialog through its own policy; respect gates; protect ink; background without finishing the activity; cover early boot and predictive Back.               |
| Orientation             | [orientation.ts](../../web/src/lib/platform/orientation.ts) and Android sensor-orientation policy                                              | Preserve explicit parent locks, Android Auto sensor behavior, iOS OS-lock behavior, and windowed iPad policy.                                                           |
| Apple Pencil double-tap | [UIPencilInteraction implementation](../../ios/App/App/PencilEraserPlugin.swift)                                                               | Attach to the replacement UIView with a retained delegate; preserve [tool availability and lazy detection](../../web/src/lib/plugins/pencilEraser.ts).                  |
| Photo saving            | [Android PhotoLibrary policy](../../android/app/src/main/java/art/splotch/app/PhotoLibraryPlugin.java) and iOS add-only photo authorization    | Preserve gallery destinations, legacy permission fallback, accurate denied/failed outcomes, and cleanup. New transfer bindings may avoid WebView base64 transport.      |
| Device Settings         | Existing app-specific Android intent and iOS Settings URL                                                                                      | Keep parent-gated recovery and the exact failed-save bytes through termination/relaunch.                                                                                |
| Connectivity            | [network state policy](../../web/src/lib/state/network.svelte.ts)                                                                              | Provide native status/events, reliable offline recovery, and teardown of late subscriptions.                                                                            |
| Haptics and awake state | [haptics](../../web/src/lib/platform/haptics.ts) and [wake lock](../../web/src/lib/boot/wakeLock.ts)                                           | Preserve gesture confirmation and active-session behavior without making absent hardware fatal.                                                                         |
| Audio                   | [Drawing audio](../../web/src/lib/audio/drawingSound.ts) and [clear audio](../../web/src/lib/audio/clearSound.ts)                              | Choose a native backend for offline loops, speed gain, volume preview, procedural clear feedback, and recorded commit sound; preserve cancellation and silent teardown. |

Native input and surface lifecycle also need explicit adapters. Preserve multi-pointer command
grouping, cancellation, pen/touch policy, sample geometry, and rotation/background recovery.
Existing [engine listeners](../../web/src/lib/drawing/engineListeners.ts) and
[engine lifecycle](../../web/src/lib/drawing/engine.ts) document the old boundary; browser quirks
are evidence to validate against the new runtime, not code to copy blindly. Pressure sensitivity is
not an existing brush-width feature to introduce during parity work.

Hosted API contracts remain owned by [API.md](../API.md),
[credential selection](../../web/src/lib/ai/credentials.ts), and
[header declarations](../../web/src/lib/apiHeaders.ts). Verify raw-image requests, synchronous and
job-ticket responses, polling, credential precedence, and report-token binding in the selected
native runtime. Preserve
[the reviewed privacy inventory](../../tools/mobile/privacy-permission-inventory.json) and
[compliance decisions](../MOBILE/compliance.md) when selecting replacement dependencies.

## Same-ID signed upgrade evidence

Record previous/candidate commit, artifact digest, signing relationship, OS/device, execution mode,
seeded state, observed result, and artifact links for each scenario. Read-only fixtures supplement
these runs; they do not replace installing the previous signed artifact and updating it in place.

| Scenario                                | Acceptance                                                                                                                                                | Status  |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Existing settings and parent gates      | All recognized values survive; pending deletions do not resurrect; no default-state flash bypasses a gate.                                                | Pending |
| Secure and legacy plaintext credentials | Existing secrets load, successful migration removes plaintext, failed migration preserves recoverable data, and removal stays removed after relaunch.     | Pending |
| Partly spent installation grant         | Pseudonym is identical and the server retains the existing allowance.                                                                                     | Pending |
| Held failed-save pictures               | Upgrade, interruption, Settings return, and repeated launch preserve exact bytes and retry behavior without duplication.                                  | Pending |
| Installed and partial coloring books    | Airplane-mode upgrade retains complete books; interrupted/corrupt books stay hidden; unchanged content is not redownloaded.                               | Pending |
| Background pack work during upgrade     | Both scheduling policies resume or reconcile safely; disabling/removing cancels work without stale callbacks restoring content.                           | Pending |
| Native services and lifecycle           | Back, gates, Pencil, photo permissions, orientation, audio, connectivity, and background/rotation recovery retain product behavior.                       | Pending |
| Supported floor and optimized release   | Candidate installs and exercises its required behavior on declared floors and physical release targets, with release configuration and truthful evidence. | Pending |

Physical-device access, signing success, dependency toolchain compatibility, and the native audio
implementation are unverified. Current host tool availability is not acceptance evidence. Resolve
these through the canonical mobile/capture workflows while independent implementation work proceeds.
