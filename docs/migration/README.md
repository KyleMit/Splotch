# Product UI migration

This campaign delivers the migration tracked by
[epic 2690](https://github.com/KyleMit/Splotch/issues/2690). The maintainer authorized Codex and
Claude to make decisions and complete the work autonomously, with independent review throughout. The
goal is a complete, integrated, tuned product across web, Android, and iOS, with existing-user
continuity.

The working direction is React Native mobile with a shared web-capable product UI. It remains an
architecture hypothesis until the [contract](CONTRACT.md)'s structural and evidence checks support
it. Native drawing inside Capacitor and retention of the current Svelte/Capacitor product remain
explicit outcomes. React Native Web and React Strict DOM are candidates for the shared web
vocabulary; neither is selected. Flutter and separate native UIs remain conditional alternatives. A
complete React DOM rewrite is not a prerequisite to native work. Retention with unresolved costs or
unproved comparison evidence is recorded honestly and cannot complete unmet final gates.

## Campaign records

* [Migration contract](CONTRACT.md): scope, decisions, phase exits, and completion evidence.
* [Legacy baseline inventory](BASELINE.md): exact banked provenance, scoring limits and outstanding
  current controls.
* [Product acceptance](ACCEPTANCE.md): behaviors and scenarios that the selected implementation must
  preserve.
* [Web contract](WEB-CONTRACT.md): startup, hosting, security, navigation, and offline boundaries.
* [Upgrade contract](UPGRADES.md): native services, persisted data, and same-identity upgrade proof.
* [Phase 1 implementation sequence](PHASE-1.md): bounded units, evidence dependencies and review
  dispositions.
* [Plain drawing defaults](RENDERER-DEFAULTS.md): the first shared-owner extraction and its
  verification boundaries.
* [Dependency health](DEPENDENCY-HEALTH.md): the external audit repair and separately bounded
  embedded-code residual.
* [Magic work witness](MAGIC-WITNESS.md): causal observation, action-read boundaries and the
  diagnostic-only observer epoch.

These documents define pending requirements, not claims that a candidate already passes. Existing
tests and ADRs remain authoritative until a reviewed change replaces or amends them. Keep evidence
linked from the work ledger instead of changing an unchecked requirement into an assertion.

## Branch and review discipline

`codex/native-migration` is the persistent integration branch. Each bounded unit branches from its
current reviewed head, opens a small PR against it, completes Claude review and applicable CI, then
merges back. This is a sequence of reviewed integration PRs, not a GitHub atomic stack. The final
cutover PR targets `main`; merge the integration branch's product changes into `main` only after the
relevant release gates pass. Keep the shipping Svelte/Capacitor app runnable during development.

Maintain exact reviewed commits and review dispositions in the unit's PR. Copy SHAs from command
output. Do not advance the integration branch with unresolved material findings or pending checks.
The native handler owns commands, changes, tests, GitHub writes, and device reservations; Claude
independently challenges assumptions and verifies the resulting evidence through `run-rival-agent`.
Codex subagents can investigate or implement bounded areas; they do not substitute for Claude's
independent review.

Review architecture decisions, implementation plans, meaningful completed units, and phase exits.
Use alternatives and causal evidence to resolve disagreement. Agreement alone is not a performance
result. Keep routine mechanical changes inside their unit rather than adding a separate ceremony for
each edit. Product-visible and compatibility decisions are delegated to the pair; record the
options, choice, recurring cost, and validation in the PR and relevant ADR.

## Work ledger

The contract landed in [PR 2691](https://github.com/KyleMit/Splotch/pull/2691), merged at
d3d4203539143584bc1af96e7652fc7f39f3382b after two Claude review rounds and 13 resolved findings.
Applicable CI passed except the inherited high-severity `source-map-js@1.2.1` audit failure
(GHSA-68fv-2mgg-jv7q). [PR 2692](https://github.com/KyleMit/Splotch/pull/2692) repairs the external
`source-map-js` graph and owns its independent-review and exact-head CI records. Local
frozen-install, audit, Quality, release-build, and full-test checks pass. Architecture selection,
candidate acceptance, and new physical-control results remain pending.

| Unit                          | State                  | Evidence and next exit                                                                                                                                                                                                                                                |
| ----------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture direction review | Conditional agreement  | Claude reviewed the complete proposal at ef3d1eb2070c1bd0dee620ed42a2b14201c2a9b4; see the contract's decision summary. No candidate performance was measured.                                                                                                        |
| Phase 0: migration contract   | Baseline inventoried   | Product, web, native, upgrade and acceptance boundaries are reviewed; BASELINE.md records banked provenance. Current physical controls, measurement mapping and remaining implementation plans are pending before the phase exits.                                    |
| Dependency health maintenance | source-map-js patched  | Targeted lock repair passes frozen-install, audit, Quality, release-build, and full-test checks locally. PR 2692 records independent review and exact-head CI. The embedded magicast residual is separately bounded.                                                  |
| Portable drawing defaults     | Plain owners extracted | Shared engine/state/Node values, release budgets and scoped verification are recorded in RENDERER-DEFAULTS.md. [PR 2693](https://github.com/KyleMit/Splotch/pull/2693) merged after two Claude rounds, full tests and green final-head CI.                            |
| Magic work observation        | Observer implemented   | PERF-only brush/worker/recode counters, six diagnostic spans and contained action reads preserve scored activity. MAGIC-WITNESS.md records contracts and limits; physical attribution and any A1 change remain separate reviewed exits.                               |
| Phase 1: architecture checks  | In progress            | Two complete Claude plan reviews refine the execution sequence. Portable drawing defaults are extracted; candidate structural proofs and physical comparison remain pending.                                                                                          |
| Phase 2: foundation           | Pending                | Runnable isolated candidate builds, shared behavior boundaries, native bindings, test/capture entry points, and CI.                                                                                                                                                   |
| Phase 3: drawing              | Pending                | Complete renderer/input/history/export/audio behaviors behind the selected platform boundary.                                                                                                                                                                         |
| Phase 4: complete product     | Pending                | Every applicable acceptance scenario has a selected implementation and test/evidence mapping.                                                                                                                                                                         |
| Phase 5: integrated tuning    | Pending                | Full canonical workloads, complete UI, matched physical-device controls, and release-gate evidence.                                                                                                                                                                   |
| Phase 6: cutover or retention | Pending                | Applicable target readiness, signed artifacts and upgrade proof, hosted deployment checks and final Claude review; reviewed cutover with retirement of replaced owners, or reviewed retention with remaining owners explicit. All final completion gates still apply. |

The ledger is updated in each reviewed unit. Preserve failures and rejected assumptions beside their
dispositions. Main continues moving during the campaign: reconcile its product changes into the
integration branch at phase boundaries and before cutover, using `reconcile-with-main`, and refresh
dependencies after dependency changes. A new shipping feature joins the acceptance inventory before
the selected implementation can claim parity.
