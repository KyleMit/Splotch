# Idea #23 — Golden-set regression fixtures

**Verdict: WORKED.** Built end-to-end, fully offline (0 Gemini calls): a freeze tool that snapshots every
cheap audit score for all 102 catalog line-arts (94 tall/wide pages + 8 covers) into one committed JSON,
and a diff tool that re-scores and exits non-zero on regressions. No-op diff is exactly clean
(byte-identical determinism), and a deliberate one-page revert was caught as exactly that page.

## What was built

Three files (see `code/golden-tooling.patch`, re-appliable on baseline `8e471b8`; verified with
`git apply --check` + a full end-to-end diff run from the re-applied state):

1. **`tools/asset-gen/lib/night-scores.mjs`** (new) — `scoreDrift` / `scoreNightness` / `scoreLineColor`
   extracted verbatim from `gen-coloring-fills-dark.mjs`, plus their default thresholds. These three
   generation-time gates previously lived only inside the Gemini generator, so the committed night raws
   could not be re-scored offline. Extraction mirrors what `lib/outline-match.mjs` already does for the
   light gate.
2. **`tools/asset-gen/gen-coloring-fills-dark.mjs`** (modified) — imports the three scorers from the lib;
   behavior unchanged (smoke-tested: all imports resolve, script reaches its normal arg validation).
3. **`tools/asset-gen/audit-golden.mjs`** (new) — `--freeze` and `--diff` modes, 4-way page concurrency.
4. **`package.json`** — `gen:coloring:golden:freeze` / `gen:coloring:golden:diff` npm scripts with
   `scripts-info` entries (ADR-0019).

`code/golden-scores-snapshot.patch` adds the generated `tools/asset-gen/golden-scores.json` (the real
catalog snapshot, 3,025 lines / 67 KB; a raw copy is beside this report as `golden-scores.json`).

## What's in the golden file

```
{ version, thresholds: { keep 0.92, localKeep 0.80, nightDriftMax 0.004, bgLumaMax 100,
                          lineWhiteMin 150, solidBlobMax 100, solidInteriorMax 60, eyeRingDepthMax 4 },
  pages: { "<category>/<page>-<orient>": {
    outline: { darkPx, interiorPx, solidPx, biggestBlob, strokeWidth, ringDepth, solidOk, ringsOk },
    light:   { keep, localKeep, worstTile, eyeCores, eyeLively, driftOk, eyesOk },      // when a light raw exists
    night:   { drift, bgLuma, lineWhite, eyesFailed, driftOk, moodOk, lineOk, eyesOk }  // when a night raw exists
} } }
```

- `outline` comes from `scoreSolidity` + `scoreEyeRings` (same math as `audit-outline-solidity.mjs`),
  scored for all 102 outlines including covers.
- `light` comes from `outlineMatch` + `scoreEyeFill`/`judgeLightEyes` (same math as
  `check-coloring-drift.mjs` and `audit-fill-eyes.mjs`), scored against the pen outline.
- `night` re-scores the committed night raws with the generation gates (drift/bgLuma/lineWhite) against
  the chalk outline when forked (else pen), and judges eyes on the simulated chalk composite
  (`compositeNight`) exactly as `audit-fill-eyes.mjs` does. These night numbers were previously computed
  only at generation time and thrown away — the golden file is the first place they persist.
- Floats are rounded before writing (keep 4dp, drift 5dp, lumas 1dp), keys sorted — diff-friendly and
  stable.

**Cross-validated against the canonical audits**: golden `light.keep/localKeep/worstTile` matches
`npm run gen:coloring-fills:audit -- nature` to the digit (e.g. spider-tall 99.99%/97.7% tile 7,1);
golden `light.eyesOk` matches `gen:coloring-fills:audit:eyes -- farm` page-for-page; golden
`outline.solidOk` matches `gen:coloring-outlines:audit -- shapes` page-for-page.

## Freeze runtime

Whole catalog: **~54 s** (freeze) / **~53-55 s** (diff; it re-scores everything), 4 pages concurrent,
~1m40s CPU. Fine as a manual pre/post-change check; would also fit CI if ever wanted (offline, no key).

## Baseline reality: 134 known-failing verdicts frozen

The freeze prints the verdicts that are already failing so they're an explicit, committed baseline —
134 of them (mostly `outline.solidOk` on pre-normalization categories and `light.eyesOk` on pages whose
outlines predate the thin-stroke redraw; plus the documented `night.lineOk` holdouts like
vehicles/train-wide and dinosaur/trex-wide). This matches the canonical audits — the audits post-date
much of the art. The golden diff is exactly the right tool for this state: it gates on *changes*, so the
known fails don't block anything, but a page flipping ok->fail (or a score moving the wrong way) does.

## Determinism

Two consecutive freezes produced **byte-identical** JSON (`cmp` clean). All scoring is pure sharp
decodes + integer/float math on committed files — no timestamps, no RNG, no environment leakage. The
diff's noise thresholds (keep ±0.005, drift ±0.001, lumas ±3, blob/interior px ±15) exist only to absorb
a future sharp-upgrade decode shift; verdict flips always gate regardless of noise.

## Spot-check transcript (both directions)

**No-op:** `npm run gen:coloring:golden:diff` ->
`102 page(s) diffed vs golden in 53.3s · 0 regression(s) · 0 improvement(s) · 0 other change(s). Clean` (exit 0).

**Deliberate revert:** `git checkout 6840bba -- tools/asset-gen/fill-src/nature/bee-wide.night.raw.webp`
(the pre-chalk-era night fill that shipped dead-eyed) ->

```
REGRESSIONS:
  nature/bee-wide  night.bgLuma 43.9 -> 49
  nature/bee-wide  night.lineWhite 252 -> 195

102 page(s) diffed vs golden in 54.5s · 2 regression(s) · 0 improvement(s) · 0 other change(s).
exit=1
```

Exactly one page flagged, exit non-zero; restored afterwards and the diff went clean again.
Interesting detail: `night.eyesOk` did **not** flip on the old dead-eyed raw — the eye judgment runs on
the simulated chalk composite, and the current chalk owns the eye whites, so it rescues the old raw's
verdict. The *numeric movement* detection (lineWhite dropping 252->195) is what carried the catch —
evidence that freezing raw scores, not just verdicts, is worth it.

**First revert attempt was a miss worth documenting:** `git checkout a81be48 --
fill-src/nature/ant-wide.light.raw.webp` (an older but different render) diffed **clean** — the old raw
scores keep=1.0000/localKeep=1.0000 and identical eye counts against the current outline. The famously
drifted ant-wide flower predates that blob. Lesson: the golden set catches *score* regressions, not
arbitrary byte changes — two valid renders can be score-identical (see Limitations).

## Limitations

- **Score-blind swaps:** an asset change that keeps every audit score identical (e.g. swapping between
  two clean renders) diffs clean. That's by design — the golden set guards quality metrics, not content
  identity. If content identity ever matters, add a content hash column per asset (cheap; but then every
  intentional regen touches the golden file).
- **The diff re-scores the whole catalog (~1 min) with no page/category filter.** Deliberate: a golden
  check's whole point is the other 93 pages. A `--only` filter would be easy if iteration speed matters.
- **Shipped `.light/.night.webp` and `.thumb.webp` aren't scored** — same rationale as the existing
  audits: they're deterministic derivations of the raws (punch), and a clean raw guarantees a clean
  punch. A punch-drift check would be a separate (cheap) column if wanted.
- **Chalk outlines have no dedicated columns** — they participate as the night scoring reference, so a
  chalk edit shows up through the night scores (drift/lineWhite/eyes), but no chalk-only metric exists in
  the audits today.
- `night.eyesFailed/eyesOk` are `null` for pages with a night raw but no light raw (the light fill is the
  reference for which cores are real eyes); the diff reports null<->value transitions as info, not
  regressions.

## Recommendations

- **Adopt as-is** (both patches). Freeze once, commit `golden-scores.json`, and make
  `gen:coloring:golden:diff` the standard post-change check for any pipeline or asset PR — it's the
  safety net every regen-heavy idea in IDEAS.md assumes. Re-freeze (and review the printed fail list) as
  the explicit "adopt the new baseline" act after an intentional change.
- **Future columns** as other idea-runs land their tools: #7's halo score, #13's invention-blob count,
  #14's local-warp score, and #3's chalk-fill disagreement all fit the same per-page shape — add them to
  `scorePage` + `METRICS` and re-freeze. The `version` field exists for exactly that migration.
- Consider whittling the 134 known fails down over time; the golden diff's IMPROVEMENTS section makes
  the progress visible (fixing a page prints `FAIL -> ok` and prompts a re-freeze).
