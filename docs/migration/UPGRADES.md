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

## Supported upgrade sources

The source set includes skipped releases, not only the immediately preceding build. The
[published release inventory](https://api.github.com/repos/KyleMit/Splotch/releases?per_page=100)
was read on 2026-10-06: the first attached Android artifact is
[v1.0.0](https://github.com/KyleMit/Splotch/releases/tag/v1.0.0), the first attached iOS artifact is
[v1.4.0](https://github.com/KyleMit/Splotch/releases/tag/v1.4.0), and the latest published tag with
both artifacts is [v1.6.0](https://github.com/KyleMit/Splotch/releases/tag/v1.6.0).
[Android distribution notes](../MOBILE/android.md) confirm Closed testing as of 2026-09-09;
[the iOS checklist](../MOBILE/ios.md) does not establish a completed TestFlight/App Store release. A
GitHub asset is published-artifact evidence, not proof of a store rollout.

Conservatively support every Android release tag from v1.0.0 and every iOS-containing release tag
from v1.2.0 through the latest release at cutover. The iOS tree first appears in v1.2.0; its and
v1.3.0's store distribution, and v1.2.0's missing attached native artifacts, require channel
inventory. Do not infer that no user installed them. Freeze the oldest actual store build, latest
actual store build, artifact digests/embedded versions, effective origins, native dependency locks,
and distribution/signing history before accepting upgrade evidence.

| Source class                           | Supported targets and artifact evidence                                                                | Persisted formats to seed and inspect                                                                                                                                                    | Acceptance                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| v1.0.0 / v1.0.1                        | Android; attached AABs                                                                                 | Dual-layer strings/booleans/integers, legacy plaintext access code/API key, native gemini-api-key vault; inline keys in src/lib/state/settings.svelte.js and strokeWidth.svelte.js       | Pending                                        |
| v1.1.0                                 | Android; attached AAB                                                                                  | TypeScript settings/secure/storage owners under src/lib; API-key vault and plaintext access code; no coloring-pack jobs or held-picture IDB                                              | Pending                                        |
| v1.2.0                                 | Android and iOS source; no attached native artifact                                                    | src/lib storage/secure/settings, sound-volume choices; iOS default non-sync accessibleWhenUnlocked items                                                                                 | Pending; distribution/artifact recovery        |
| v1.3.0                                 | Android AAB; iOS source                                                                                | web/src/lib storage/secure/settings, Pencil and installation preferences; iOS default Keychain class                                                                                     | Pending; iOS distribution/artifact recovery    |
| v1.4.0                                 | Android AAB and first attached iOS IPA                                                                 | Central storageKeys.ts including theme/brush and splotch-advanced-controls; API-key vault; no native pack jobs                                                                           | Pending                                        |
| v1.5.0                                 | Android AAB and iOS IPA                                                                                | Parental policy/legacy gate keys, optional brushes, native pack directories/jobs/sessions, device-derived installation grant; managed access code remains plaintext                      | Pending                                        |
| v1.6.0                                 | Android AAB and iOS IPA; latest published tag at this audit                                            | Managed-access-code vault plus API-key vault, per-source sounds/session hints, pack jobs; iOS accessibleWhenUnlocked; no pending-removal list, vault-absence marker, or held-picture IDB | Pending                                        |
| Post-v1.6.0 main / campaign candidates | Unreleased source at this audit; add every distributed candidate and every main release before cutover | Pending durable removals, held-picture IDB/hint, per-write device-only iOS policy, changed drawer key and newer formats only where that source actually writes them                      | Pending; applicability depends on distribution |

Freeze each tag's own source manifest rather than projecting HEAD's storageKeys.ts backward. For
early tags inspect the inline key declarations and their readers/writers; later tags own their
central registry. Native and web-only records are distinct: the free-generation installation string
has existed inline on the web path since v1.5.0, before its registry move, but native identity uses
Device ID. Obsolete settings such as splotch-advanced-controls need an explicit reviewed semantic
mapping to the replacement's drawer policy; absence from HEAD's registry is not permission to drop
the choice.

Run each source class's applicable same-ID scenarios. Only v1.0.0/v1.0.1 are provisionally collapsed
for persistent-data fixtures: storage.js, secureStorage.js, settings/stroke-width/platform modules,
Capacitor config, native manifest/MainActivity, and resolved dependency lock are identical apart
from the root release version. Their attached AAB digests also match; verify embedded-version/source
association rather than treating a tag label as proof. Do not extend this collapse to other tags
without comparing keys, parsers, namespaces, accessibility, deletion/hydration, identity, jobs, and
native dependency formats. UI/service changes still need their applicable checks.

Any main release or distributed integration candidate during the campaign joins this matrix with its
exact commit/artifact/channel and format differences. Earlier readers must remain available until
every supported source class is accepted; “HEAD works” cannot retire legacy access.

## Persistent data inventory

| Data                       | Source location and format                                                                                                                                                    | Replacement obligation                                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Native live settings       | The old WebView's localStorage at its frozen effective origin; source-specific key names and string serialization from its [storage owners](../../web/src/lib/storageKeys.ts) | Export the live snapshot before replacing WebView access; present local values win over stale Preferences.                         |
| Android settings fallback  | Preferences SharedPreferences file CapacitorStorage, with bare application keys                                                                                               | Recover evicted/missing local values using the source's reconciliation rules; do not read this mirror as the only settings source. |
| iOS settings fallback      | UserDefaults.standard with CapacitorStorage. prepended to each key                                                                                                            | Preserve exact names and recover only after reconciling the live local snapshot.                                                   |
| Pending durable deletions  | Post-v1.6.0 splotch-pending-durable-removals, JSON array of supported native storage keys, mirrored to Preferences                                                            | Union the source's valid local/durable lists; a present live local value supersedes its pending removal.                           |
| Secure logical keys        | gemini-api-key; managed-access-code only in source versions that write it                                                                                                     | Native plugin prefix capacitor-storage_ and JSON-encoded string payload; validate the decoded string.                              |
| Android encrypted secrets  | WSSecureStorageSharedPreferences; matching prefixed AndroidKeyStore alias; AES/GCM ciphertext then U+0010 then IV, both Base64 without padding/wrapping; UTF-8 JSON plaintext | Rebind or verify an equivalent reader; package replacement alone does not recover entries.                                         |
| Shipped iOS secure secrets | Non-sync KeychainSwift items under the prefixed keys; released native setters through v1.6.0 omit access and use accessibleWhenUnlocked                                       | Read with the existing team/access-group scope; harden only through the transactional policy below.                                |
| Post-v1.6.0 iOS writes     | Same namespaces/payload, synchronization off, whenUnlockedThisDeviceOnly on each new save                                                                                     | Also read earlier accessibleWhenUnlocked items; a changed default never rewrites an existing item automatically.                   |
| Held failed-save pictures  | Post-v1.6.0 WebView IndexedDB database splotch-unsaved-pictures, store held, key pictures                                                                                     | Import exact bytes, MIME/base name, failure outcome and signature only for sources that contain this store.                        |
| Failed-save hint           | Post-v1.6.0 STORAGE_KEYS.unsavedPicturesHeld in the settings layers; no picture bytes                                                                                         | Probe actual IDB records even when the hint is missing or stale.                                                                   |
| Coloring books/downloads   | Source-version native directories, markers and jobs below                                                                                                                     | Preserve completed content and reconcile background ownership from that source's format.                                           |

These rows distinguish released and unreleased source formats. Freeze the installed artifact's
resolved dependencies, including its pnpm-lock.yaml or earlier package-lock.json and iOS native
package lock. HEAD's [pnpm-lock.yaml](../../pnpm-lock.yaml) identifies HEAD, not every installed
version. Matching logical names alone does not prove namespace, encoding or accessibility.

### Legacy WebView settings and picture bridge

Retain a narrowly scoped reader of the old WebView's persistent profile/origin until settings and
applicable held pictures are reconciled. Export the source-specific localStorage snapshot, including
its pending-removal list when present, and read Preferences independently. A failed local read is
not proof of absence. Do not parse undocumented browser database files or silently switch origins.

[storage.ts](../../web/src/lib/storage.ts) writes localStorage synchronously and mirrors Preferences
without awaiting it. Its reconcileStorageValues restores durable only when local is absent, backs up
local when durable is absent, and leaves local authoritative when both exist. Import that effective
live state. Resolve it before credential hydration or visible parent policies, following
[ADR-0005](../adrs/0005-dual-layer-storage.md) and
[persisted-state boot](../../web/src/lib/boot/persistedState.ts).

For sources with pending removals, union both valid lists before restoration. If the live local
value is present, a newer write superseded removal: retain that value and settle only its tombstone.
If local is absent and removal is pending, suppress durable restoration and retry durable deletion;
clear its tombstone only after acknowledged deletion. Settlements must re-read live pending state,
so a concurrent write/removal cannot be overwritten by a stale import snapshot.

Released sources through v1.6.0 have no tombstone. Local absence plus a durable value can mean
eviction or an unacknowledged intentional deletion; the snapshot cannot distinguish them. Preserve
the source's historical recovery rule and secure-vault precedence, and review explicit ambiguous
credential/removal cases before implementing import. Do not invent HEAD markers for those sources or
promise to infer an unrecorded removal. Successful vault reads take precedence over residual
plaintext; unreadable vaults are retryable failures, not confirmed empty vaults.

For held pictures, the validated IDB record transfers to the replacement's durable picture store. A
complete durable acknowledgement precedes clearing the source. Import is idempotent across
interruption/process death and cannot overwrite new replacement pictures while an older read
settles. Missing, failed, invalid and successfully imported records have distinct outcomes; keep
source bytes on failure. Bound transfers away from drawing hot paths.
[unsavedPictureStore.ts](../../web/src/lib/drawing/unsavedPictureStore.ts) and
[save-failure state](../../web/src/lib/state/saveFailure.svelte.ts) own
retention/deduplication/retry. Retire the reader only after evidence covers supported sources and
confirms recovery or absence.

### iOS Keychain accessibility transition

Released
[v1.6.0 secure setters](https://github.com/KyleMit/Splotch/blob/v1.6.0/web/src/lib/secureStorage.ts)
call SecureStorage.set without an access option. Its
[native lock](https://github.com/KyleMit/Splotch/blob/v1.6.0/ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved)
pins KeychainSwift; the default is accessibleWhenUnlocked, synchronization off. HEAD's
[explicit device-only writer](../../web/src/lib/secureStorage.ts) changes future saves, not old
items.

Choose transactional hardening after a successful validated legacy read: update that same non-sync
item to whenUnlockedThisDeviceOnly in the same accessible account/service/access-group namespace,
then verify its value and accessibility. Use an atomic SecItemUpdate path that retains the old item
on failure; the legacy KeychainSwift set deletes before adding, so calling it again is insufficient.
Do not remove/recreate the old item before the durable update succeeds. Locked-device, read, update,
or verification failures retain recoverable data and a retryable state; they never write an
empty-vault marker or discard plaintext before successful secure persistence. New writes use
device-only access. Test with an item written by the released setter, not a HEAD-seeded item.

[KeychainSwift defaults/set behavior](https://github.com/evgenyneu/keychain-swift/blob/21.0.0/Sources/KeychainSwift.swift),
[accessibility defaults](https://github.com/evgenyneu/keychain-swift/blob/21.0.0/Sources/KeychainSwiftAccessOptions.swift),
[SecItemUpdate](https://developer.apple.com/documentation/security/secitemupdate(_:_:)).

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

## Early local continuity feasibility

After the minimum native template, prove read feasibility with a disposable prior-source fixture
updated in place to the candidate under the same app ID and local signing scope. Use that release's
real setters/parsers and native locks to seed applicable settings and secure entries. Read the
WebView at its actual effective origin/profile, localStorage as the live copy, independent
Preferences and the released secure namespaces. A retained narrow WebView reader is acceptable; raw
database parsing and destructive source changes are not. This check may reject an unreadable design
before full renderer investment.

Record source/candidate versions, identity/entitlements, origin/profile, fixture format and observed
values without exposing secrets. Follow the existing identity/version owners. Before foundation
selection, also seed held-picture records with the same app ID from a current-main source that
actually contains that store. Read its real IndexedDB bytes, metadata and missing/stale hints
through the retained reader; record this as unreleased source feasibility. For the applicable
released fixture, enumerate coloring-pack files, verification markers, job identities and
background-session ownership, and document the preservation/reconciliation path without deleting or
restarting source work. A scheme handler/profile configuration must demonstrably reach the legacy
WebView origin.

This local check does not establish physical lock/accessibility behavior, Play/TestFlight lineage,
transactional import, later source formats or the full source matrix below. Retaining the hybrid
WebView eases continuity only when its effective origin/profile and native namespaces actually
remain compatible. All full signed acceptance results remain pending.

## Same-ID signed upgrade evidence

Candidate artifacts come from an exact reviewed codex/native-migration integration commit after
their unit PRs are merged into that branch. Unreviewed unit heads cannot produce store-track upgrade
evidence. Record source/candidate commit, artifact digest and embedded versions, signing
certificate/ team and keychain entitlements, channel, OS/device, seeded state, observed result and
artifact links. Read-only fixtures supplement in-place previous-artifact upgrades; they do not
replace them.

| Channel                                                                                                                        | What it proves                                                                    | Remaining requirement                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Android tag-built previous APK and integration candidate APK, both signed with the same local upload key and production app ID | Native data/Keystore/WebView continuity across the implementation change          | Matching local upload keys does not establish matching the Play-held app-signing key or prove a Play-installed app can update. |
| Android existing Play install to a reviewed candidate on a Play testing track under the existing app                           | Actual Play signing lineage, server allowance and store-installed data continuity | Verify existing certificate/lineage and track history; internal app sharing re-signs with another key and is not this proof.   |
| iOS tag-built previous and integration candidate, same registered app ID/team/access groups and compatible device provisioning | Data, Keychain and WebView continuity across the implementation change            | Does not establish App Store/TestFlight distribution; confirm the oldest actual distributed source separately.                 |
| iOS existing distributed install to candidate through TestFlight under the existing App Store Connect record                   | Actual distribution/app/keychain continuity                                       | Verify distribution history, signing entitlements and in-place update; installability/review status is separate evidence.      |

[Play App Signing](https://developer.android.com/studio/publish/app-signing),
[internal sharing signing](https://support.google.com/googleplay/android-developer/answer/9844679),
[TestFlight](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/).
Signing and distribution-channel validation remain pending; a local upload-key fixture is useful
continuity evidence but cannot be relabeled a store-lineage pass.

Before any candidate upload, reconcile the latest main release values, consumed values in both store
consoles and all campaign reservations. Reserve a unique monotonic value above that shared maximum
in the canonical release/version record through
[cut-release's version-code policy](../../tools/release/cut-release.mjs) and
[native-version.mjs](../../tools/release/lib/native-version.mjs); the existing owner must write both
native targets, including reviewed candidate path support when needed. Publish the reservation to
the shared release train before uploading so main's next release advances beyond it. No manual
Gradle/Xcode bumps, separate candidate counter, reused failed-upload number, or simultaneous
main/candidate reservation is allowed. Inspect embedded versions before upload and record the
consumed reservation even if distribution or review fails. The current writer only compares local
files; remote channel/reservation reconciliation is a required preceding step, not a capability it
already implements. Marketing-version/channel rules require the corresponding store inventory.

| Scenario                          | Acceptance                                                                                                                                                                               | Status  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Source matrix and artifacts       | Each applicable source class upgrades; any collapse has format evidence; store history, digests and embedded versions are verified.                                                      | Pending |
| Conflicting live/durable settings | Newer local choices win; missing local values recover from Preferences; stale/missing mirror and interrupted local export do not bypass gates.                                           | Pending |
| Pending/superseded removals       | Applicable source tombstones union; a newer local write survives; absent local/pending deletion cannot restore stale durable data; concurrent settlements preserve later requests.       | Pending |
| Untombstoned removal ambiguity    | Released absent-local/present-durable cases follow reviewed source recovery/vault precedence; evidence states what cannot be inferred.                                                   | Pending |
| Secure/plaintext credentials      | Released iOS accessibility loads and hardens atomically; update/read failures retain recovery; successful secure persistence precedes plaintext scrub; source-specific removals survive. | Pending |
| Partly spent installation grant   | Source/replacement pseudonyms match and the server retains spent allowance in the tested signing channel.                                                                                | Pending |
| Held failed-save pictures         | Applicable sources retain exact bytes through upgrade/interruption/Settings return/repeated launch without loss or duplication.                                                          | Pending |
| Installed/partial coloring books  | Applicable sources keep complete offline books; corrupt/incomplete books stay hidden; unchanged content is retained.                                                                     | Pending |
| Background work during upgrade    | Source scheduling/session identifiers resume or reconcile safely; disabling/removing cancels work without stale restoration callbacks.                                                   | Pending |
| Services/lifecycle and floors     | Back, gates, Pencil, photo denial/recovery, orientation, audio, connectivity and background/rotation behavior pass on declared floors and optimized physical release targets.            | Pending |
| Channel/version reservation       | Local continuity and actual store lineage are separately verified; reviewed integration artifacts consume reserved monotonically increasing native versions.                             | Pending |

Physical access, signing/channel history, native dependency compatibility, legacy artifact recovery
and the replacement audio implementation are unverified. Host tool availability and published
artifacts do not establish their acceptance. Resolve these through canonical mobile/ capture/release
workflows while independent implementation work proceeds.
