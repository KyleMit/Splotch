# Product UI migration

Live execution resumed on 2026-10-06. The
[public campaign register](CAMPAIGN.md#current-public-status-2026-10-09) owns current status,
source/review dependencies and acceptance. Host-local CURRENT mirrors pending draft execution and
lease receipts; accepted evidence stays committed or publicly linked. The pause checkpoint below
remains historical.

This campaign delivers the migration tracked by
[epic 2690](https://github.com/KyleMit/Splotch/issues/2690). The maintainer authorized Codex and
Claude to make decisions and complete the work autonomously, with independent review throughout. The
goal is a complete, integrated, tuned new drawing product across web, Android, and iOS. The
[authoritative fresh-start scope](CONTRACT.md#authoritative-fresh-start-scope) retires legacy beta
data transfer and exact old-UI parity across web/PWA, Android and iOS while retaining substantive
product, narrow credential security and release obligations.

The [functional development priority](CONTRACT.md#functional-development-priority) puts useful
native features and running feedback first. The next checkpoint is a phone development build by
2026-10-11 03:00 UTC, or a concrete device/signing blocker with a runnable emulator/simulator build
and local demonstration. Qualification and integrated tuning follow functional construction unless a
specific build, correctness or security requirement blocks the next feature. This sequencing change
preserves original review capacity and every applicable final cutover or retention gate.

React Native mobile with a shared web-capable product UI remains an architecture hypothesis. No
framework is selected; the [contract](CONTRACT.md)'s structural and evidence checks govern the
choice. Native drawing inside Capacitor and retention of the current Svelte/Capacitor product remain
explicit outcomes. React Native Web and React Strict DOM are candidates for the shared web
vocabulary; neither is selected. Flutter and separate native UIs remain conditional alternatives. A
complete React DOM rewrite is not a prerequisite to native work. Retention with unresolved costs or
unproved comparison evidence is recorded honestly and cannot complete unmet final gates.

## Campaign records

* [Continuation packet](../handoff/native-migration-continuation.md): paused state, recoverable work
  and the first steps for the next authorized session.
* [Preserved evidence and source](evidence/continuation/README.md): portable, hash-bound capsules
  and explicit local-only gaps.
* [Progress checklist](PROGRESS.md): accepted work, partial implementation, and remaining phase
  exits.
* [Migration contract](CONTRACT.md): scope, decisions, phase exits, and completion evidence.
* [Legacy baseline inventory](BASELINE.md): exact banked provenance, scoring limits and outstanding
  current controls.
* [Product acceptance](ACCEPTANCE.md): substantive capabilities, new-app behavior and scenarios that
  the selected implementation must satisfy; old UI arrangements remain design references.
* [Web contract](WEB-CONTRACT.md): startup, hosting, security, navigation, and offline boundaries.
* [Upgrade contract](UPGRADES.md): new-app services/data, safe fresh initialization, and
  same-identity signed update proof; legacy import inventories remain historical reference.
* [Phase 1 implementation sequence](PHASE-1.md): bounded units, evidence dependencies and review
  dispositions.
* [Plain drawing defaults](RENDERER-DEFAULTS.md): the first shared-owner extraction and its
  verification boundaries.
* [Dependency health](DEPENDENCY-HEALTH.md): the external audit repair and separately bounded
  embedded-code residual.
* [Magic work witness](MAGIC-WITNESS.md): causal observation, action-read boundaries and the
  diagnostic-only observer epoch.

Publish consequential source/review/acceptance transitions in the public register with exact source
and evidence bindings before relying on them. Local pending plans and lease observations do not
establish public acceptance.

The fresh-start scope governs applicability across these documents. They define pending
requirements, not claims that a candidate already passes. Existing tests and ADRs remain
authoritative until a reviewed change replaces or amends them. Keep evidence linked from the work
ledger instead of changing an unchecked requirement into an assertion.

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

The campaign paused on 2026-10-06 with eight accepted PRs on `codex/native-migration` at
dc08a90abc67b53124146bf288c80de0f9ffd1dd. This is an accepted-source checkpoint, not a completed
migration or a final architecture decision. The [progress checklist](PROGRESS.md) separates accepted
foundation work from pending product and release acceptance.

| Accepted unit                            | PR                                                   | Merge commit                             | Result and limit                                                                                                                                                                                                       |
| ---------------------------------------- | ---------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration and acceptance contracts       | [2691](https://github.com/KyleMit/Splotch/pull/2691) | d3d4203539143584bc1af96e7652fc7f39f3382b | Reviewed scope, parity, web, native and upgrade requirements; replacement validation remains pending.                                                                                                                  |
| Dependency audit repair                  | [2692](https://github.com/KyleMit/Splotch/pull/2692) | 1ceb97338eced2b280964a5a2257ce4933c489d6 | Patched the external source-map-js graph; DEPENDENCY-HEALTH.md bounds the separate embedded residual.                                                                                                                  |
| Portable drawing defaults                | [2693](https://github.com/KyleMit/Splotch/pull/2693) | d2e77431c4a06bcdea7fe33611a28edd43e8ada2 | Extracted plain value owners while preserving shipping state and startup budgets; this is initial shared groundwork.                                                                                                   |
| Architecture-check sequence              | [2694](https://github.com/KyleMit/Splotch/pull/2694) | d1402f6b2bedd2c30cbc88d30597466855b33874 | Reviewed bounded checks, fair alternatives, comparison limits and phase exits; it does not select the architecture.                                                                                                    |
| Read-only Magic work witness             | [2695](https://github.com/KyleMit/Splotch/pull/2695) | e5ab28af553a55841aac35c938fc7b0e19ec9ba7 | Added contained observation without changing scored activity; physical attribution and any suppression remain pending.                                                                                                 |
| Shared SvelteKit version owner           | [2698](https://github.com/KyleMit/Splotch/pull/2698) | 5ccf8cb1475ba945235bada82c96458a223ccc06 | Corrected build-version agreement before combined topology acceptance.                                                                                                                                                 |
| Cached Netlify production-install repair | [2699](https://github.com/KyleMit/Splotch/pull/2699) | cbb104976d0840611dff7f5188b9b8712050fe6a | Merged into the topology unit; actual nonproduction hosted installation and release build passed.                                                                                                                      |
| Isolated Expo candidate package topology | [2697](https://github.com/KyleMit/Splotch/pull/2697) | dc08a90abc67b53124146bf288c80de0f9ffd1dd | Preserved shipping web/Capacitor ownership; full local tests, applicable CI, shipping Android/iOS compilation and combined nonproduction Netlify proof passed. The React Native candidate has not compiled or mounted. |

The combined topology acceptance is bound to reviewed source
9442b27817a61486750b070ff07c880d124571a6 and its resulting merge above. PR 2697 records final Claude
agreement, resolved findings and exact-head acceptance. Eighteen applicable CI jobs succeeded; four
jobs were intentionally skipped by their workflow predicates. Shipping Android/iOS compile results
are not React Native candidate results. Hosted observations establish successful production
installation, release guards and a live version resource; the bounded rendered log capture is not a
complete raw build log.

Two isolated units were preserved at the pause. Retained Svelte controls at
8ddfc04053ccdf285c2f6fd7c2b75e745a9d2fc6 passed release and delayed-hydration browser checks,
repeated-evidence preservation and nine negative-control categories locally. Their CI integration,
final source validation, PR and resumed Claude review remain pending. Native candidate template
sources and registration are prepared locally but unvalidated. Neither unit has joined the accepted
integration branch. The [continuation packet](../handoff/native-migration-continuation.md) owns
recoverable files, local-only gaps, review continuity and the refreshed branch/PR state; do not
infer acceptance from preparation.

Update this ledger in each reviewed unit. Preserve failures and rejected assumptions beside their
dispositions. Main continues moving during the campaign: reconcile its product changes into the
integration branch at phase boundaries and before cutover, using `reconcile-with-main`, and refresh
dependencies after dependency changes. A new shipping feature joins the acceptance inventory before
the selected implementation can claim complete product acceptance, with any concrete feature change
reviewed and recorded.
