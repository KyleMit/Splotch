# Recovery v1 construction

The private beta implements the storage and allowance foundations of the
[proposed delivery recovery contract](native-ai-output-admission-2865.md). This is construction
evidence; recovery activation and native durability qualification remain open. Existing generation
routes and the legacy job store retain their current contracts.

`web/src/lib/ai/generationAttempt.ts` owns the v1 wire vocabulary. The isolated
`ai-generation-attempts-v1` store pins the exact input fingerprint, authenticated credential
binding, first server admission and original expiry. Strong conditional writes and mandatory ETags
protect every transition. A permanent worker claim permits at most one application provider
invocation; a crash can leave an unavailable outcome. Collection is read-only. An image delivery
pins exact bytes and a receipt; explicit ACK records its tombstone before attempting byte deletion.
Unknown write replies require exact authoritative readback.

Recovery uses the existing installation allowance and UTC daily provider-start counters through
stable operation receipts. Legacy writers preserve those receipts. Reservations, denied admissions,
daily charges, settlements and abandonment replay their first recorded outcome without spending
another allowance. Cross-key writes are not a transaction, so a daily charge can remain spent
without a funded worker. Delivery must check whether a late success was already settled as
abandonment.

Every reachable historical or rollback deployment that can write the shared allowance records must
preserve these fields before activation. Draining running old handlers alone is insufficient: an old
normalizer can read a fresh ETag and erase receipts with a valid conditional write. Disabling new
admissions does not protect receipts already written. A separate counter would grant another
allowance and is not an acceptable workaround.

The proposed image/identity retention is original admission plus twenty minutes, with an additional
twenty-four-hour identity/ACK tombstone horizon. Actual byte deletion follows ACK or a successful
scheduled sweep, with possible cleanup delay. Grant receipts outlive their original allowance lease
by twenty-four hours; count caps reject new operations rather than evict live replay protection.
Idle receipt cleanup, the scheduled v1 sweep, capacity/error monitoring and privacy policy remain
activation work. The SDK materializes stored bodies before applying local size checks, and a full
sweep's traversal and deduplication set grow with the store.

The local client construction preserves held schema 2 without granting upload permission. A newly
approved send requires a fresh schema 3 attempt and copies verified pinned input. Native/IDB
retention, exact ACK confirmation, process-death and credential/permission lifecycle qualification
must be reviewed together before enabling the protocol. Neither a capability response nor a
successful fixture test permits activation.

The local schema 3 request owns a separate held predecessor, fresh identity, original expiry and
immutable delivery tuple. Submission is recorded before one raw POST. Browser transactions and
native journal owners pin delivery metadata before retaining exact bytes, confirm stored bytes and
full image admission before ACK, and accept only the shared HTTP 200 acknowledgement. Unknown
callbacks require an authoritative reread. A retained restart can retry that exact ACK under fresh
parent permission; it cannot generate again.

The controller checks parent proof, consent, current receipt and a credential generation lease at
asynchronous boundaries. Actual platform vault writers revoke leases synchronously; pinning returns
only its own still-current lease. Browser referenced reads use existing key/seed state without
initialization. External vault changes across tabs or native clients still require qualification.
The local API cannot yet durably record checked expiry or an immediate reconcile refusal/error
without a checked admission tuple, and recovery refusal-report provenance remains unfinished. These
cases retain the hold and original instead of granting retry authority.

Both client network guards and explicit send/reconcile/ACK controls remain closed. Source guards,
transaction fixtures, failure controls, type checking and syntax parsing do not establish OS crash,
protected-storage, decoder or lifecycle acceptance. The native source recipes include the same
journal sources and beta launcher labels so replay and fresh builds use the reviewed source.
