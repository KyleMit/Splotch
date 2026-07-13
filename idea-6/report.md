# Idea #6 — Pen normalization + light-fill regen for dead eyes

**Verdict: WORKED.** Validated end-to-end on two pages (`objects/teddy-tall`,
`vehicles/police-tall`) with 6 Gemini calls (cap was 8). Both pages' light-side
eye-audit FAILs cleared, registration held at 100%/100%, and night/chalk assets
were empirically proven untouched (the re-punched night fill came back
byte-identical). A large bonus finding: for most pages the **light fill does not
need regenerating at all** — re-punching the existing raw against the normalized
pen is free and produced an equally lively (arguably better) shipped fill.

## The mechanism (why the eyes are "dead")

Accident-era pens draw pupils as SOLID INK. Three consequences:

1. The eye's darkness belongs to the *outline*, not the *fill* — the fill has no
   dark paint of its own at the eye.
2. The punch (`punch-fill-outlines.mjs`) masks every dark line-art pixel and
   inpaints it with bled neighbor color — so the shipped `.light.webp` shows a
   ghost-white smear where the pupil should be (see
   `teddy-tall.shipped-light-face.before.webp`,
   `police-tall.shipped-light-face.before.webp`).
3. The eye scorer (`lib/eye-fill.mjs scoreEyeFill`) samples only non-ink pixels
   of the *source* pen — a solid pupil is ink, so the dark side of the eye is
   invisible to it: `bandDark≈250` on a white band → every core flat → light
   FAIL.

After normalization the pupil is a thin ring: the fill supplies the black pupil
as *paint*, the punch keeps it (paint isn't line art), and the scorer can see it.

## What was run

### objects/teddy-tall (blob 719 → 0)

1. `npm run gen:coloring-outlines:normalize -- objects/teddy-tall --max-attempts 3 --apply`
   — best of 2 attempts scored keep 96.0% / **local 0.0%** / rev 100%: the model
   deleted the small star above the teddy's head (overlay evidence:
   `teddy-tall.normalize-attempt1-overlay.webp`). Exact repeat of the bee-wide
   "deleted a cloud" precedent — the worst-tile gate caught it. **2 calls.**
2. Retry with `--notes "The scene contains a small five-pointed STAR floating
   above the teddy bear's head — KEEP that star … keep both clouds, all toy
   blocks, the grass tufts, and the heart"` → passed on the first attempt:
   blob 719→0, keep 100.0%, local 99.6%, rev 100.0%, applied. **1 call.**
3. Pen verification: `scoreSolidity` passes (blob 0, interior 0), ring depth 3
   (≤4), all 10 source eye cores preserved at the same coordinates, all three
   stars/clouds/blocks/heart intact (`teddy-tall.pen-full.after.webp`).
4. **Before regenerating anything**, re-scoring the OLD light raw against the
   NEW pen already flipped the audit: lively 0→2, `judgeLightEyes` passes. (The
   old raw carries its own ink copy of the solid pupil; once the pen no longer
   marks those pixels as ink, they count as dark *paint*.)
5. `npm run gen:coloring-fills -- objects/teddy-tall` → passed in 2 tries: keep
   100.0%, local 100.0%, white 0.1%. **2 calls.** New shipped fill has a real
   painted pupil + white catchlight (`teddy-tall.shipped-light-face.after.webp`).
   Side note: the new raw is *more* faithful than the old one — the old raw had
   invented a polka-dot bow and a belly patch not present in the pen (fills have
   no reverse-keep gate; that's IDEAS #13 territory).
6. Audits: `gen:coloring-fills:audit:eyes -- objects/teddy-tall` → light ok
   (2 lively), night ok. `gen:coloring-fills:audit` → keep 100.0% / worst tile
   100.0%. 0 flagged.
7. Isolation check: `git status` showed only `teddy-tall.outline.webp`,
   `teddy-tall.light.raw.webp`, `teddy-tall.light.webp` modified — chalk, night
   raw, shipped night untouched, as the pen/chalk fork predicts.

### The zero-API fallback (tested on teddy, then used as the whole police path)

Re-punching the **old** raw against the **new** pen
(`punchFill('…teddy-tall.light.raw.webp')` with the old raw restored) produced a
shipped fill with fully lively eyes — and preserved the page's shipped palette
exactly (brown nose, polka-dot bow) since only the ex-solid regions change
(`teddy-tall.shipped-light-face.oldraw-newpen.webp`). Why it works: the
normalizer's keep gate forces the new ring to trace the old solid's boundary, so
the old raw's ink copy of the pupil sits exactly inside the new ring and
survives the punch as paint.

### vehicles/police-tall (blob 1886 → 0)

1. `normalize -- vehicles/police-tall --max-attempts 2 --apply` → first attempt:
   blob 1886→0, keep 100.0%, local 99.6%, rev 100.0%, applied. **1 call.**
2. `npm run gen:coloring-punch -- vehicles/police-tall` (free) — no fill regen at
   all. The shipped `.night.webp` was re-derived and came back **byte-identical**
   (not in `git status`), empirically confirming night keys off the chalk.
3. Audits: light ok (2/2 lively), night ok, drift 100.0%/100.0%. 0 flagged.
4. Evidence: `police-tall.shipped-light-face.{before,after}.webp` — ghost-white
   smears → black painted pupils with catchlights.

## Worst-first ranking (offline audits, full outputs in this dir)

`outline-audit.txt` (worst-first by biggest blob) top of ranking:
owl-tall 2908 · dog-tall 2309 · circle-tall 2253 · police-tall 1886 ·
dragon-tall 1861 · rectangle-tall 1767 · triangle-wide 1463 · owl-wide 1462 ·
velociraptor-tall 1445 · trex-tall 1436 … (72/102 outlines flagged SOLID).

`eye-audit.txt`: 94 pages audited, 58 flagged; **50 are light-side FAILs**, 8
are night-only. Cross-tab (see `light-fails.txt`, `solid-pens.txt`):

- **47 pages are light-FAIL AND solid-pen** — the population this idea fixes
  (creatures 10, farm 9, shapes 7, vehicles 7, dinosaur 6, space 5, objects 3;
  teddy-tall and police-tall were fixed in-experiment then reverted).
- 3 light-FAILs sit on already-thin pens (`objects/house-tall`,
  `objects/house-wide`, `space/ship-tall`) — different cause (likely non-eye
  cores/eyeless scenes), out of scope for this idea.
- The idea's "~10+ pages" undercounted: it's ~47.

## Rollout estimate

Per-page recipe (empirical):

1. `normalize --apply` (1–3 calls; add `--notes` naming small motifs — stars,
   clouds — when the worst-tile gate reports a deletion; the overlay PNG shows
   exactly what went missing).
2. `gen:coloring-punch -- <page>` (free) and re-run the two audits (free).
3. Only if the re-punched old raw fails the eye audit or looks off on the
   contact sheet: `gen:coloring-fills -- <page>` (1–5 calls).
4. Regen the page's thumb (`gen:coloring-thumbs`, free — it derives from the
   pen and goes stale).
5. Contact sheet per category; night assets untouched by construction.

Numbers for 47 pages: observed normalize cost 1.5 calls/page average across the
two trials (1, and 3-with-notes-retry) → est. ~1.5–2.5 calls/page ≈ **70–120
normalize calls**; if ~25% of pages end up needing a fresh fill (~12 pages ×
~2.5 calls) add ~30 → **~100–150 Gemini flash-image calls total ≈ $4–6** at
gemini-2.5-flash-image's ~$0.039/image, plus free re-punches/audits/thumbs.
Wall-clock: a few hours autonomous + per-category human contact-sheet review.

## Limitations / risks

- **The normalizer deletes small background motifs** at default temperature
  (star here, cloud in the bee-wide precedent). The worst-tile gate catches it;
  budget one `--notes` retry round on maybe a third of pages.
- **The audit flip is partly definitional**: solid-ink pupils are invisible to
  the eye scorer, so a light FAIL on a solid pen says "the fill *can't* paint
  this eye", not "the page looks broken in the app" (light mode's overlay draws
  the solid pupil). The real product wins are: the shipped fill's eye is real
  paint instead of inpaint smear, the uncolored page becomes a colorable
  outlined pupil, and the light raw becomes a valid eye reference for the night
  gates.
- **Visible product change**: uncolored light-mode pages (and stale thumbs until
  regenerated) switch from solid to outlined pupils — pipeline.md already flags
  this catalog-wide ("Light-mode uncolored pages show outlined pupils").
- The zero-API re-punch keeps the old raw registered against a pen whose ink
  footprint shrank; drift audit still scores 100% (the raw's extra ink covers
  the ring), but any page where the ring did NOT trace the old boundary would
  show black bleeding outside the ring — eyeball the crop before shipping.
- Spiral-eye pages (`nature/caterpillar-wide`, `ladybug-wide`) excluded — idea
  #5's harder case; the normalizer may need `--force` there (their solidity
  passes so it skips them).
- `creatures/owl-tall` (riskiest: perfect chalk) was not attempted for budget
  reasons, but the police-tall byte-identity result proves the light-only path
  can't touch its chalk/night; treat it as a first-review candidate on rollout.
- Cores are re-derived from the pen, so the night-eye audit's reference set can
  shift after normalization; on both trial pages core count and positions were
  stable and night stayed ok — still, re-run the full audit per page.

## Repo state

Everything reverted; `git status --porcelain` clean. Normalizer candidates
remain in the gitignored `.coloring-samples-dark/normalize/`. The applied
normalized pens and regenerated teddy fill were reverted with the rest — a
rollout session must re-run the recipe (the exact commands above reproduce it).

## Files

- `code/inspect-page-eyes.mjs` — page inspector (solidity + ring depth + eye
  cores + per-core liveliness on the light raw + eye-region crops). Copy into
  `tools/asset-gen/` and run from the repo root (imports resolve relative to
  that folder).
- `outline-audit.txt`, `eye-audit.txt` — full audit outputs (2026-07-12).
- `light-fails.txt`, `solid-pens.txt` — the cross-tab inputs.
- Before/after evidence webps (long side ≤ 560), listed in `meta.json`.
