# Graduated `idea-N/code/*.mjs` files are now drifted ancestors of live `bin/`/`lib/` files, with no pointer marking them frozen

**Priority/category:** P1[duplication] · **Cluster:** C16 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `tools/asset-gen/ideas-exploration/idea-25/code/gen-asset-manifest.mjs`,
`idea-10/code/page-notes.mjs`, `idea-7/code/audit-night-halo.mjs` (and the other graduated code
dirs) — pinned at SHA f934d43 **Draft patch:**
docs/audit-deferred/p1-duplication-graduated-idea-n-code-mjs-files-are-now-drifted-ancestors.patch

## Verdict

**DROP — already resolved elsewhere.** Since the pinned SHA, every one of the 25 idea reports gained
a curated `Status:` disposition line naming the live counterpart (or stating nothing shipped). That
is the finding's own proposed report-banner fix, delivered with facts that already incorporate the
review objections that killed the draft. The residual delta (per-`code/`-dir `LANDED.md` stubs) is
not worth a second bookkeeping surface inside a frozen archive.

## Original finding (condensed)

Several exploration scripts share a filename with a live pipeline file but have drifted from it
(`idea-25/code/gen-asset-manifest.mjs` vs `bin/gen-asset-manifest.mjs`,
`idea-10/code/page-notes.mjs` vs `lib/page-notes.mjs`, `idea-7/code/audit-night-halo.mjs` vs
`bin/audit-night-halo.mjs`). Nothing marked the snapshots frozen, so a grep surfaces both copies and
someone could edit or copy the stale one. Proposed: a "Landed as: …" banner atop each graduated
`report.md` and/or a `LANDED.md` stub in each graduated `code/` dir.

## Why it was deferred

Failed adversarial review — a coverage spiral. Each round the reviewer found more graduated dirs
missing the banner/stub treatment (idea-13, idea-4, idea-23, then idea-11/12/19, then idea-21/24,
then idea-17), plus factual corrections: idea-7's pointer had to name `lib/night-halo.mjs` (the
scoring core) not just the CLI; idea-10's had to cover the `code/registry/*.notes.json` files as
frozen copies of `fill-src/<cat>/notes.json`; idea-4's "Landed as:" label was wrong because its
deliverable never shipped. Three rounds never converged on full coverage.

## Current state of the code

Substantively resolved at HEAD, by a different session fixing an overlapping audit finding:

* Commit e44fafb ("add a Status disposition line to each idea report", citing audit finding
  "[P3][discoverability] `report.md` files carry no back-reference to their outcome") plus
  correction commit b49ff0d gave **all 25** reports an opening `Status:` line — LANDED entries name
  the live file(s) (`idea-10` → `../../lib/page-notes.mjs` *and* `../../fill-src/<cat>/notes.json`;
  `idea-13` → `../../lib/invented-shapes.mjs`; `idea-25` → `../../bin/gen-asset-manifest.mjs` +
  `../../golden/asset-manifest.sha256`), and the dispositions bake in the reviewer's factual
  corrections (idea-4 is NOT PROMOTED, idea-22's standalone CLI marked not promoted).
* Coverage is total (25/25), which dissolves the review spiral: there is no "graduated dir the fix
  missed" left to object to.
* The live files back-reference the archive in the other direction too:
  `tools/asset-gen/lib/invented-shapes.mjs` lines 5 and 28 cite `ideas-exploration/idea-13`,
  `tools/asset-gen/lib/night-halo.mjs` line 6 cites `idea-7`.
* The drifted `.mjs` snapshots themselves are unchanged — correctly so; they are frozen evidence,
  and both the README ("This folder is not part of the asset pipeline") and the directory
  orientation (`tools/asset-gen/CLAUDE.md`: "nothing in it is live pipeline code") say so.
* No `code/LANDED.md` stubs exist (`find ideas-exploration -name LANDED.md` is empty).

What remains of the finding is only the second, "and/or" half of its proposal — the `LANDED.md` stub
inside each graduated `code/` dir — plus two Status lines that are less granular than the reviewer
wanted of the draft (idea-7's names the CLI but not `lib/night-halo.mjs`; idea-23's names
`bin/audit-golden.mjs` and the golden scores but not `lib/night-scores.mjs`).

## Recommendation

Drop. The cluster's governing answer is that `idea-N/` dirs are a frozen evidence archive with one
thin, living navigation layer — the report Status lines. Adding 13 `LANDED.md` stubs would create a
*second* disposition surface that must be kept factually consistent with the first; the draft's
three-round review spiral is direct evidence of what maintaining per-dir pointer coverage costs. The
marginal scenario the stubs defend against — a reader greps straight into `code/*.mjs` and never
glances at the sibling `report.md` one level up — is already triple-fenced: the Status line beside
the code, the README/CLAUDE.md "nothing here is live" declarations, and back-references from the
live `lib/` files themselves.

If more granularity is ever wanted, the cheap move is enriching the two thin Status lines (idea-7
adding `../../lib/night-halo.mjs`, idea-23 adding `../../lib/night-scores.mjs`) — a two-line edit
that can ride along with the README fix recommended in
`p1-discoverability-asset-gen-readme-stale.md`, not a re-staged finding of its own.

## Suggested next step

Dropped — resolved by e44fafb + b49ff0d. Do not apply the draft patch (it would layer a redundant
`LANDED.md` scheme, with now-stale wording, over the landed Status lines). Optionally fold the
idea-7/idea-23 Status-line enrichment into the sibling README fix.
