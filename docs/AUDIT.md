# Audit

> Transient staging for Splotch's audit skills (`.claude/audit-conventions.md`). Producers **merge**
> findings here; `/vet-audits` validates them and files the survivors as `type:audit` GitHub issues,
> then deletes this file. `/fix-audits` burns down those issues. Never treat this file as a
> long-lived backlog.

## Source: Code audit — Root config (package.json, dprint, tsconfig, …)

## Source: Session audit

## Source: Deferred-audit triage — FIX verdicts (2026-07-27)

These 30 findings were deferred by earlier `burn-down-audits` runs (failed implementation or failed
adversarial review), then triaged on 2026-07-27 with a FIX verdict: a single clear-winner solution,
including — where a rolled-back draft exists in `docs/audit-deferred/*.patch` — exactly what must
change versus that draft to survive the recorded reviewer objections. Each entry carries its prior
review context; line numbers cite the SHAs noted inline. The triage's disposition index
(`docs/audit-deferred/triage/README.md`) lives in git history; the directory was removed once every
verdict was dispatched.

### [P3][complexity] `scoreCompositeEyes` is a 100-line function with an inline pupil-shape validator

**File(s):** `tools/asset-gen/lib/composite-eye.mjs:158-259` — pinned at SHA f934d43

**Rolled-back draft patch:**
docs/audit-deferred/p3-complexity-scorecompositeeyes-is-a-100-line-function-with-an-inline-p.patch

#### Problem

Inside `scoreCompositeEyes`'s per-eye loop, three rejection stages are inlined: bounding-box fill +
aspect ratio, a Set-based erosion survival test, and centroid + disc-stats measurement. The
pupil-shape decision spans ~50 lines mixed with measurement, and the erosion is a fourth ad-hoc
morphology implementation. Proposed extracting `isPupilDisc(blob, w, h)` (reusing `erodeMask`) and
`blobCentroid(blob, w)` so the loop reads grow → validate → measure → push.

**State at triage (2026-07-27):** Unchanged at HEAD: `scoreCompositeEyes` is
`lib/composite-eye.mjs:174-275` with the bbox/aspect check (207-222), Set-based erosion (224-248),
and centroid reduce (251-252) all inline. `git apply --check` passes — this is the only C15 patch
that still applies verbatim.

The technical crux the review deadlocked on: `erodeMask` (`lib/morphology.mjs:46`) is a **separable
box erosion** — radius r erodes by a (2r+1)×(2r+1) *square*. The inline loop is `PUPIL_ERODE_PX`
iterations of a **4-neighbor cross** erosion (a diamond). A 5×5-square erosion removes strictly more
pixels than two cross iterations, so `erodeMask(mask, w, h, PUPIL_ERODE_PX)` erodes harder and can
flip the `eroded.size >= max(12, blob.length * 0.3)` survival test on borderline blobs — with only
the five committed fixtures as coverage of the detection path. The reviewer's instruction, taken
literally, cannot preserve the calibrated verdicts by construction; that is why the fix round
failed, not implementer sloppiness.

**Prior attempt / why it was deferred:** Implementer failed to deliver a fix round. The extraction
shipped, but `isPupilDisc` kept the exact Set-based erosion loop; the reviewer's unresolved
objection demanded building a blob mask and reusing `erodeMask` from `morphology.mjs` "while
preserving the calibrated fixture verdicts". The implementer's note says the Set loop was kept
deliberately, "preserving the exact cross-kernel erosion" — the two demands are in tension, and no
round resolved it.

#### Proposed solution

**FIX — clear winner.** The draft's extraction is correct and the patch still applies cleanly at
HEAD. The reviewer's objection — "reuse `erodeMask` from `morphology.mjs`" — is, as literally
stated, unsatisfiable without changing behavior, because `erodeMask` uses a different structuring
element than the inline loop. The fix is to add a cross-kernel erode to `morphology.mjs` and route
the extracted helper through that: shared morphology home, exact same pixels.

Apply the draft patch, then replace `isPupilDisc`'s Set loop with shared morphology:

* Add to `lib/morphology.mjs` a one-step 4-neighbor erode, e.g.
  `export function erodeCross(mask, w, h)` — pixel survives iff itself and all four neighbors are
  set, with out-of-bounds treated as unset. That matches the Set version exactly (its
  `x > 0 && x < w - 1 && …` guards mean border pixels never survive, same as out-of-bounds = 0). A
  short comment should state why `erodeMask` (box kernel) is deliberately not used here.
* In `isPupilDisc`, build a dense `Uint8Array` mask over the blob's bounding box (already computed
  for the fill/aspect checks), run `erodeCross` `PUPIL_ERODE_PX` times, and count survivors in place
  of `eroded.size`.
* Verification: `tests/composite-eye.test.mjs` passes with identical verdicts and identical
  `coreDarkFrac` values; assert (in the PR notes) that per-fixture `pupils.length` is unchanged,
  since the erosion gates detection, not just measurement.

**Alternatives weighed:** 1. **Apply the patch + add a cross-kernel erode to `morphology.mjs`**
(winner). Exact behavior, and the "fourth ad-hoc morphology implementation" the finding named is
genuinely removed. 2. **Apply the patch as-is and document why the Set loop is not `erodeMask`.**
Cheapest; overrules the reviewer with a true reason (kernel mismatch). Acceptable fallback, but
leaves the ad-hoc erosion the finding explicitly called out. 3. **Switch to `erodeMask` and
re-calibrate.** Changes detection behavior for a pure-readability finding; re-pinning thresholds off
five fixtures for zero functional gain is the wrong trade.

**Landing note:** Apply the patch
(`git apply docs/audit-deferred/p3-complexity-scorecompositeeyes-is-a-100-line-function-with-an-inline-p.patch`),
then make the `erodeCross` change above in the same commit.

#### Verification

`npm run check` plus the unit/E2E suites covering the touched files (see the solution for any
targeted commands).

### [P3][architecture] `fail()` (console.error + process.exit) lives in `paths.mjs`, unrelated to path resolution

**File(s):** `tools/asset-gen/lib/paths.mjs:29-32` (now 40-43) — pinned at SHA f934d43

**Rolled-back draft patch:**
docs/audit-deferred/p3-architecture-fail-console-error-process-exit-lives-in-paths-mjs-unrel.patch

#### Problem

`paths.mjs` is documented as path/tree resolution but exports the process-terminating `fail()`,
which bin scripts import *from paths*, coupling an exit side-effect to the pure constants module.
Proposed moving `fail` to `lib/cli.mjs` (or `log.mjs`) and updating the imports.

**State at triage (2026-07-27):** Unresolved and slightly worse than at the pin. `fail` is still in
`lib/paths.mjs:40-43`, imported by 16 `bin/` scripts, `legacy/retouch-line-art.mjs:37`, **and now
also** `lib/cli.mjs:2` and `lib/gemini.mjs:2` (both created since f934d43, both of which had to
reach into paths for it). `lib/cli.mjs` exists as the shared CLI-helper module (arg parsers,
`MAX_ATTEMPTS`), so the finding's proposed destination is no longer hypothetical — `fail` is the one
CLI concern still living in the wrong file.

The patch was staged against a near-HEAD tree; `git apply --check` fails only on
`bin/audit-golden.mjs` and `bin/audit-invented-shapes.mjs` (import-list formatting drifted since).
Everything else — all bins, legacy, `cli.mjs` gaining the definition, `gemini.mjs` re-pointing —
applies.

**Prior attempt / why it was deferred:** Failed adversarial review. Two objections were recorded:
(1) `legacy/retouch-line-art.mjs` still imported `fail` from `paths.mjs` and would crash at module
load — the draft's third commit fixed exactly this, so it is resolved *within the patch*; (2) still
unresolved: `tests/light-fill-cli.test.mjs` and `tests/audit-cli.test.mjs` mock `paths.mjs` with a
throwing `fail` stub — after callers move to `cli.mjs`, that stub is dead and the failure-path tests
would invoke the real `process.exit(1)`.

#### Proposed solution

**FIX — clear winner.** The finding has only gotten more true since it was filed (two lib modules
now also import `fail` from paths), the natural destination `lib/cli.mjs` now exists, the draft
already handles the reviewer's first objection (the legacy tool), and the second objection (dead
test stubs) is a small, well-understood two-file test change.

Apply the draft patch (hand-merging the two drifted audit-bin import lists), then make the one
change the review still demands — fix the test mocks:

* In `tests/light-fill-cli.test.mjs` and `tests/audit-cli.test.mjs`, delete `fail` from the
  `vi.mock('../lib/paths.mjs', …)` factories and add:

  ```js
  vi.mock('../lib/cli.mjs', async (importOriginal) => ({
    ...(await importOriginal()),
    fail(message) {
      throw new Error(message);
    },
  }));
  ```

  The `importOriginal` spread matters: `light-fill-cli.test.mjs:6` imports `MAX_ATTEMPTS` (and the
  bins import the `parse*` helpers) from the real `cli.mjs`, so only `fail` may be replaced.

**Alternatives weighed:** FIX, so short: the only alternative destination is a new `lib/log.mjs`,
which loses to `cli.mjs` now that `cli.mjs` exists and is already imported by most of the same bins
(`fail` rides existing import lines). Leaving `fail` in paths keeps two lib modules dependent on a
`process.exit` helper from a "pure constants" file.

**Landing note:** Apply the patch, resolve the two import-list conflicts, add the two test-mock
edits above in the same commit.

#### Verification

`grep -rn "fail" tools/asset-gen/lib/paths.mjs` returns nothing; `npm run
test:asset-gen` green,
with the failure-path cases in both suites still observing thrown errors (proving the new stub is
live, not `process.exit`); `node tools/asset-gen/legacy/retouch-line-art.mjs` still loads (the
legacy README's "kept runnable" contract).

### [P1][discoverability] README scoreboard and "do first" list are stale — most ideas already graduated into the live pipeline, but nothing here says so

**File(s):** `tools/asset-gen/ideas-exploration/README.md` lines 28–75 — pinned at SHA f934d43

**Rolled-back draft patch:**
docs/audit-deferred/p1-discoverability-readme-scoreboard-and-do-first-list-are-stale-most-id.patch

#### Problem

The ideas-exploration README presents all 25 ideas as an open backlog "intended for a follow-up
session to review and decide what to promote," with a prioritized "do first" list of patches to
land. That follow-up already happened — most ideas shipped into `bin/`/`lib/` or were closed by the
gemini-3.1 regeneration wave — so a newcomer reading the README would re-do finished work.

**State at triage (2026-07-27):** The finding still holds at HEAD, but the ground shifted materially
since f934d43:

* Commits e44fafb and b49ff0d (2026-07-27) added a curated `Status:` disposition line to the top of
  **every** `idea-N/report.md` — a three-value vocabulary of **LANDED** (13: ideas 2, 7, 10, 11, 12,
  13, 17, 19, 21, 22, 23, 24, 25), **NOT PROMOTED** (7: ideas 1, 4, 5, 6, 15, 16, 20), and **OPEN**
  (5: ideas 3, 8, 9, 14, 18), each with README-relative pointers to the live file, run record, or
  still-open gap. These lines already encode the corrected facts the reviewer demanded (idea-4 and
  idea-6 NOT PROMOTED; idea-22 reframed accurately: the composite view is the Combined layer of
  `bin/gen-coloring-book-proof-sheet.mjs`, the standalone CLI was not promoted).
* `tools/asset-gen/ideas-exploration/README.md` itself is essentially unchanged: lines 7–12 still
  say "nothing from these experiments is live in the pipeline … intended for a follow-up session to
  review and decide what to promote"; the scoreboard (lines 30–58) has no Status column; the "What a
  follow-up session should probably do first" list (lines 60–77) is intact.
* `tools/asset-gen/.ruler/AGENTS.md` (and its generated `CLAUDE.md`/`AGENTS.md`, line ~127) still
  says "24 of 25 ideas were validated there, and several carry finished patches/assets waiting to be
  promoted" — the stale claim the reviewer flagged.

So the finding is now *narrower*: the per-idea dispositions exist and are correct; only the README
(the entry point the CLAUDE.md orientation sends readers to) and the `.ruler/` pointer still tell
the pre-promotion story.

**Prior attempt / why it was deferred:** Failed adversarial review, three rounds. The reviewer's
objections were about disposition *facts*, not the approach: the intro sentence "nothing from these
experiments is live" was left untouched; rows 4, 6, and 22 were classified LANDED when their
deliverables never shipped; rows 1 and 5 needed a SUPERSEDED status; derived counts were wrong after
reclassification; the stale pointer in `tools/asset-gen/.ruler/AGENTS.md` ("several carry finished
patches/assets waiting to be promoted") was never fixed; and idea-24's Status path was
repo-root-relative while every other path was README-relative.

#### Proposed solution

**FIX — clear winner.** The README is still stale at HEAD, but the disposition facts it needs now
live in the per-report Status lines added since the pinned SHA. Rewrite the README to derive from
those lines instead of re-applying the draft, whose disposition table now contradicts them.

Write a fresh, smaller fix that treats the report Status lines as the source of truth:

1. **Intro (lines 7–12):** keep the historical fact (every subagent reverted to pristine before
   exiting), then state that the promotion pass has since happened — 13 ideas LANDED, 7 NOT
   PROMOTED, 5 still OPEN — that each report opens with a `Status:` line giving its disposition and
   live-file pointer, and link `../docs/gemini-3.1-migration.md` as the run record.
2. **Scoreboard:** add a slim Status column carrying only the status word (`LANDED` / `NOT PROMOTED`
   / `OPEN`), no paths. Paths stay in the report Status lines — one bookkeeping surface, and it
   moots the reviewer's idea-24 path-relativity objection outright.
3. **"What a follow-up session should probably do first" (lines 60–77):** replace with a short
   retrospective — the list was executed in the 2026-07 wave (`../docs/gemini-3.1-migration.md`);
   remaining open work lives in `area:asset-gen` GitHub issues, and the five OPEN Status lines name
   the scorers that were validated but never built at HEAD.
4. **`tools/asset-gen/.ruler/AGENTS.md`:** replace "24 of 25 ideas were validated there, and several
   carry finished patches/assets waiting to be promoted" with a sentence saying dispositions live in
   each report's Status line and the README scoreboard; run `npm run ruler:apply` and commit the
   regenerated `CLAUDE.md`/`AGENTS.md` (this was reviewer objection 6, and the draft's round-3
   version of this edit is a usable reference).

What must change vs the rejected draft to survive the recorded objections: adopt HEAD's three-status
vocabulary (drop the draft's SUPERSEDED — HEAD's Status lines state the superseding fact in prose
under NOT PROMOTED); take counts from the Status lines (13/7/5), not the draft (11/3/11); keep all
paths out of the scoreboard; and keep the intro rewrite plus the `.ruler/` fix, the two objections
the Status-line commits did *not* already absorb.

Sketch of the intro replacement:

```markdown
… and **reverted the repo to pristine before exiting** — so nothing landed *during* the exploration.
The promotion pass has since happened: 13 ideas LANDED, 7 were NOT PROMOTED, and 5 remain OPEN. Each
report opens with a `Status:` line naming its disposition and, where landed, the live `bin/`/`lib/`
file; `../docs/gemini-3.1-migration.md` is the run record of the wave that closed most of the rest.
```

**Alternatives weighed:** 1. **Rewrite the README against the HEAD Status lines (winner).** Small,
factually anchored, keeps one source of truth for per-idea pointers. Cons: none significant. 2.
**Apply the draft patch and reconcile.** Rejected: the draft's disposition table (11 LANDED + 3
SUPERSEDED + 11 NOT PROMOTED) disagrees with HEAD's curated 13/7/5 split — the draft demotes idea-22
to NOT PROMOTED where HEAD's later, more accurate Status line calls it LANDED via the proof sheet's
Combined layer, and the draft lacks HEAD's OPEN class entirely. Reconciling the patch costs more
than rewriting and would reintroduce a second disposition vocabulary.

**Landing note:** Re-stage in docs/AUDIT.md with the solution text above (explicitly: derive from
the report Status lines; do not apply the draft patch). Alternatively fix directly — it is a
two-file Markdown/ruler change with `npm run ruler:apply` + `npm run format:check` as the only
gates.

#### Verification

`npm run check` plus the unit/E2E suites covering the touched files (see the solution for any
targeted commands).
