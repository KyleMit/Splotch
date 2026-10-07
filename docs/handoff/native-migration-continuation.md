# Handoff — native migration continuation

> 2026-10-06 · branch `codex/migration-pause-continuation` · Preserve the paused full migration for
> the next explicitly authorized session.

## Objective & non-goals

Resume and deliver the entire applicable [migration contract](../migration/CONTRACT.md), including
final Codex/Claude review, product parity, physical comparison, existing-user continuity, signed
upgrades, release readiness and reviewed cutover or retention disposition. The maintainer
prioritizes accuracy, fair alternatives, strong incremental delivery and maintainable code over
elapsed time or token consumption. A build, partial demonstration, framework selection or preserved
record is not completion.

**The campaign is paused.** The maintainer requested a clean stop, then authorized durable records.
This records-only branch does not resume implementation or create another chat. Await the next human
continuation instruction. Once explicitly resumed, prior authority covers routine architecture and
implementation choices, bounded workers, qualified local/device and nonproduction validation,
source/evidence commits and pushes, small PRs and accepted-unit integration into
`codex/native-migration`. Follow actual repository release/approval requirements for final cutover.

## State

Accepted integration is cf0c4254d025094054d7ea7faab110da11c96243. `main` was independently fetched
and observed at ef3d1eb2070c1bd0dee620ed42a2b14201c2a9b4. The canonical checkout remains clean at
feab24b13859d0328f158288fe9027330c09b748 on `codex/migration-upgrade-artifact-inventory`. The
records worktree is `/Users/kylemit/.codex/worktrees/migration-neutral-react/Splotch`. This branch
starts at the accepted integration and adds records only; do not merge it as acceptance of any
unfinished implementation.

The original preservation checkpoint 63c5f2f45a463774f50455041174f075abaa4af2 and accepted records
head 07f3c32c8edca883e240782ebd2e1d66ec81b046 remain ancestors of the integration. Their remote
branches `codex/migration-continuation-records` and `codex/migration-live-frontier-22` were deleted
after merging. Local tracking refs still exist and must not be mistaken for current remote refs.
Fetch the surviving integration history; recover by verified commit identity.

The [latest preservation package](../migration/evidence/resumption/paused-continuation/README.md)
owns portable source/evidence recovery. It preserves the original host-local live register and pause
frontier byte-for-byte, plus a fresh GitHub/ref/worktree observation. The original records still say
some source is host-local; that was true at the pause. The additive capsules now preserve selected
source bytes without changing those historical assertions. Raw provider conversations, actual
ledgers, authentication, signing keys and installed tool/dependency trees remain host-local.

| Unit                          | Accepted or unfinished state                                                                                                                                                                                       | Owner/source and next gate                                                                                                                                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original foundations          | Eight PRs established contracts, initial defaults, diagnostics, dependency repairs and Expo topology; shipping compilation passed within its recorded scope.                                                       | Original integration dc08a90abc67b53124146bf288c80de0f9ffd1dd. No RN execution or replacement-product acceptance follows.                                                                                                                                                             |
| Retained controls PR2702      | Accepted at 709fadd68ecb802aa2c9daa3fc197ce8d072b23c, after original review, seven calls, local gates and final-head CI.                                                                                           | Accepted retained source/evidence in its existing README. Changed-source refresh remains necessary when relevant inputs change.                                                                                                                                                       |
| Legacy owner inventory PR2706 | Accepted source/artifact inventory.                                                                                                                                                                                | Source feab24b13859d0328f158288fe9027330c09b748. Actual source/binary/channel associations and continuity remain open.                                                                                                                                                                |
| Hosted topology export PR2707 | Accepted at 78d844ce36845e13690e2ca4ee7fcd645eb128d0; complete installed census and supported export accepted narrowly.                                                                                            | Published source 34dc4650bf43a9fb12e7378bf4d73b6bc68ebb70. Later source/configuration/lock changes invalidate relevant receipts.                                                                                                                                                      |
| Records PR2709                | Merged at cf0c4254d025094054d7ea7faab110da11c96243, with original round-two acceptance and final CI.                                                                                                               | Records acceptance only.                                                                                                                                                                                                                                                              |
| F1 import boundary PR2703     | Draft, pushed at e4e9fc044d46d49c3565379a3e6419e8eff4af9d; guards and final CI passed, but changed final source lacks independent acceptance.                                                                      | Clean `/Users/kylemit/.codex/worktrees/3218/Splotch`. Original budget exhausted; required review-budget disposition is pending. Do not merge or grow dependent candidate source.                                                                                                      |
| L0 continuity PR2708          | Draft at b3b16831557dd894186574b9ce3b0c1184b2aab7. Local repairs retain a real pending merge of 78d; current accepted cf0 is not composed.                                                                         | `/Users/kylemit/.codex/worktrees/migration-legacy-continuity/Splotch`; staged tree35e2e8f09cef0c1a05c6516279b8ecf6e7ae2805. Latest suite: 56/58 passed, two unintended process-ownership `EPERM` failures; current check/lint unrun. Diagnose before retry; preserve merge semantics. |
| Neutral React host            | Fifty staged source paths at cf0, no upstream or implementation PR. Composition/source-input outcomes accepted narrowly; recorder/membership failures preserved; a single dprint hardlink addition was attributed. | `/Users/kylemit/.codex/worktrees/migration-retained-controls/Splotch`. Qualify the complete current installed graph, freeze source, run gates and original round two. No real React host/recovery acceptance.                                                                         |
| Native N1                     | Repaired frozen tree7da00012890a72e46eb5cdc390dab8c63f0035a3 is source-only, not a commit. Original dirty native70 remains at dc08. The proposed78d composition is unapplied.                                      | Original worktree `/Users/kylemit/.codex/worktrees/migration-native-source/Splotch`; repaired70 and runtime plans in the new native capsule. F1 acceptance precedes candidate materialization. No RN optimized compile/mount/draw acceptance.                                         |
| Java21 and native trust       | Java17/SDK/wrapper outcomes have narrow receipts. Complete DYLD coverage remains failed/open. Java21 first filesystem census and separate pure-reader outcomes do not authenticate or execute the installed JDK.   | New native capsule preserves failures, pure receipts, complete official release metadata and remaining artifact/signature/payload/runtime gates.                                                                                                                                      |
| Physical comparison           | No fresh physical calibration or matched comparison accepted. Last passive observation found no available Android/iOS capture devices.                                                                             | Re-enumerate resources after resumption. Hardware absence blocks dependent gates only.                                                                                                                                                                                                |

## Review continuity

| Unit            | Original Claude conversation         | Substantive rounds used / remaining                      |
| --------------- | ------------------------------------ | -------------------------------------------------------- |
| F1 PR2703       | bbe89d5b-644f-4d4f-9366-e5156cebf4ea | 3 / 0; acceptance held                                   |
| Retained PR2702 | b5bb0824-3f7a-4ad7-9e05-4e8e9af77333 | 3 / 0; accepted scope complete                           |
| Native N1       | 7c940639-09e2-4236-961f-1122171cb5d8 | 2 / 1                                                    |
| L0 PR2708       | 1b406e61-641e-4cf8-86fb-2b1cd7548469 | 2 / 1; final round reserved for executed native evidence |
| Neutral host    | 8c229c08-f640-4bb6-bf08-6953253da0ee | 1 / 2; actual PR-keyed adoption pending                  |
| Records PR2709  | 58bf2d80-5687-412e-857a-85df95b11146 | 2 / 1; accepted records scope complete                   |

Preserve actual identities, PR-keyed ledgers and unrelated ledgers. A fresh conversation or failed
resume fallback cannot satisfy continuation or reset a budget. Public findings/session metadata in
capsules do not transfer private provider state. Missing original conversation access is a genuine
external dependency; complete independent eligible work before raising it.

## Decisions made (and why)

Continue the conditional investigation. RN mobile with shared web-capable UI leads the hypothesis;
RN Web and React Strict DOM remain unselected. Native paper in Capacitor, RN with retained Svelte
web and retention with bounded remedies remain real alternatives; Flutter/separate native UI remain
conditional alternatives. A preliminary React DOM rewrite is not a prerequisite. Sunk effort and
reviewer agreement cannot choose the destination.

Refresh current motivating costs. Do not carry forward the blanket JS2ms premise or historical
Safari/WebView attribution as current native causality. Establish the common within-OS whole-screen
visible/readiness observable. Structural scenes can falsify premises; rank alternatives only at the
contract's matched fidelity/screen scope with intentional tuning and physical evidence. Keep the
193,523-byte runtime-only experiment versus the 75,000-byte lazy ceiling unresolved until a reviewed
complete-cost causal disposition; it is neither a full-host verdict nor a guard waiver.

Retain one accountable parent integrator and bounded runnable workers. Assign one unit owner through
source, execution, evidence and review repairs. The parent retains cross-unit decisions, integration
and final acceptance. Update one small unit/dependency/evidence register at meaningful transitions;
link receipts rather than multiplying private packets. Preregister common-horizon burden ranges;
inventory tool owners, update/failure triggers and retirement conditions. Existing burden records
retain their reviewed scope.

Name uncertainty, released owner, acceptance predicate, positive/rejecting/restored behavior and
claim limits before consequential probes. Ask Claude to challenge false passes, false rejections and
alternatives. Use evidence to resolve empirical claims. Lease shared host/device resources
explicitly and stop only owned processes. Do not repeat unchanged probes merely because integration
ownership changed. Complete structured exports are required for future hosted evidence.

## Unverified assumptions

Private provider conversations and installed tool graphs may have changed or become unavailable. No
original conversation was resumed while producing this handoff. Dependency/JDK/SDK trees were not
published; portable fingerprints describe old execution and must not be relabeled as a new install.
No hardware availability, capture lease or release qualification was established by this packet.

The cause of L0's two `EPERM` failures is unresolved even though the recorded launch requested host
execution. No intended rejecting-control pass follows from those failures. Current L0 check/lint,
neutral full source gates, native compile/runtime, signed continuity and physical comparison remain
unperformed. Source capsules are data, not plans already applied to current accepted owners.

## Done & verified

During preservation, fetched origin, independently read native GitHub metadata for PR2703/2708/2709,
verified live refs and checkpoint ancestry, and captured exact current source and semantic Git
state. The neutral50 and legacy47 working bytes, status and semantic index remained unchanged across
capture. Independent preservation inspection checked the original selected manifests, including
repaired native70 inner archive identities. The additive package manifest and validation receipt own
this packet's checks; historical full-suite successes keep their original source scope.

The campaign stopped at the requested clean frontier. Recorded owned processes were released, and no
migration host/device lease transfers to the next session. This handoff started no implementation,
browser, native, performance or rival execution. Both separately requested session-audit prompts
were supplied; no resulting audit of this resumed chat has been accepted or presumed complete.

## Risks & next 3 steps

1. After explicit human resumption, read `AGENTS.md` and the relevant skills; verify this pushed
   branch, surviving remote refs, PR state, every capsule/member and the preserved unit/review
   frontiers. Prefer suitable existing worktrees. Extract records into an owned empty directory.
   Recheck exact inputs before receipt reuse. Use `resume-handoff` to consume this transient packet
   only after verification; preserve durable evidence and repair links when deleting it.
2. Diagnose L0's actual failure without weakened guards; qualify scoped/check/lint on its exact
   pending merge, then ordinary current-base composition and final gates. In independent eligible
   work, qualify the neutral installed graph and source, then genuinely resume original round two.
   Obtain the required F1 budget disposition before dependent native source growth; do not launch a
   fourth or fresh review to bypass it. Preserve meaningful findings and failures before cleanup.
3. Continue the whole PHASE-1 dependency sequence: actual optimized Android/iOS candidate mechanics,
   current physical attribution/calibration and remedies, early same-ID continuity and ordered
   transactions/held picture/jobs, real neutral host and shared vocabulary/recovery, faithful
   drawing mechanisms and matched screen comparison. Then select a reviewed ADR and deliver every
   applicable product/UI/platform/web/API/admin/CSP/PWA/offline/accessibility, signed upgrade,
   full-product tuning, signed artifact, release and final Codex/Claude gate. Reconcile moving main
   at appropriate boundaries. Expand concrete checklist obligations as discovered; retire replaced
   owners only after evidence transfers their obligations. Do not mark completion at an intermediate
   milestone.

## Reread first

* [Campaign register](../migration/CAMPAIGN.md), [progress checklist](../migration/PROGRESS.md),
  [contract](../migration/CONTRACT.md), [phase sequence](../migration/PHASE-1.md),
  [acceptance](../migration/ACCEPTANCE.md), [web contract](../migration/WEB-CONTRACT.md),
  [upgrades](../migration/UPGRADES.md) and [baseline](../migration/BASELINE.md).
* [New pause recovery](../migration/evidence/resumption/paused-continuation/README.md), including
  copied LIVE-UNITS.json, exact final unit failures/plans and complete member manifest.
* [Original checkpoint recovery](../migration/evidence/continuation/README.md) and both complete
  independent reports in its advisory capsule: migration-progress-review-01a10e92/REPORT.md and
  session-coordination-audit-01a10e92/COORDINATION-AUDIT.md. Historical claims require live
  validation.
* The `resume-handoff`, `architecture`, `adrs`, `testing`, `mobile`, `run-rival-agent`,
  `reconcile-with-main` and applicable capture skills. Read actual release skills before release
  work.
* Optional raw audit input remains host-local:
  `/Users/kylemit/.codex/sessions/2026/10/06/rollout-2026-10-06T10-49-24-01a111b0-d64d-7c22-ab7d-865db89de7e2.jsonl`.
  Do not re-mine the whole transcript unless a material gap requires it.
