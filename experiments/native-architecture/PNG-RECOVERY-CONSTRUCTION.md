# Durable failed-PNG recovery construction

This is the bounded failed-PNG export recovery slice of PHASE-1 unit 6. Its owner is
`/root/drawing_save_lifecycle`. The isolated source base is
8d5deeb64cd300dbb238f79c7b0288ba6111b72e, tree 1d37632348193a3e8dc0c3751b3030ceab7a94b3. It is a
provisional candidate feature, not framework, native-product, integration or release acceptance.

The authority is [PHASE-1 unit 6](../../docs/migration/PHASE-1.md#bounded-units-and-dependencies)
and [failed-save and lifecycle acceptance](../../docs/migration/ACCEPTANCE.md). Basic N1
save/reopen/export behavior does not complete exact unsaved-picture retention and retry.

## Bounded behavior

The new recovery owner receives an already captured PNG, validates its bounded record, assigns one
stable filename, and persists the exact bytes before asking the platform to hand it off. A failed or
unconfirmed handoff remains available through Try again and per-picture Dismiss. Restart restores
held records without automatically opening a share sheet or download. Retry never recaptures the
current canvas, and mixed outcomes retain each unresolved picture independently. A share sheet
closing or a browser download request does not prove an external save, so both remain held until
explicit dismissal. Identical held PNGs are deduplicated. Capacity refusals leave the drawing intact
and explain how to release space.

Persistence failure keeps the exact PNG in this screen's memory with an explicit session-only
warning. An unreadable archive is not overwritten by fresh state. Dismissal outranks pending
callbacks, and an unmounted owner cannot mutate its successor. A capture failure creates no
retriable PNG. Failure to persist dismissal is reported because an old recovery record may return
after restart. The installed system sharing API reports that its sheet closed, including
cancellation; it does not report that a destination saved a photo. Copy says the share sheet closed
and never claims a successful external save.

The native and web delivery adapters are consumers of the durable record and its stable filename.
The native journal refuses another revision if failed pruning has reached its bound; a later retry
can resume after old revisions can be removed. A dismissed record remains logically absent from the
latest verified archive even when an obsolete revision cannot be deleted. They use the existing
released file/sharing and browser download APIs. Both inherited N1 `src/platform/drawingFiles.ts`
and `src/platform/drawingFiles.web.ts` remain byte-exact. No dependency, package, lock, install
hook, native project or renderer/collector change belongs here.

Native delivery reserves a private attempt directory under a dedicated cache root, preserving the
record's stable basename. URIs offered to system sharing remain eligible for 24 hours from the URI
offer, including chooser cancellation, sharing rejection and process interruption. The delivery
cache has its own 32-attempt limit and a 24 MiB total PNG-byte limit, independent of the
three-held-record archive bound. New delivery is refused when eligible files fill either limit. Only
expired inactive attempts can be pruned; active leases remain protected beyond their age. Pre-share
failure can remove its private directory because its URI has not been offered. Restart retains
recent interrupted files and applies the same age/count/byte policy. A predecessor cannot delete its
successor's active file.

The retention policy bounds local storage; it does not prove an arbitrary receiver has completed
reading. Installed Android sharing resolves at chooser activity return, without destination-read
acknowledgment. Actual Android recipient-read evidence remains a pending delivery-lifetime gate. No
sheet-close or retention-expiry observation establishes a successful external save.

The recovery notice uses the candidate's existing design-token projection and accessible,
touch-sized actions. It is parent-facing, nonmodal and does not claim successful photo-library
delivery. Its new-product flow does not reproduce old UI layout requirements.

## Dependency and review boundaries

The source was copied through a local no-hardlink Git clone with checkout hooks disabled for that
bootstrap only. No automatic worktree setup, network fetch, install or native generation ran. The
coordinator separately authorized one finite no-install COW copy. Its custody receipt records
byte/mode/link equality, contained links, and independent regular-file inodes. The coordinator
accepted that custody and separately authorized ordinary source checks; no dependencies are shared
through writable symlinks or hardlinks.

This unit has an unopened original three-round independent-review allowance: zero used, three
remaining. The original conversation and ledger must be registered before its first substantive
Claude review. No review has started. N1 retains its original three-used, zero-remaining ledger,
optimized both-OS structural obligations and dependent-integration hold. This unit cannot repair an
exhausted N1 defect under a new reviewer or count its pending evidence as accepted.

## Required verification

Tests must drive production owners and the mounted controller. They cover exact captured bytes after
later drawing/Clear, restart restoration, malformed/oversized/partial/unreadable archives,
deduplication, mixed retry outcomes, failed persistence, capture refusal, dismissal, unmount and
late/newer-request ordering. Actual native adapter tests defer cache write, readback and sharing
availability: dismissal, unmount and a successor owner prevent a late share sheet. Existing N1
adapter blobs receive a source drift guard. Cache tests cover cross-owner overlap, repeated
export/dismiss beyond the held-record limit, restart retention, failed cleanup and actual count,
byte and age refusal. The mounted harness evaluates the actual idle Pressable style so hit-size
assertions inspect production styles.

Prettier, dprint, native candidate TypeScript, `npm run check`, repaired `npm run lint`,
`npm run format:check` and `git diff --check` have exited zero. Native TypeScript and lint were
rerun after the retention-policy repair. The first lint failure is preserved: the added status owner
exceeded the drawing screen's line cap, and test assertion shapes violated lint rules. The status
owner was extracted, the assertions were repaired, and affected formatting, native TypeScript and
lint were rerun. `npm run info` itself exited zero; its separate process-ownership helper remained
FAIL/HELD on an exact-title drift, and that result is not promoted to a closure success.

The scoped tools invocation passed 113 tests in 14 files: the five new PNG files, six modified
existing test files and three inherited consumers of the shared mounted harness. Ten temporary
in-memory transform controls each produced actual failed assertions: removing an unconfirmed record,
accepting CRC-valid malformed IDAT, omitting pre-share cancellation, deleting an offered cache file
immediately, pruning active successor files, shrinking the actual hit target, corrupting delivered
bytes, omitting the offered-time refresh, ignoring the byte cap and allowing a thirty-third retained
attempt. Product source fingerprints remained exact through these controls. The clean scoped rerun
again passed 113 tests in 14 files. The first negative launch stopped before tests on a duplicate
configuration flag; that startup failure is preserved separately from the actual mutation failures.
Temporary configs then ran through the owned installed Vitest with pinned Node.

The first full tools tier exited one: three coordinate cases used an existing screen mock that
omitted PNG recovery, and one exact candidate-source inventory omitted the seven new production
files. That failed receipt remains sealed. The mock imports the production initial state, and the
inventory explicitly lists the added paths; importer policy and its negative controls are unchanged.
The affected 88 tests passed, followed by native TypeScript, app checks, lint, format and whitespace
checks. The full tools rerun exited zero: 8,930 tests in 404 files. Source fingerprints stayed exact
through both full runs, and fresh readbacks found no remaining recorded process-group members or
observed process births. This source-test evidence does not establish native receiver lifetime.

Other full tiers, builds, real-app runtime validation, publication and independent review remain
pending. Normal checks and hooks remain required before reviewable commits and publication. Later
real-app checks require their own bounded allocation and exact source receipts. Native execution and
physical/release evidence remain separate gates.

Local JSON-save recovery, ordinary ink/history navigation/remount/background lifecycle, gallery
destinations and permissions, secure credentials, surviving prior work, fair architecture
alternatives, hosted web/API/admin, signing and release remain open. This slice does not complete
unit 6 or the migration campaign.
