# Handoff — native migration continuation

> 2026-10-06 · branch `codex/migration-continuation-records` · Preserve the paused migration for the
> next authorized session.

## Objective & non-goals

Continue the entire product migration tracked by
[epic 2690](https://github.com/KyleMit/Splotch/issues/2690) when the maintainer authorizes
resumption. Prioritize accuracy, alternatives, incremental review and maintainable code over time or
token consumption. Codex owns integration and execution; Claude is the independent rival. Bounded
Codex subagents support them. The completion condition is the [contract](../migration/CONTRACT.md),
including product parity, existing-user continuity, measured performance, web/native distribution
and final reviewed disposition.

The maintainer explicitly paused implementation and asked for durable records. **The migration goal
remains paused.** This packet does not restart implementation, select an architecture, authorize a
release or create another session. Await the next human continuation prompt. Once that prompt
authorizes resumption, the earlier campaign authority covers decisions, implementation, small PRs,
review, checks and integration without repeated routine confirmation.

## State

The persistent integration branch is `codex/native-migration`, accepted at
dc08a90abc67b53124146bf288c80de0f9ffd1dd. This checkpoint branch starts at that commit and adds
records and data capsules only. Its source changes are the migration README, progress checklist,
this packet and `docs/migration/evidence/continuation/`. It does not integrate either unfinished
unit. The checkpoint is committed locally. Remote publication awaits explicit human approval after
automatic approval review rejected exporting the source/evidence payload to KyleMit/Splotch. Until
publication succeeds, this packet and its capsules are available on this host only; another machine
cannot fetch them. Verify the branch's actual upstream and remote head before treating it as
portable. The [work ledger](../migration/README.md#work-ledger) lists all eight accepted PRs and
merge commits. The epic had no API-enumerated sub-issues at the latest check; this checklist is the
current scope inventory, not an existing GitHub child-issue backlog.

| Recoverable work            | Exact state                                                                                                                                   | Storage                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Accepted topology unit      | Reviewed source 9442b27817a61486750b070ff07c880d124571a6, merged as dc08a90abc67b53124146bf288c80de0f9ffd1dd through PR 2697.                 | Git history, PR and preserved acceptance receipts.                                      |
| Retained Svelte controls    | Clean local branch `codex/migration-retained-web-host` at 8ddfc04053ccdf285c2f6fd7c2b75e745a9d2fc6; no implementation PR or branch upstream.  | `retained-source.bundle` plus actual control/review receipts.                           |
| Retained review predecessor | Actual reviewed snapshot 63b9b4d19c630b576d13159b49003488454c5071, based on d1402f6b2bedd2c30cbc88d30597466855b33874.                         | `retained-predecessor.bundle`; required by the preserved inversion driver.              |
| Native source intake        | Seventy uncommitted files on `codex/migration-native-source`, based on dc08a90abc67b53124146bf288c80de0f9ffd1dd; source-only and unvalidated. | `native-source-snapshot.tar.gz`: sixty maintained files and ten registration snapshots. |
| Later preparation           | Archive inspection, corrected Apple/Android plans, neutral React source and audited proposed dependency routes; source/data only.             | `prepared-work.tar.gz`; exact inventory and hashes.                                     |

The [preservation README](../migration/evidence/continuation/README.md) owns recovery instructions,
capsule paths, limitations and review continuity. The
[manifest](../migration/evidence/continuation/manifest.json) binds every archive member's bytes,
mode and source. Original host-local checkpoints remain historical records: their assertion that
backups were unpushed describes the original pause, before this packet.

## Decisions made (and why)

React Native mobile with a shared web-capable UI remains the leading hypothesis. React Native Web
and React Strict DOM remain unselected. Native paper inside Capacitor and retention of the shipping
Svelte/Capacitor product remain valid contract outcomes. A React DOM rewrite is not a prerequisite.
JavaScript was not the measured motivating cost; a framework change cannot establish a compositor
improvement without a fair physical comparison. Follow the reviewed phase sequence and its
alternatives; do not promote prepared source or reviewer agreement into architectural proof.

Keep the shipping app runnable. Each bounded unit branches from the reviewed integration head, opens
a small PR against `codex/native-migration`, obtains independent Claude review and applicable
final-head checks, then merges. The final cutover targets `main` only after the relevant completion
gates. PR 2697 exhausted its three review rounds and received GO in round three; do not reopen or
reset that conversation for an unrelated unit.

The retained unit has a separate original Claude conversation:
`b5bb0824-3f7a-4ad7-9e05-4e8e9af77333`. Its substantive source review used one round and reported
six findings. Two rounds remain. Question mode did not persist a review ledger; adopt the original
identity into the actual new PR's ledger before requesting round two. The capsule's
`retained/claude-provenance.md` and adoption template specify the audited procedure. An unrelated
existing branch ledger must remain untouched. A fresh conversation or resume fallback cannot be
reported as successful resumption or used to reset this budget.

Use the corrected Apple plan: Node 24.16.0, Ruby 3.4.11, Bundler 2.6.9, CocoaPods 1.16.2 and
xcodeproj 1.27.0, with Xcode 27 as a compile candidate. Earlier structural proposals inside copied
context are historical and do not control execution. Preserve the separate iOS 16.4 floor proof. The
proposed yauzl 3.4.0 and React/DOM/types routes have not changed the lock or installed packages.

The retained negative-control campaign had two incomplete attempts: a fixed-folder fixture was
invalid after mutation, then an assertion-output parser failed on abbreviated rendering. Both are
preserved with dispositions. The final attempt passed with intended assertion failures and restored
positive controls. Reuse its verified semantics rather than reintroducing either predecessor error.

## Unverified assumptions

* Retained final-source Quality, applicable full tests, CI integration and Claude round-two
  acceptance are pending. Its private CI proposal remains unapplied and omits a measured numeric
  deadline.
* Native sources have not been formatted, typechecked, installed, materialized by their helper,
  compiled or mounted. Shipping Capacitor CI success is not native-candidate success.
* Native registration snapshots must be composed over accepted current owners. Neutral React53
  contains older retained comparison bytes and must preserve the later retained correction when
  integrated. Whole-file restoration would lose reviewed changes.
* Corrected toolchain plans do not prove actual archive layouts, owned locks/extensions, tool
  publication, SDK licenses, native compilation, OS-floor mounting or candidate runtime behavior.
* No current physical calibration, candidate performance improvement, final renderer selection, full
  replacement UI, existing-user migration or release acceptance has been established.
* Original Claude conversation state, host tools/devices, temporary worktrees and audit reports may
  have changed. Re-enumerate them. Portable review findings do not transfer private conversation
  state to another machine or guarantee that resumption will succeed.
* Separate-session audit reports are advisory snapshots. Triage their reported counterexamples
  against exact current source before treating them as confirmed defects or accepted decisions.

## Done & verified

PR 2697 binds acceptance to 9442b27817a61486750b070ff07c880d124571a6: release web and static
Capacitor builds, API smoke and the complete required `npm test` tiers passed. Eighteen applicable
CI jobs succeeded, with four predicate-based skips; shipping Android/iOS compilation passed. An
actual nonproduction Netlify production install/release build and live version resource passed. The
bounded rendered hosted-log observations are not a complete raw build log; no production publication
or React Native candidate execution is implied.

At retained source 8ddfc04053ccdf285c2f6fd7c2b75e745a9d2fc6, scoped types, lint and fifteen focused
files/1,207 tests passed. Seven serial public control calls passed: release build/check/ink,
mechanism build/check/delayed-hydration ink, and repeated mechanism browser execution. Fourteen
build children and all three browser records completed successfully. Output comparisons, release
budgets, first-run evidence preservation and owned-process retirement passed. The final rejecting
controls had 165 baseline passes, nine categories, twelve intended Vitest assertion failures and a
scoped TypeScript boundary check, with restored positive controls. These are web/tooling results,
not physical performance or native results. Exact logs, screenshots, failures and receipts are
retained.

Preservation checked all seventy native intake bytes/modes, all selected preparation identities,
archive member hashes/modes and both Git-bundle prerequisites. No prepared source was imported or
executed while making this checkpoint. The migration worktrees were left unchanged. The preservation
validation receipt records formatting/reference checks and the final integrity review; inspect that
receipt for the checkpoint's own validation rather than attributing old app checks to this docs-only
commit. A remote checkpoint PR has not been opened while publication approval is pending.

## Risks & next 3 steps

1. After human authorization, use `resume-handoff` to verify this packet against the live remote
   branches, PRs, manifest, original Claude identity and available hardware. Mark facts confirmed,
   stale or missing before execution; absorb and delete only this transient packet. Replace incoming
   links to it with durable progress/evidence entry points in that same deletion commit. Keep the
   progress, provenance and evidence records. Review/integrate the checkpoint PR if one has been
   opened and remains pending.
2. Finish the retained control unit first. Recover the exact source/history, triage advisory guard
   findings, including the reported reachable-import guard hole before candidate source expansion,
   compose the CI proposal, choose a numeric deadline from measured cost and run final applicable
   checks. Open its own PR, adopt/resume the original Claude conversation for round two, resolve
   material findings and obtain final-head CI before merging.
3. Continue the reviewed architecture-check units from that accepted head. Compose native source
   registration, qualify materialization/dependency/toolchain boundaries, then perform optimized
   native compile/mount and the neutral web checks. Follow physical, fidelity, continuity and
   comparison dependencies before selecting product ownership. Update the checklist as concrete
   scope expands; neither source preparation nor compilation closes performance gates.

## Reread first

* [Progress checklist](../migration/PROGRESS.md), [work ledger](../migration/README.md),
  [contract](../migration/CONTRACT.md) and [phase sequence](../migration/PHASE-1.md).
* [Preservation and recovery](../migration/evidence/continuation/README.md), including controlling
  native/React plan entry points and advisory-audit limitations.
* [Acceptance](../migration/ACCEPTANCE.md), [web contract](../migration/WEB-CONTRACT.md),
  [upgrades](../migration/UPGRADES.md) and [baseline inventory](../migration/BASELINE.md).
* The `resume-handoff`, `adrs`, `architecture`, `testing`, `run-rival-agent`, `mobile`,
  `reconcile-with-main` and relevant capture skills in `.agents/skills/`; use their generated files
  for execution and their declared sources for edits. Consult the ADR index before architectural
  changes. Inspect current main at phase boundaries rather than assuming the old base is current.
