# Inconsistent script naming across idea dirs — `idea{N}-` prefix vs descriptive vs `tmp-`

**Priority/category:** P3[naming] · **Cluster:** C16 · **Triaged:** 2026-07-27 at 32394ab **Original
file(s):** `idea-11/code/idea11-*.mjs`, `idea-17/code/*-idea17.mjs`, `idea-21/code/tmp-rects.mjs`,
`idea-21/code/tmp-shoot-sheet.mjs`, et al. — pinned at SHA f934d43 **Draft patch:**
docs/audit-deferred/p3-naming-inconsistent-script-naming-across-idea-dirs-idea-n-prefix-vs-d.patch

## Verdict

**DROP — not worth doing in a frozen archive.** The idea dirs are a frozen evidence record; the
naming inconsistency is an accurate artifact of how the record was made, and the two `tmp-*` files
are honestly labeled throwaway scratch whose deletion would dangle frozen metadata for zero
functional gain. The deferral reason (a driver lint-gate bug) is moot — that fix already landed at
HEAD independently of this finding.

## Original finding (condensed)

21 of the 60 exploration `.mjs` files embed a redundant `idea{N}` in the filename, 39 use plain
descriptive names, idea-17 uses a suffix, and idea-21 carries two committed `tmp-`prefixed
Playwright scratch scripts. Proposed (already scoped light by the finding itself): don't churn the
60 files; note in the README that the prefix is incidental, and rename or delete the two
`idea-21/code/tmp-*.mjs`.

## Why it was deferred

"Fix introduced a lint violation" — but the record shows the fix was fine and the *driver's lint
gate* was buggy: it linted `git diff --name-only` output, which includes deleted paths, and
`npx eslint` hard-errors on nonexistent paths, so every deletion-only fix was unconditionally red.
The burndown session fixed the driver (`lintablePaths()` filtering on on-disk existence, plus a
`--no-error-on-unmatched-pattern` LINT_CMD default as a second layer), but the already-running
driver process held the pre-fix module in memory, so the gate stayed red for the rest of that run
and the finding deferred out. No adversarial-review objection to the actual change was ever
recorded.

## Current state of the code

* `idea-21/code/tmp-rects.mjs` and `tmp-shoot-sheet.mjs` still exist at HEAD, each opening with
  `// TEMP (idea-21 experiment): … Delete me.` Both are indexed in `idea-21/meta.json` (code entries
  42–43, "Throwaway Playwright …") and listed in `idea-21/report.md` line 101 as "throwaway
  Playwright verification helpers", and their contents are embedded in the committed
  `ideas-review.html`.
* The driver-bug half of the draft patch **already landed**: `scripts/audit-burndown/lib.mjs:113`
  has `lintablePaths()`, wired into `burndown.mjs:354`, with tests. (The patch's second layer — a
  `LINT_CMD` default of `npx eslint --no-error-on-unmatched-pattern` — did *not* land;
  `burndown.mjs:90` still defaults to plain `npx eslint`. That is driver infrastructure, separable
  from this finding.)
* The README has no note about the incidental `idea{N}` naming.
* Meanwhile HEAD has kept curating the archive's *navigation* (per-report Status lines, e44fafb) and
  pruning *misfiled or regenerable* content (48d98ab, 5a448de) — but has never renamed or reshaped
  historical evidence files.

## Recommendation

Drop, following the cluster's governing answer: `idea-N/` dirs are frozen archives whose files keep
the names the exploration gave them.

* **Renaming** the 21 `idea{N}`-prefixed files was already ruled out by the finding itself, and in a
  frozen record it would falsify history while breaking `meta.json` code indexes and the committed
  dashboard — for a purely cosmetic win. Nothing new to decide.
* **Deleting the two `tmp-*` files** is defensible (they say "Delete me") but net-negative now: they
  are load-bearing *evidence* — `report.md` and `meta.json` cite them as the instruments that
  produced idea-21's verification screenshots — and removing them leaves those frozen references
  dangling and the committed `ideas-review.html` stale until regenerated (`build-review.mjs` line
  101 silently skips missing code files, so the dashboard would quietly lose two entries). Unlike
  the misfiled webps HEAD pruned, they are tiny (~1 KB each) and correctly filed. In an archive, the
  `tmp-` prefix is not a smell to clean; it is accurate labeling of what the artifact was.
* The one salvageable line from the draft — the README note that per-file naming is incidental
  ("each idea's subagent named its own scratch scripts — not a convention to imitate") — is worth at
  most one sentence, and the README rewrite recommended in
  `fix/p1-discoverability-asset-gen-readme-stale.md` can carry it if the maintainer likes it. It
  does not justify a finding of its own.

If the maintainer still wants the `LINT_CMD --no-error-on-unmatched-pattern` second defense layer
for the burndown driver, harvest that hunk from the draft patch as a separate driver improvement —
it has nothing to do with idea-dir naming.

## Suggested next step

Dropped — nothing to do. Optionally: fold the one-sentence naming note into the sibling README fix,
and consider the `LINT_CMD` default hunk from the draft as an independent driver tweak.
