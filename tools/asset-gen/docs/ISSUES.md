# ISSUES — known outstanding issues in the asset pipeline

The living list of what's known-imperfect right now: defects in shipped assets, gate blind spots,
and tooling gaps. Distinct from [`IDEAS.md`](IDEAS.md) (the exploratory quality backlog, mostly
burned down in [`ideas-exploration/`](../ideas-exploration/README.md)) and `docs/AUDIT.md`
(repo-wide engineering findings). Current as of the
[`gemini-3.1-flash-image` migration](gemini-3.1-migration.md) and the
[fresh-outline regeneration pass](fresh-outline-regen.md) (both 2026-07-13). When you fix one,
delete it; when you find one, add it.

## Shipped-asset issues

1. **Light-mode eyes on accident-era pens are dead/solid** (IDEAS #6 — the biggest remaining
   light-theme lever). 35 pages carry a light-side flat-eye flag
   (`npm run gen:coloring-fills:audit:eyes` prints them; 53 before the 3.1 regen, 39 before the
   2026-07-13 fresh-outline pass). The root cause is the pen: a solid-ink pupil gives the fill
   nothing to paint. Two proven fixes: pen normalization (`gen:coloring-outlines:normalize`,
   worst-first) + light-fill regen, or a brand-new drawing via `gen:coloring-outlines:fresh` +
   full-suite regen (the 2026-07-13 pass cleared the 4 worst real-face offenders — `farm/dog-tall`,
   `shapes/circle-tall`, `vehicles/police-tall`, `objects/teddy-tall` — every one first-take through
   every downstream gate; see `docs/fresh-outline-regen.md`). The biggest remaining real offender is
   `creatures/owl-tall` (blob 2908), deliberately left alone: its celebrated chalk derives from the
   current pen, so it should get a light-only treatment, not a fresh drawing. Night mode is
   unaffected (the chalk owns those whites). Note some of the 35 are detector noise, not defects —
   see blind spot #6.
2. **Motif consistency across sibling pages is unenforced** (IDEAS #2): the same motif can get
   different treatments per orientation — e.g. `dinosaur/pterodactyl-tall` now renders its sun warm
   gold while `-wide` has a crescent moon. Nothing looked wrong in the 3.1 review, but every regen
   re-rolls these calls independently.
3. **Light↔night and tall↔wide palette coherence are unenforced** (IDEAS #8/#9): both fills of a
   page, and both orientations of a subject, are independent generations — the 3.1 wave re-rolled
   every palette. The hue-flip scorers and conditioning recipes in
   `ideas-exploration/idea-8`/`idea-9` were validated but not promoted.
4. **Style covers are still 2.5-era outputs.** The 3.1 migration swapped the model in
   `gen-style-covers.mjs` but did not regenerate covers — no gates exist for them, so a regen is an
   eyeball-only exercise.

## Gate blind spots

5. **Chalk whitening on solid-pen-eye pages is gate-blind** (proved by `vehicles/police-tall`, whose
   wave chalk whitened the pupils with the sclera — that page's 2026-07-13 fresh pen has ringed
   pupils now, but the class persists on every remaining solid-pen-eye page). A solid pen pupil has
   no nested rings → `findEyeCores` finds nothing → the eye-polarity gate (Stage 1.5 gate 4) passes
   vacuously, and the night eye judge is silent too (its chalk-white-nearby rule trusts the chalk).
   Only composite review catches it. A candidate scorer: chalk-ink fraction inside pen solid regions
   that sit at face positions.
6. **`judgeLightEyes` has no false-positive suppressions.** The IDEAS #12 fixes (band-blind annulus,
   chalk-white-nearby) apply only to the night judge, so light-side flags still fire on side-profile
   eyes (`farm/duck-wide`, verified lively), band-blind solid-pupil pages, and non-face cores
   (windows, hubs — `objects/house-tall`). Options: port the band-blind rule, or bless per-page eye
   annotations (`ideas-exploration/idea-12/code/eye-annotations.draft.json`).
7. **Night subject/background contrast is unmeasured** (`shapes/circle-wide` class): a fill can
   paint the hero region a color indistinguishable from the night sky and pass every gate. Caught by
   montage review this round; a "hero region ΔE vs background" scorer would close it.
8. **Colored-shape invention is only audited, not gated** (IDEAS #13): the detector that caught
   `objects/house-tall`'s two invented sky flowers lives in
   `ideas-exploration/idea-13/code/invented-shape-audit.mjs` and ran as a post-wave audit. Until
   it's a generation-time gate (or at least a first-class audit script), a light fill can ship an
   invented colored shape that keep/white/eye gates cannot see.
9. **The night mood bar's code default (≤ 100) is looser than the shipped catalog** (18–48,
   generated at `--night-luma-max 60`). A future regen that forgets the flag can reintroduce a dusk
   outlier that passes. Either keep passing the flag (documented in pipeline.md Stage 4) or lower
   `NIGHT_BG_LUMA_MAX_DEFAULT` in `gen-coloring-fills-dark.mjs`.
10. **3.1 resists erase-style edits on solid pen ink** — its faithfulness works against radical
    whitening/erase edits (police-tall took an explicit erase `--notes`; a 2.5-era chalk did the
    same edit unprompted). The pen normalizer is exactly this kind of edit and has NOT been
    exercised on 3.1 yet — budget extra attempts/notes the first time (relevant to issue #1's
    burn-down).

## Tooling / process gaps

11. **Promote the exploration auditors to first-class scripts**: the invented-shape audit (#13) and
    residual-halo audit (#7) proved their worth in the 3.1 wave but must be hand-copied out of
    `ideas-exploration/` to run (and the halo script's main-guard expects its original `idea7-…`
    filename). They belong in `tools/asset-gen/` with `gen:*` entries and `scripts-info`
    descriptions (ADR-0019).
12. **Golden-set regression fixtures (#23) and the light-asset sha256 manifest (#25) are still
    unlanded** — both have ready patches in `ideas-exploration/`. The 3.1 wave relied on ad-hoc
    baseline snapshots in a scratchpad instead; the next mass regen shouldn't have to.
13. **No per-page notes registry (#10):** the 3.1 wave's customizations (police-tall's erase note,
    circle-wide's contrast note, rectangle-wide's bubble note) live only in the
    [migration record](gemini-3.1-migration.md) — a future regen of those pages will re-fight the
    same battles unless it reads that doc. The validated registry design (auto-loaded
    `fill-src/<cat>/notes.json`) is in `ideas-exploration/idea-10`.
14. **Dark-mode picker still shows inverted-pen thumbnails** (IDEAS #19): every page now has a
    chalk, but the app still derives thumbs from the pen, so a child taps an inverted-pen thumb and
    gets chalk art on canvas. The five 2026-07-13 fresh-outline pages ship `{page}.chalk.thumb.webp`
    files as the first batch (unused until the app change); the rest of the catalog plus the small
    `thumbPath()` app change are still outstanding.
15. **The orphan pages are still uncataloged** (IDEAS #24): `shapes/heart-wide` and
    `objects/umbrella-tall` have complete, gate-green suites sitting in `ideas-exploration/idea-24/`
    awaiting promotion into `web/static/coloring/` + `books.ts` — note they are 2.5-era outputs, so
    consider regenerating on 3.1 when promoting.
