# ADR-0175: Matrix Sections Report Their Capture Age, Not a Currency Verdict

**Status:** Active — supersedes [ADR-0159](0159-matrix-staleness-reported-not-enforced.md); amends
[ADR-0156](0156-physical-rows-gate-releases-advisory-rows-never-count.md) **Date:** 2026-09

## Context

ADR-0159 kept a current-or-stale verdict for every captured matrix row and made `--strict` fail any
row that was not current. The verdict compared the product surface at each row's capture commit with
the tip. Two more pieces were built on it. The generator counted each mode's action rows measured at
the report's exact final product commit (`countFinalProductCommitActions`). The
`improve-performance-matrix` completion gate counted only "current" red cells.

That model assumed a row can usually be current. It cannot. `main` takes about seven product merges
a day: 593 first-parent merges touched the measured surface over 85 active days. The full matrix is
eleven targets by four modes by three suites, four of them on a reserved physical rig, and it is
refreshed by periodic campaigns. So every section is behind the tip for almost all of its life. The
verdict was false by the next merge. The exact-commit action count read zero after any routine
merge. And a gate that counted only current reds dropped an old red from the remainder even though
nothing had fixed it.

The maintainer ruled on 2026-09-24 (issue 2267, epic 2210) that a reader needs to know how old a
cell's evidence is, not whether it matches the tip exactly.

Alternatives considered:

* **Keep the verdict and tolerate a band of commits.** Rejected: any band is either too narrow to
  survive a day of merges or too wide to mean anything. ADR-0159 already records that narrowing the
  measured surface missed real product changes twice.
* **Age each section against the reader's today in the committed page.** Rejected for the same
  reason ADR-0159 rejected rendering currency: the page is committed and read long after it is
  generated. The capture date stays true forever. An age counted to the report's own `recordedOn` is
  true for that page. The live age is the console report's job.
* **Derive the date from git at render time.** Rejected: a commit date is not a capture date. A
  preserved section's raw inputs are gone, and the report cannot recompute a date it never recorded.
  So the date is recorded once, at fold time, and published.

## Decision

1. **Every section carries a `capturedOn` date.** Each captured mode in `sources.json` has
   `capturedOn: { drawing, undo, actions }`, as UTC `YYYY-MM-DD` days, one per section the mode
   publishes. `perf:campaign:sources` writes it at fold time (`tools/perf/campaign-sources.mjs`).
   Each section is dated by the `perf-run=<epoch ms>` stamp in its artifacts'
   `automation.loadedUrl`, taking the oldest when a section has several artifacts. A section none of
   whose artifacts records the stamp falls back to the fold date. A section the fold does not write,
   such as preserved actions or a carried undo, keeps the date it already had. Every fold also moves
   the manifest's `recordedOn` forward to the fold date, never back. The stamp parser and the age
   arithmetic live in `tools/perf/lib/capture-date.mjs`, which also owns `PERF_RUN_PARAM` for the
   XCUITest transport that writes the stamp.
2. **The committed sections were backfilled the same way.** The stamp is present only in iOS
   XCUITest drawing and undo artifacts. Android, desktop, and action transports record none. Of the
   132 committed sections, 26 are dated by the stamp. The other 106 are dated by their fold date:
   the first commit that put the section's source path into `sources.json` or `data.json`. In all 26
   sections where both dates exist, they fall on the same day. The per-section record is in
   `docs/scratchpad/perf/2026-09-25-issue-2267-captured-on-backfill.md`.
3. **The generator publishes and renders the age.** `gen:performance-matrix` validates each date,
   copies it into `data.json`, and renders every provenance cell as commit, date, and age counted to
   the report's `recordedOn`, and refuses a capture date later than `recordedOn`, which would
   publish a negative age. It removes the exact-commit action coverage column and
   `finalProductCommitActionCount`. It adds an **Open release-gate reds** list: every cell the
   release-gate section renders red that no recorded disposition explains, each with its capture
   date and age, oldest first.
4. **`check:matrix-staleness` is a report ranked by age.** It lists every captured section,
   preserved ones included, grouped per target section. Each row has the date, the age in days
   against today, the product commit, and the engine and measured-surface commits that landed since
   (`tools/perf/check-matrix-staleness.mjs`). Age is never a failure.
5. **`--strict` means provenance-complete.** Under `--strict`, the check fails when any captured
   section lacks a valid `capturedOn` date or a product commit this checkout can resolve. The
   generator copies both a preserved and a captured-untracked section from the report the manifest
   names (`preservedEvidence.from`), so their commits are read from there, and a captured-untracked
   pin that contradicts the published section is a failure too. A declared action section is checked
   even beside an `actionsUnavailableReason`, because the generator still publishes it. The policy
   is the pure function `provenanceOutcome`, tested in `tools/perf/tests/matrix-staleness.test.mjs`.
6. **The completion gate reads by age.** ADR-0156's gate, and the `improve-performance-matrix`
   skill's, now reads: zero scoreable, unexplained red cells on the release-gate rows, each shown
   with its capture age. An old red keeps counting until it is recaptured or explained.

## Consequences

* \+ The console report and the page both state a fact that stays true, the capture date. Age grows
  but never flips, so routine merge traffic cannot make a section look broken.
* \+ An old red cannot drop out of the remainder just because the tip moved. It shows its age
  instead, which says how much a recapture is owed.
* \+ `--strict` has a claim it can enforce at any time: every section says when and from what it was
  captured.
* − A fold-date fallback overstates freshness. A fold runs on or after the capture, often days later
  for preserved sweeps, and 106 of the 132 committed sections are dated that way. The error only
  ever makes a section look younger.
* − The capture stamp exists only on the iOS XCUITest drawing transport. Until Android, desktop, and
  action captures record their own clock, every section they produce is dated by its fold.
* − A preserved drawing section stays unscoreable (`PRESERVED_VERDICT_REASON`), since its verdict
  cannot be re-derived. On a release-gate row its published red still counts, by decision 6: it is
  listed as an open red and rendered as red, unless its published fidelity failed a calibrated check
  or its beat was off-regime, which asked for a recapture rather than scoring a red
  (`preservedVerdictRed` in `tools/perf/gen-performance-matrix.mjs`; decided in issue 2268). No
  release-gate row carries one today, and a per-section fold (`perf:campaign:sources --sections=`)
  keeps each carried section on its existing route rather than preserving it.
* − The page ages count to `recordedOn`, and a fold moves it, so a hand edit to the manifest that
  adds a later section without moving `recordedOn` is refused rather than aged. `recordedOn` now
  follows the latest fold, not the campaign's final commit alone.
