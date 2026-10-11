# Native hosted AI generation candidate

This private unit starts at Feedback commit 10422f03c948ccf22faea2a4021fdd0d061391fe. It adds a real
AI picture action to both maintained drawing screens. A parent completes the existing arithmetic
gate, reads the upload disclosure, selects one of the canonical eight styles, and explicitly sends a
drawing. Opening the panel requests allowance only after parent authorization.

The drawing surface locks input while capturing its immutable drawing at the canonical paper size.
Preparation bounds the PNG bytes and checks its fixed dimensions. The original editable drawing is
saved before any upload. AI results remain separate files; they never replace drawing history or a
new draft. The panel shows retained results and the local gallery.

The free route uses the server's ten-success grant and a platform-derived SHA-256 pseudonym with the
ADR-0105 namespace. Android app-scoped ID and iOS vendor ID stay inside the native bridge. The
client never decrements an independent allowance. Missing identity, unreadable credentials,
unavailable grant storage and exhausted allowance fail closed.

## Request and recovery ownership

The finite API boundary matches `docs/API.md` and the real route handlers: raw PNG upload, style
query, credential precedence, asynchronous start ticket, empty pending polls, bounded image and JSON
streams, free exhaustion, safety refusal, unavailable status and `Retry-After`. A generation POST
runs once per explicit send. Closing or backgrounding revokes unsent permission and stops scheduled
polls. It does not imply server cancellation. Polling can resume after another parent gate.

A checked journal is published before upload. Tickets and collected pictures are retained locally.
Timeouts and invalid or lost replies hold the attempt as uncertain rather than automatically funding
another request. A late reply is still collected; an earlier attempt's picture is retained
separately if a parent has released its expired attempt and explicitly started another. Publication
is serialized and a completed result cannot be reverted by a late uncertain reply. The server
retention window is 20 minutes; releasing an expired attempt requires another parent challenge.

A local write failure retains received bytes in memory and exposes a local-only retry. The panel
asks the parent to keep the app open. Force termination while a result exists only in memory cannot
be qualified as durable retention. The hosted collection endpoint deletes delivered jobs before any
client acknowledgement, so process death between delivery and a confirmed local write remains an
end-to-end recovery limitation. Original drawings and durable recovery intent remain on device.

## Secure service setup

Both UIs call the production verification owner for managed codes and BYOK, then write only through
the native secure bridge. Secret inputs clear before verification. Credential values never enter
journals, ordinary files, app state exposed to rendering, localStorage or diagnostic messages.
Unavailable verification does not overwrite a saved credential. Secure read/write/remove errors do
not become an empty vault or switch silently to the free tier; each mutation requires readback.

The iOS source uses non-synchronizing Keychain generic-password items with
`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`. Android uses an AndroidKeyStore AES-256 GCM key and
bounded encrypted AtomicFile records under `noBackupFilesDir`. The bridge exposes only two fixed
historical slot names. There is no insecure fallback and no additional dependency.

Primary platform references consulted:

* [Apple Keychain attributes](https://developer.apple.com/documentation/security/item-attribute-keys-and-values)
* [Apple device-only unlocked accessibility](https://developer.apple.com/documentation/security/ksecattraccessiblewhenunlockedthisdeviceonly)
* [Android Keystore](https://developer.android.com/privacy-and-security/keystore)
* [Android key generation parameters](https://developer.android.com/reference/android/security/keystore/KeyGenParameterSpec)

The native extension has exactly five targets: two authenticated baseline registration edits and
three new bridge sources. `native-ai-source-extension.json` records exact baselines, substitutions
and output hashes. Existing template bytes and the original template manifest remain intact;
provenance replay rejects changed baselines, aliases and preexisting additions. Source checks do not
prove native compilation, bridge registration at runtime, OS security or device behavior.

## Controlled validation and remaining work

Controlled tests drive the real controller, RN drawing screen, released RSD native renderer,
production secure adapter and actual hosted route handlers with local fixtures. Provider starts are
stubbed and explicitly forbidden in handler fixtures. Deliberate faults target parent permission,
duplicate funded requests, response caps, snapshot dimensions, secure readback, late results and
finite native additions. Evidence receipts preserve first failures, fixes and byte-restored
controls. No real key, access code, platform identifier, environment secret or Keychain entry is
read.

The first scoped failures included a UI constant initialization order, a polling test that waited
for idle while intentionally holding a poll, an RN fixture lacking a surface lock release,
asynchronous mounted assertions and unchanged lint size limits. Repairs change the production
structure and correct the fixtures; they do not relax limits. Final actual exits and hashes live in
the sealed owner packet outside the repository.

This unit is source-only and unaccepted. Both OS builds, actual native bridge/security checks,
optimized runtime and physical qualification, parent modal/status composition, full test tier and
independent review remain open. It does not select a framework or complete the migration campaign.
The five campaign holds remain unchanged. Review identity is unopened at zero of three rounds.

The authorized test-only Feedback repair 94f2db4b6f7a723d63721e02b4d6ad48b82484fa is composed over
the immutable base across exactly its ten paths. Three-way composition had no conflicts and retains
both AI and Feedback boundaries plus the exact combined source inventory. This records source
composition, not acceptance of Feedback. Native provenance assertions were extended from the
original finite inventory to include the three authenticated bridge sources. The first dimension
fault failed through an unexpected exception; its corrected fault removes both dimension checks and
demonstrably fails the assertion. The first Markdown formatting invocation used an unavailable CLI
entry point; the installed binary succeeded. All seven final deliberate controls fail by assertion
and restore exact source bytes.

The original 643e candidate enforced byte caps, MIME type and PNG/JPEG/WebP signatures only. Its
complete structure and decoded resource bounds were open. The same-owner
[output admission repair](native-ai-output-admission-2865.md) adds bounded structural checks and
mandatory native full-decode admission; actual OS runtime qualification remains open. Separate
Feedback and AI parent gates and controller disposal lifetime remain explicit shared Parent Center
security and composition work. No claim of campaign permission composition is made.
