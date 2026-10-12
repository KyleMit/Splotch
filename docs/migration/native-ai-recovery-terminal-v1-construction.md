# Checked terminal recovery construction

This source delta completes the schema 3 checked terminal path described by
[native-ai-recovery-v1-construction.md](native-ai-recovery-v1-construction.md). It is source
construction only. Both production rollout guards remain unconditionally closed. No fixture,
environment value, capability reply or terminal header opens either guard. Integrated source checks
do not establish platform, provider or deployment qualification.

The shared `web/src/lib/ai/generationAttempt.ts` owns the exact opt-in request header, proof code,
finite status/outcome mapping and strict parser. The header changes only reply shape on schema 3
collect/admit/reconcile requests; capability and ACK exclude it. Schema 1/2, the default schema 6
store, legacy GET replies and the ACK body retain their contracts. Admission and reconcile preserve
the original identity, creation, credential binding, fingerprint and first expiry. There is one raw
POST per local attempt, no automatic resend, no claim takeover and no fallback generation.

The store's `lookupStatus` authenticates original persisted metadata before comparing server time
with its immutable expiry. Expired lookup returns identity/expiry only. Missing metadata remains
absence, an unrelated credential remains conflict, and a read failure remains unavailable. GET does
not read expired bytes or mutate records, accounting, reporting, dispatch or providers. Reconcile
refusal/error requires the stable accounting owner's confirmed failure outcome/receipt and an exact
original-record reread before returning proof. An advisory 202 status cannot finish the local
attempt.

`recordRecoveryTerminal` binds the currently owned receipt to that proof, permits only
submission-uncertain/admitted/identical-terminal transitions, and confirms IDB/native persistence
before publication. Delivery-pinned, retained and acknowledged states cannot become terminal.
Committed receipts are published even if parent permission is revoked while storage completes.
Unknown write completion invalidates ownership until authoritative reread; the original and held
predecessor stay readable. Credential-generation leases, consent and action checks remain at each
asynchronous controller boundary. These facts do not grant permission for another send.

Android and iOS use their existing serialized journal, exact selector, immutable metadata and
publication/readback owners. The dispatch inventories, omitted-token and ordering controls include
the new operation. Both AI and composed product recipe entries contain the exact new journal bytes
and their existing `INPUT_SHA256` chains. Historical baseline/patch entries are preserved. The two
owned AI addition provenance records are updated as source metadata; ROOT must verify them against
`expectedNativeProvenance` after integration. No template, archive or unrelated native target is
replaced.

Authored negative controls cover forged/missing identity, creation, expiry, outcome, protocol and
response metadata; malformed opt-in values; generic expired/auth/absent/store failures; duplicate
raw reconciliation; wrong failure settlement; expired metadata lookup with zero accounting,
authorization, provider, report, byte-read and mutation calls; terminal replay/conflict; prepared
and stale receipt rejection; delivery-pinned/retained/ACK downgrade; committed writes after
revocation; lost callbacks; delayed consent/close/vault invalidation; legacy responses and closed
guards. These sources require execution against the integrated owners before they establish a
passing guard.

Refusal reporting is deliberately unchanged. Server `RecoveryService.reconcile` still issues the
existing authenticated refusal reason/report header. `parseRecoveryResponse` returns only terminal
proof to `AiRecoveryBoundary.acceptReply`; it does not pass that report token into
`AiReportOwner.prepare` or `AiReportOwner.refuse`. Those owners require original drawing/session
context and a credential binding; a restored terminal receipt does not establish that context.
Carrying the validated refusal token and original context through recovery, restart and the report
owner remains a separate hook requiring a bounded design and qualification. No report is sent here.

Open qualifications include independent review and integrated type/format/test checks; Kotlin/Swift
compilation and genuine platform persistence/readback; process death, fsync/F_FULLFSYNC, protected
storage, full-image decoder and lifecycle behavior; cross-tab/native external vault changes; hosted
Blobs strong/CAS/lost replies; all historical/rollback ledger writers; retention/deletion/privacy,
capacity and deployment approval; and provider availability/billing behavior. A permanent claim
limits application calls but does not promise exactly-once provider billing. None of these are
established by source hashes, fixtures, earlier baseline builds or this packet.
