# RN-only documentation reconciliation — issue 3164

The unit branches from migration trunk 109b5c38b4010e4c93a5ce166b3d424ba4d7f0a8. The parent owns
merge and manual issue closure; the PR targets codex/native-migration. No new issue, product
feature, device capture, upload or fix for the fourteen parked RN gaps is included.

## Scope and decisions

* Reconciled current root instructions, reference/workflow skills, direct Claude audit skill, rules,
  README/development/RSD guides, API, architecture, testing, mobile, profiling, browser
  compatibility, orientation, safe-area, worktree, cloud, Quality and dependency guidance.
* Fixed both cloud bootstrap scripts that still invoked the deleted web-tool dispatcher. The scripts
  use the root pnpm Playwright command and have no framework-sync prerequisite.
* Replaced Svelte domain rules with current RN feature owners; retained every counting exclusion.
  The generated CODE-MAP snapshot names 604943098c34039aa638d5bd8d5bb5e9615fa516, the committed
  rules revision. New src roots, server ownership and explicit root-hook placements were reviewed;
  there are no unused-rule warnings or unassigned files. Documentation growth is explained by
  migration/scratchpad evidence; no new issue was filed.
* Reviewed the ADR candidate inventory: 51 retired decisions superseded by ADR-0182 and moved to
  Historical; 63 surviving decisions amended with current RN owners/scope. Original quotations, old
  implementation detail and measurements remain intact. ADR-0182 describes the implemented root app.
  No new architectural decision or ADR was introduced. Full changed-record dispositions are in
  adr-dispositions.json. Unchanged records retain their existing status; the current
  0178/0179/0180/0181 decisions and 0120 boot-only smoke remain in force.
* API JSON, bearer-session and legacy wire behavior remain unchanged; obsolete Svelte form-action,
  hook, alias and runtime claims were replaced by the actual Function and RN client owners.
* Released legacy pack snapshots remain required. The old-tag reconstruction tool keeps its
  historical Git paths and cannot generate a snapshot for a new RN tag. Current RN integrity
  catalogs and platform owners remain unchanged.
* Existing package metadata already describes React Native; current dependency inventory records the
  single root manifest without inventing new external-health assessments. All thresholds and
  byte-cap constants are unchanged.
* INK_CHANNEL_DELTA is exported once by the drawing helper and imported by group A; its value is
  unchanged. The audit driver's changed-file filter now includes TSX. Its existing test fails
  against the old filter (79 pass / 1 fail) and passes after restoration (80 pass); see the two
  control logs. No burndown workflow redesign is included.

## Judgment receipts

identifiers.md records every advisory disposition. exemptions.md records all seventeen exact
exemptions and their rationale, including the one historical-tag addition and the corrected
illustrative handoff filename. authorization.txt preserves the original human grant.

## Validation

All twelve Quality steps, all six browserless tiers, the export and Chromium post-build checks pass.
See validation.md for exact counts, the expected CI set and the serialized verification record.
Final Claude review and exact-head CI conclusions live on the PR. This record does not claim a
successful IPA export; the parent owns that separate signing prerequisite and final release proof.
