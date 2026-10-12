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

Current-session refusal reporting is described in the
[recovery report construction](native-ai-recovery-report-v1-construction.md). The transport retains
bounded report proof only with the checked authenticated refusal tuple. The report owner captures
verified original upload, style and the exact saved credential reference during an explicit send; it
adopts refusal evidence only after terminal persistence. A separate image-report parent gate,
consent epoch and final send confirmation still apply. Refusal reports contain no output picture.
This context stays in memory. Restarted terminal receipts and older receipts without that original
context are honestly unavailable for reporting; no journal schema or restart reconstruction hook is
added. A terminal state never grants retry permission.

ROOT reports that the integrated 3492 source checks passed and that the a69f source passed the 3493
Kotlin Release compilation and Swift parse-only checks. Those results apply to the baseline. ROOT
separately executed the integrated 3494 report delta: all 166 focused/legacy tests, 716
recovery/storage/provenance tests and 11 mounted UI tests passed. Four deliberate production
mutations failed the intended assertions, and exact restoration plus the focused rerun passed.
Native TypeScript and the web type check also passed. These are source and host-fixture checks, with
the platform and deployment qualifications below still open.

Open qualifications include independent review, full iOS compilation and genuine platform
persistence/readback; process death, fsync/F_FULLFSYNC, protected storage, full-image decoder and
lifecycle behavior; cross-tab/native external vault changes; hosted Blobs strong/CAS/lost replies;
all historical/rollback ledger writers; retention/deletion/privacy, capacity and deployment
approval; and provider availability/billing behavior. A permanent claim limits application calls but
does not promise exactly-once provider billing. Source hashes, fixtures, syntax parsing and earlier
build results do not establish these qualifications.
