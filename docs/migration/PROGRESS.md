# Migration progress checklist

Status at the 2026-10-06 pause: the accepted integration checkpoint is
dc08a90abc67b53124146bf288c80de0f9ffd1dd. The full migration is incomplete and remains paused until
the maintainer authorizes continuation. The [work ledger](README.md#work-ledger) records the eight
accepted units. This checklist summarizes scope; the [contract](CONTRACT.md) and
[implementation sequence](PHASE-1.md) own acceptance and execution requirements.

A reviewed requirement is not a passing replacement implementation. Local preparation, compilation,
mounting, simulator mechanics, physical performance and release acceptance are distinct states.

## Accepted work

* [x] Review the initial architectural direction and alternatives. React Native mobile with a shared
      web-capable product UI is the leading hypothesis; RN Web and React Strict DOM remain
      unselected.
* [x] Define product parity, web hosting, native continuity and final completion requirements.
* [x] Inventory banked legacy evidence and identify missing controls, calibration and fidelity
      limits.
* [x] Review the bounded architecture-check sequence and comparison decision rules.
* [x] Repair the external dependency audit failure, shared build version and cached hosted install.
* [x] Extract initial plain drawing-default owners while preserving shipping behavior and budgets.
* [x] Add read-only Magic work instrumentation without changing scored activity.
* [x] Isolate the native candidate's package graph with reviewed dependency/script provenance and
      guarded shipping ownership.
* [x] Accept that package-topology unit through local full tests, independent Claude review,
      applicable CI, shipping native compilation and an actual nonproduction Netlify build.

## Partial work to finish before accepting its units

| Unit                                        | State at pause                                                                                                                                                     | Next acceptance condition                                                                                                                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Retained Svelte web controls                | Local committed source at 8ddfc04053ccdf285c2f6fd7c2b75e745a9d2fc6; release drawing, delayed hydration, evidence preservation and rejecting controls pass locally. | Integrate CI with a measured numeric deadline, run final-source Quality/applicable tests, open the PR, resume the original Claude review without resetting its round budget, and obtain final-head CI and independent acceptance. |
| Minimum native candidate sources            | Template and registration prepared locally; not compiled, mounted or accepted.                                                                                     | Compose current registration, validate source, review materialization/provenance, then build optimized Android/iOS candidates before claiming native feasibility.                                                                 |
| Neutral React web host and dependency route | Supporting research/prepared files only.                                                                                                                           | Add dependencies with real callers after the retained control is accepted; prove actual prerendering, retained ink, recovery, lifecycle and web contracts.                                                                        |
| Native toolchain/archive route              | Supporting source and data inspection only.                                                                                                                        | Verify actual archive receipts and execution boundaries before extraction or compilation; preserve the declared floor proof obligations.                                                                                          |

The [continuation packet](../handoff/native-migration-continuation.md) and
[preservation manifest](evidence/continuation/manifest.json) record exact recovery and review
identities. The local checkpoint data capsules preserve the partial work without accepting it.
Remote publication awaits human approval. These partial rows cannot be marked accepted from a
worktree snapshot, source receipt or planned test alone.

## Remaining architecture-check exits

* [ ] Capture current physical controls and establish the remaining motivating costs with calibrated
      common visible/readiness observables.
* [ ] Complete bounded shipping attribution and any separately reviewed behavior-preserving
      remedies. Instrumentation alone does not establish physical attribution.
* [ ] Compile and mount the released native candidate on both OSes; verify static graphics, input,
      runtime/toolchain choices and applicable OS floors.
* [ ] Prove early same-identity data/service continuity on disposable native installations.
* [ ] Prove the neutral web host and compare surviving RN Web/React Strict DOM vocabularies using
      actual web and native consumers.
* [ ] Implement faithful native paper in reviewed slices: crayon/Magic, input ownership, command
      cuts, history transactions, export and audio/service feasibility.
* [ ] Exercise retained Svelte UI/native paper and React Native UI/native paper fairly, with
      complete applicable drawing-screen state and matched mechanism checks.
* [ ] Obtain calibrated physical comparison and recurring-burden evidence; apply the registered
      selection rule and record the final reviewed architecture ADR before moving product ownership.

Native paper inside Capacitor and retention of the existing product remain valid outcomes under the
contract. Neither reviewer agreement nor successful compilation proves a performance improvement.
Structural checks can proceed while physical hardware is unavailable; physical gates remain pending.

## Remaining product and release work

* [ ] Establish the selected shared behavior/state owners, platform adapters, native bindings and
      reusable test/capture entry points.
* [ ] Deliver complete renderer, input, history, export and audio behavior on each applicable
      target.
* [ ] Deliver the entire product UI and map every [acceptance scenario](ACCEPTANCE.md) to its
      selected implementation and executed evidence.
* [ ] Integrate applicable native services, permissions, secure storage, downloads and lifecycle
      behavior; prove [source/channel upgrades](UPGRADES.md), including existing-user data
      continuity.
* [ ] Preserve [web contracts](WEB-CONTRACT.md): hosted APIs/admin, startup, CSP, routing, themes,
      accessibility, PWA and offline behavior.
* [ ] Tune the complete application with matched physical controls, canonical workloads, resource,
      thermal and long-session evidence; satisfy final performance gates.
* [ ] Reconcile current main and release lineage; validate signed artifacts, supported distribution
      channels and target readiness.
* [ ] Complete final Claude review and reviewed cutover or retention disposition; retire replaced
      owners only after their obligations have transferred and all applicable final gates pass.

These are requirement families, not equally sized tasks or a fixed percentage denominator. Each
implementation plan may add concrete scenarios or smaller slices as platform constraints become
known. Add discovered obligations with their reason; preserve completion evidence and keep unmet
requirements visible rather than changing the meaning of a completed item.
