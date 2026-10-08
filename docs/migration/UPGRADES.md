# Native services and upgrade acceptance

The [authoritative fresh-start scope](CONTRACT.md#authoritative-fresh-start-scope) governs this
contract. Android and iOS replacements must satisfy new-app service/data reliability, same-identity
signed update installability and safe fresh initialization. Legacy beta settings/data import is
retired. Every active acceptance result below is pending. Development apps installed beside the
shipped app provide useful isolation but cannot establish update installability.

Legacy inventories and import procedures below remain historical reference, including their exact
source/artifact observations. Their historical pending status is not an active data-transfer gate.
They do not waive current secure storage, authorization, permissions, failed-save recovery,
offline/lifecycle, background-work safety or release quality. Later updates protect data created by
the new product; the fresh-start exception applies to the beta-to-new-product transition.

Native fresh initialization must satisfy the narrow
[abandoned-credential security disposition](CONTRACT.md#abandoned-credential-security): known
abandoned sensitive entries are removed/invalidated or retained behind a reviewed protection/risk
disposition, with safe failure/interruption and no later reactivation. Installation allowance
identity remains intact. This does not revive source-by-source credential transfer, the full L0
import matrix/iOS-reader workload, or broad deletion of inert drawing/pack data.

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

Freeze the oldest actual distributed source, latest source at cutover and every source distributed
during the campaign, with artifact digests/embedded versions, signing/entitlements and channel
history. Cover supported skipped-update paths; combine sources only with evidence of equivalent
signing, installability and initialization behavior. Missing distribution history does not establish
that nobody installed a source. This active update inventory is required even though its legacy
settings/data import fixtures are retired.

## Historical legacy-source inventory

The source-by-source import matrix and preservation instructions in this section are retired under
the fresh-start scope. Its byte/tag/source facts remain unchanged. Active channel proof below uses
actual supported distribution history and applicable installed sources for signing, update
installability and safe initialization; it does not require every historical format import fixture.

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

### Verified published bytes and tagged source

The [2026-10-06 inventory](evidence/upgrade-artifact-inventory/README.md) qualifies all ten native
binaries attached at its 16:30 UTC metadata observation against complete release metadata and reads
their actual embedded versions with the unchanged release readers. It also freezes eight actual tag
commits, 364 selected source blobs and 1,199 searched production-source identities. These are
completed inventory checks; signed installs, effective origins, installed graphs and transactional
upgrades remain pending.

| Public tag | Tagged Android version / code | Actual attached AAB version / code       | Actual attached IPA version / code |
| ---------- | ----------------------------- | ---------------------------------------- | ---------------------------------- |
| v1.0.0     | 1.0.0 / 1                     | 1.0 / 1                                  | None                               |
| v1.0.1     | 1.0.1 / 2                     | 1.0 / 1; identical bytes to v1.0.0 asset | None                               |
| v1.1.0     | 1.1.0 / 3                     | 1.0.1 / 2                                | None                               |
| v1.2.0     | 1.2.0 / 4                     | None                                     | None                               |
| v1.3.0     | 1.3.0 / 5                     | 1.2.0 / 4                                | None                               |
| v1.4.0     | 1.4.0 / 6                     | 1.4.0 / 6                                | 1.4.0 / 6                          |
| v1.5.0     | 1.5.0 / 7                     | 1.5.0 / 7                                | 1.5.0 / 7                          |
| v1.6.0     | 1.6.0 / 8                     | 1.6.0 / 8                                | 1.6.0 / 8                          |

Preserve the literal oldest marketing version `1.0`; do not normalize it into a matching tag. The
four Android tag mismatches are real observations, not rejecting controls. An embedded version does
not identify the binary's compiled source or installed dependency graph, including where numbers
match. The IPA comparison reads embedded numbers; tagged iOS project versions and entitlements need
their own qualification. Keep both conservative tagged-source fixtures and the actual binary
variants until source/channel association is established; do not drop a source class because a
currently attached asset differs from its label.

The oldest eight persistent core owners are byte- and mode-identical, and their whole package lock
graphs match after excluding only root version metadata. Their root manifests also differ in
`build:cap`, and v1.0.1 adds the asset-stripping script; Gradle release versions differ. The fixture
collapse therefore covers the specified persistent core only. Native builds, source-to-binary
association, service behavior and runtime acceptance are not collapsed.

Freeze the package graph and every actual native lock separately. No Android Gradle lockfile is
committed in these eight trees. At v1.5.0 the package lock declares Capacitor core/iOS 8.4.2 and
Android 8.4.1 while the committed SPM lock declares capacitor-swift-pm 8.4.1. These source pins
cannot establish what an installed or compiled artifact consumed. Qualify the actual resolved plugin
implementations before relying on secure prefixes, payloads, accessibility defaults, installation
identifiers or effective WebView origins.

The same bounded source search finds no held-picture store/hint or pending-removal owner in any of
the eight tags. This supports the matrix's released-source applicability, not absence of arbitrary
runtime data. Current-main fixtures with those owners still need separate same-ID feasibility.
Historical admin credentials also need disposition: v1.0.x declares the plaintext admin-access slot,
while v1.2.0–v1.4.0 declares secure `admin-session`. Record historical bundle reachability and
web/admin applicability before retiring those owners; current native policy cannot answer that
historical question.

## Historical persistent-data import inventory

The transfer obligations and legacy read/hardening procedures in this section are retired
requirements. They remain reference for any consciously selected import feature, which would need
its own bounded plan and evidence. New-app credentials still require secure storage and tested
failure/lock behavior; new-app failed-save pictures still require exact durable recovery.

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

Legacy pack/file/job preservation and successor mapping described below are retired requirements.
The source facts remain reference for safe fresh initialization: surviving workers, launch hooks and
background callbacks must be cancelled or safely reconciled before they can affect new-app policy or
data. New-product pack integrity, offline content, cancellation and lifecycle behavior remain active
acceptance obligations; they do not require adopting the old directories or sessions.

The [frozen released owners](evidence/upgrade-artifact-inventory/README.md) at both v1.5.0 and
v1.6.0 use `coloring/<appVersion-resolution>/<bookId>`. Their nativeStore helper passes
`${manifest.appVersion}-${manifest.resolution}` to native status/install/remove. Android's released
plugin and iOS's released coordinator delete other version directories during `status()`. Calling
that method with a replacement version can delete legacy books before preservation.

The
[released iOS launch-owner amendment](evidence/upgrade-artifact-inventory/tag-owner-amendment.md.txt)
also binds a third destructive path. In both tags, AppDelegate calls `resumePendingDownload()` at
launch. If the persisted job's appVersion differs from the running bundle version, the coordinator
removes the whole version directory named by that job, removes the job and cancels tasks. This can
delete completed books before JavaScript starts. Fixtures passing through older upgrade chains must
account for any data already removed by that behavior. A reused launch hook must defer destructive
reconciliation until non-destructive enumeration and preservation finish; avoiding status alone is
insufficient. The accepted integration coordinator removes the mismatched job, but does not delete
its old version directory at this boundary. These are source facts pending actual installed-graph
and continuity execution.

First enumerate the actual old directories, markers, jobs and background ownership without invoking
destructive status or cleanup. Preserve verified bytes and source job identities before reconciling
to the selected replacement namespace. Released Android jobs live at `coloring/jobs/<bookId>.json`
and retain their own version in the worker input; released iOS keeps the `current.json` job beneath
runtime `coloring` → `jobs` and the existing wifi/metered background sessions. The separate
ColoringPackStorage class is a later source owner, absent from these tags. The current-source
resolution-only layout below remains a separate obligation for any distributed source that uses it.

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
background URLSession completion events. Extract the coordinator and rebind those callbacks with
non-destructive launch enumeration before reconciliation, without orphaning sessions. Preserve
metered-network policy, feature-disable cancellation, and offline remove.

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

## Early new-app storage and service feasibility

After the minimum native template, use real candidate-created data and service consumers to prove
save/export ordering, permission denial, secure read/write failure, exact failed-save picture
retention/retry and lifecycle teardown. Update a disposable installation in place under the same app
ID/local signing scope to verify safe fresh initialization and old-work cancellation/reconciliation.
Follow the existing identity/version owners, record actual source/build/consumer identities and
observed outcomes without exposing credentials, and keep installation allowance authorization
intact.

Legacy WebView origin/profile, settings/secret/picture imports and old job successor mapping are not
required. Local checks do not establish Play/TestFlight lineage, physical floors/lock behavior or
complete service/release acceptance. Full signed/channel and new-app reliability gates remain
pending.

## Same-ID signed upgrade evidence

Candidate artifacts come from an exact reviewed codex/native-migration integration commit after
their unit PRs are merged into that branch. Unreviewed unit heads cannot produce store-track upgrade
evidence. Record source/candidate commit, artifact digest and embedded versions, signing
certificate/ team and keychain entitlements, channel, OS/device, seeded state, observed result and
artifact links. Read-only fixtures supplement in-place previous-artifact upgrades; they do not
replace them.

| Channel                                                                                                                         | What it proves                                                          | Remaining requirement                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Android applicable previous APK and integration candidate APK, both signed with the same local upload key and production app ID | Local same-identity update installability and safe fresh initialization | Matching local upload keys does not establish matching the Play-held app-signing key or prove a Play-installed app can update.                   |
| Android existing Play install to a reviewed candidate on a Play testing track under the existing app                            | Actual Play signing lineage, server allowance and update installability | Verify certificate/lineage, track history and safe new-app initialization; internal app sharing re-signs with another key and is not this proof. |
| iOS applicable previous and integration candidate, same registered app ID/team/access groups and compatible device provisioning | Local same-identity update installability and safe fresh initialization | Does not establish App Store/TestFlight distribution; confirm applicable actual distributed sources separately.                                  |
| iOS existing distributed install to candidate through TestFlight under the existing App Store Connect record                    | Actual distribution/app identity and update installability              | Verify distribution history, signing entitlements and in-place update; installability/review status is separate evidence.                        |

[Play App Signing](https://developer.android.com/studio/publish/app-signing),
[internal sharing signing](https://support.google.com/googleplay/android-developer/answer/9844679),
[TestFlight](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/).
Signing and distribution-channel validation remain pending; a local upload-key fixture is useful
update evidence but cannot be relabeled a store-lineage pass.

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

| Scenario                                 | Acceptance                                                                                                                                                                          | Status  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Applicable channel sources and artifacts | Actual supported installations update in place; store history, signing lineage, digests and embedded versions are verified. Legacy format imports are retired.                      | Pending |
| Fresh initialization and old work        | Candidate starts with valid new-product defaults/data; surviving prior workers/callbacks cannot publish stale content, bypass policy or corrupt candidate state.                    | Pending |
| New-app storage and credentials          | Candidate-created data and secure credentials survive their declared lifecycle and later product updates; denied/full/locked/unreadable storage and interrupted writes fail safely. | Pending |
| Partly spent installation grant          | Source/replacement pseudonyms match and the server retains spent allowance in the tested signing channel.                                                                           | Pending |
| New-app failed-save pictures             | Candidate holds exact bytes through failure/interruption/Settings return/repeated launch and later product updates without loss or duplicate saving.                                | Pending |
| New-app coloring content/work            | Selected starter/downloaded content works offline; verified publication hides corrupt/incomplete books; disable/remove/background cancellation cannot restore stale work.           | Pending |
| Services/lifecycle and floors            | Back, gates, Pencil, photo denial/recovery, orientation, audio, connectivity and background/rotation behavior pass on declared floors and optimized physical release targets.       | Pending |
| Channel/version reservation              | Local update mechanics and actual store lineage are separately verified; reviewed integration artifacts consume reserved monotonically increasing native versions.                  | Pending |

Physical access, signing/channel history, native dependency compatibility, applicable
source-artifact association and the replacement audio implementation are unverified. Host tool
availability and published artifacts do not establish their acceptance. Resolve these through
canonical mobile/ capture/release workflows while independent implementation work proceeds.
