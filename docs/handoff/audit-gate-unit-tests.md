# Handoff — unit tests for the asset-gen quality gates

> 2026-07-14 · branch `claude/audit-tools-unit-tests-xovb7w` · plan only, nothing implemented yet ·
> give every deterministic image gate a broken-in/good-in unit test (the `composite-eye.test.mjs`
> pattern), extended catalog-wide

## Objective & non-goals

**Objective.** Every quality gate in `tools/asset-gen/` is a pure, offline, deterministic function
(image buffer(s) in → score/verdict out, no Gemini/network). Give each one a Vitest suite that feeds
a **known-broken** image and asserts the gate FAILS, and a **known-good** image and asserts it
PASSES — plus a margin assertion that the two classes straddle the threshold constant with a gap.
This both locks the gates against regression **and** answers "is each gate load-bearing, or
redundant?" (see the redundancy matrix below).

**Non-goals.**
- Not building any *new* gate, and not closing the known blind spots in `tools/asset-gen/docs/ISSUES.md`
  (those are un-gated classes — leave them un-gated; just don't mistake "all gates green" for "image good").
- Not touching the `gen-*` generators' behaviour, thresholds, or the shipped assets.
- Not re-freezing `golden/golden-scores.json` — the golden diff is a *catalog* fixture, orthogonal to
  these per-gate unit tests.

## State

- **Branch:** `claude/audit-tools-unit-tests-xovb7w` (forked context; only this handoff is committed).
- **PR:** none.
- **Commits landed:** none — this is a plan-only handoff. Nothing in `lib/`, `bin/`, or `tests/` has
  changed.
- **Files that WILL be touched when implemented:** new `tools/asset-gen/tests/*.test.mjs` + matching
  `tools/asset-gen/tests/fixtures/<scorer>/` dirs; two extractions in `tools/asset-gen/lib/` (below).
  No production/app code.

## The landscape (what exists today)

**Test infra is already in place — one gate is done, the rest are the work.**
- Runner: root script `test:asset-gen` = `vitest run --config tools/asset-gen/vitest.config.mjs`
  (Node env, `include: ['tests/**/*.test.mjs']`), already rolled into `npm test`.
- The template to copy: `tools/asset-gen/tests/composite-eye.test.mjs` + `tests/fixtures/composite-eye/`
  (good+bad webp trios, `manifest.json`, `README.md`). It tests `scoreCompositeEyes`: 2 broken
  (blank-orb) must fail, 3 good must pass, + a margin test. **Replicate this shape per scorer.**

**The audits (CLI gates), all offline, all in `bin/`:**

| npm script | runner | scorer(s) wrapped |
| --- | --- | --- |
| `gen:coloring-outlines:audit` | `audit-outline-solidity.mjs` | `scoreSolidity`, `scoreEyeRings` |
| `gen:coloring-fills:audit` | `check-coloring-drift.mjs` | `outlineMatch` |
| `gen:coloring-fills:audit:eyes` | `audit-fill-eyes.mjs` | `scoreEyeFill`, `judgeLightEyes`, `judgeNightEyes`, `scoreCompositeEyes` |
| `gen:coloring-fills:audit:shapes` | `audit-invented-shapes.mjs` | `detectInventedShapes` (inline — extract) |
| `gen:coloring-fills:audit:halo` | `audit-night-halo.mjs` | `auditPage`/`haloScore` (inline — extract) |
| `gen:coloring-golden:diff` | `audit-golden.mjs` | aggregate of all the above vs `golden-scores.json` |

**The deterministic algorithms = the units to test** (all in `lib/`, thresholds exported):

| module · export | threshold consts | broken-fixture idea |
| --- | --- | --- |
| `solid-regions.mjs` · `scoreSolidity` | `SOLID_BLOB_MAX=100`, `SOLID_INTERIOR_MAX=60` | owl/ant solid-pupil outline; bee-tall fake-hollow (fragmented interior) |
| `eye-fill.mjs` · `scoreEyeRings` | `EYE_RING_DEPTH_MAX=4` | caterpillar-tall hypno-swirl (depth 5) |
| `eye-fill.mjs` · `scoreEyeFill`/`judgeLightEyes`/`judgeNightEyes` | `EYE_LIGHT_MIN=150`, `EYE_DARK_MAX=100`, `EYE_CONTRAST_MIN=60`, `BAND_BLIND_INK_FRAC=0.5`, `CHALK_WHITE_MIN=245` | bee-wide flat-flooded eye; dead-sclera ladybug |
| `outline-match.mjs` · `outlineMatch` | `KEEP_THRESHOLD=0.92`, `LOCAL_KEEP_THRESHOLD=0.8` | ant-wide drifted-flower raw (93% global / 34% worst-tile) |
| `night-scores.mjs` · `scoreNightness`/`scoreDrift`/`scoreLineColor` | `NIGHT_BG_LUMA_MAX_DEFAULT=60`, `DRIFT_THRESHOLD_DEFAULT=0.004`, `LINE_WHITE_MIN_DEFAULT=150` | sky-blue bg take; invented-white-stroke take; re-inked-dark-lines take |
| `composite-eye.mjs` · `scoreCompositeEyes` | `CORE_DARK_FRAC_MIN=0.07` | ✅ **already tested** |
| `morphology.mjs` · `dilateMask`/`erodeMask` | — | synthetic hand-built masks (no images) |
| `punch-fill.mjs` / `night-composite.mjs` | `OUTLINE_LUMA_THRESHOLD=150` | transforms — optional golden-buffer tests |

## Decisions made (and why)

1. **Copy the `composite-eye` fixture+test pattern rather than invent a new harness.** It already
   proves the good/bad + margin approach works under the Node/sharp Vitest config; consistency lets
   `resume-handoff` and reviewers read all suites the same way.
2. **Extract the two inlined algorithms into `lib/` first (Phase 0).** `detectInventedShapes` lives
   inside `bin/audit-invented-shapes.mjs` and the halo scorer inside `bin/audit-night-halo.mjs`.
   They can't be unit-tested cleanly while embedded in a CLI that walks the catalog and calls
   `process.exit`. Extract each to a pure `(fillBuf, srcBuf) → result` export (`lib/invented-shapes.mjs`,
   `lib/night-halo.mjs`), leaving the bin a thin wrapper — mirrors how every *other* scorer is already
   split lib/bin, and matches the repo's own `extract-audit` convention.
3. **Fixture sourcing, cheapest first:** (a) recover pre-fix regressions from the SHAs in
   `tools/asset-gen/legacy/README.md`; (b) synthesize procedurally (a black disc on white = a solid
   region; a planted colored blob = invention) — best for morphology and the never-committed
   fake-hollow case; (c) crop shipped good assets for the pass cases. Store full-res q90 webp — the
   eye finders are native-resolution-bound (downscaling loses the defect; noted in the composite-eye
   fixture README).
4. **The load-bearing test is a by-product of fixture design, not a separate task.** Per
   `legacy/README.md`, every gate was born from a specific shipped regression. For each gate, its
   broken fixture should be one **only that gate catches**. Run every gate over every broken fixture →
   a fixtures×gates matrix; a gate that is never the *sole* catcher is a removal candidate.

## Unverified assumptions

- **The pre-fix regressions still reproduce at the SHAs in `legacy/README.md`.** The composite-eye
  fixtures were recovered this way (`e05696e^`, `868c9c7^`), but the solidity/ring/drift/eye-fill
  fixture SHAs (`b801d1c`, `4482aca`, `6840bba`, `551ab52`, `d96ae6f`) have **not** been checked out
  and re-scored this session. Verify each still fails its gate before committing it as a fixture.
- **`detectInventedShapes` and the halo `auditPage` extract cleanly** with no hidden dependency on
  CLI-parsed args or `process.exit` paths. Believed true from reading them; not attempted.
- **The night-fill broken cases can be synthesized or cropped** without a Gemini call. The
  invented-shapes audit header claims a "synthesized positive" was used for IDEAS #13, so synthesis
  is precedented, but the exact recipe for a sky-blue-bg / re-inked-lines night fixture is not written
  down — may need a crop from a pre-fix SHA instead.

## Done & verified

- Nothing implemented, so nothing to trust as done. `npm run test:asset-gen` currently passes with the
  single existing `composite-eye` suite (state at fork; not re-run this session).
- The plan's factual map (scorer signatures, thresholds, which bin wraps which lib, the legacy
  fixture chronicle) was cross-checked by two independent reads of the source this session — treat the
  tables above as accurate, but re-open the files before coding.

## Risks & next 3 steps

**Risks.**
- Fixture bloat / repo size: committed webp fixtures add up. Keep them minimal (one broken + one good
  per gate is enough for the load-bearing signal); prefer synthetic where it suffices.
- A "broken" fixture that also trips an *unrelated* gate muddies the redundancy matrix — isolate each
  defect to the single failure class it's meant to prove.
- Threshold tests can become brittle if they assert exact scores; assert **verdict + a margin gap**,
  not a magic number (the composite-eye margin test is the model: `legible - trueP > 0.1`).

**Next 3 steps (ordered).**
1. **Phase 0 — extractions.** Move `detectInventedShapes` → `lib/invented-shapes.mjs` and the halo
   scorer → `lib/night-halo.mjs`; repoint the two bins; confirm `gen:coloring-fills:audit:shapes` and
   `:halo` still produce identical output on a sample category (no behaviour change).
2. **Phase 1 — the four history-backed suites** (fixtures already exist in git): `solid-regions.test.mjs`,
   `eye-rings.test.mjs`, `outline-match.test.mjs`, `eye-fill.test.mjs`. These cover the whole "eye
   problem" chronicle. Add `morphology.test.mjs` (synthetic) as a warm-up needing no image fixtures.
3. **Phase 2 + 3 — remaining suites** (`night-scores`, `invented-shapes`, `night-halo`), then build
   the fixtures×gates **redundancy matrix** and record it in a short `tools/asset-gen/docs/` note,
   cross-linking the `ISSUES.md` blind spots as "known un-gated classes."

Commit one suite (+ its fixture dir + manifest) at a time so progress is incremental and each is
independently reviewable. Run `npm run test:asset-gen` after each.

## Reread first

- `tools/asset-gen/tests/composite-eye.test.mjs` + `tests/fixtures/composite-eye/{README.md,manifest.json}`
  — the exact pattern to replicate.
- `tools/asset-gen/legacy/README.md` — the failure→gate→fixture-SHA chronicle (the fixture goldmine
  and the load-bearing evidence).
- `tools/asset-gen/docs/ISSUES.md` — the gate blind spots (cases NO gate catches; the negative space).
- `tools/asset-gen/docs/pipeline.md` — every gate and the regression that motivated it, in prose.
- Scorer sources: `lib/{solid-regions,eye-fill,outline-match,night-scores,composite-eye,morphology}.mjs`;
  inline algorithms to extract in `bin/{audit-invented-shapes,audit-night-halo}.mjs`; the aggregate in
  `bin/audit-golden.mjs`.
- `tools/asset-gen/vitest.config.mjs` and the root `package.json` `test:asset-gen` script — how these
  run.
