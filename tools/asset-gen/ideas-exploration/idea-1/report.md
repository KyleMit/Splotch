# Idea #1 — Dark-bodied subjects re-ink their outlines dark

**Verdict: WORKED** (approach (a), refined to an inpaint rule with a near-black protection floor and
a lineW page gate). Approach (c) partially works but has collateral damage at r≥2; approach (b)
whitens the lines but redraws fills and is not a surgical fix.

Everything below ran against the committed assets at baseline `8e471b8`; the repo was never modified
(all code + outputs live outside the repo). 5 of the allowed 8 Gemini calls were spent (3 on
train-wide, 2 on cat-wide).

## What the artifact actually is

Built a measurable definition of "the rim" first: for every pixel at chebyshev distance 1–3 from the
chalk ink (the punch mask), compare its luma against a **reference punch** whose mask was dilated 4
px (so the whole collar is inpainted from fill color beyond any plausible rim).
`rimΔ = luma(ref) −
luma(shipped)`; a re-inked rim shows as a large positive Δ, a legit dark fill
shows ≈0 because the reference is equally dark. (`code/analyze-rim.mjs`.)

Baseline measurements (shipped punches):

| page                         | lineW | band-1 rimΔ>40 share | where the rim is                                                                                                 |
| ---------------------------- | ----- | -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| vehicles/train-wide          | 75    | 0.37%                | the FACE: mouth/smile outline, nose circle, sclera edges, face arc (`vehicles-train-wide.rim-overlay.full.webp`) |
| farm/cat-wide                | 165   | 4.93%                | mostly FALSE positives: the hay bale's legit dark straps hugging lines (`farm-cat-wide.rim-overlay.full.webp`)   |
| shapes/circle-wide (control) | 251   | 0.00%                | clean — the metric doesn't fire on bright-line pages                                                             |

Two important discoveries while chasing the visible artifact at 4× zoom:

1. **The train's visible rim is a mid-dark penumbra (raw luma ~80–140), not near-black ink**,
   hugging the outside of the white strokes — most visible as a dirty shadow around the
   mouth/smile/nose against the brown face (`vehicles-train-wide.before.mouth.webp`).
2. **The speckle ring inside the eye is NOT punch rim.** ASCII luma maps show it is the raw's own
   soft/antialiased pupil edge sitting >2 px inside the chalk's pupil hole — no punch-mask change
   can reach it without eating the pupil. That residual belongs to idea #15 (raw quality), not idea
   #1.

## (a) post-process the raw at chalk-line positions — WORKED, with two amendments

The literal IDEAS.md phrasing ("paint them white") is **harmful**: painted-white rim pixels screen
to a white halo around every line (`vehicles-train-wide.a-white.chin.webp` vs `before.chin.webp`).
The right treatment is to add the pixels to the punch mask so the standard neighbor-bleed inpaints
them.

Final validated rule (`code/punch-rim-erase.mjs`):

    extend the chalk punch mask by every pixel within 2 px of chalk ink whose
    RAW luma is in [55, 145), then bleed as usual
    — applied only to pages failing the lineW gate (< 150)

* **Upper bound 145** catches the penumbra. Legit dark fills adjacent to lines (night sky, the cat's
  bale straps) also match but re-bleed their own color from 2 px further out — composite change is
  invisible (control page: 0.026% of pixels change >30 luma, no visible diff; cat straps intact:
  `farm-cat-wide.a-dark145r2.bale.webp`).
* **Lower bound 55 is load-bearing.** Without it the owl's bold near-black eye ring (~6 px wide,
  chalk strokes on both sides) is bled away to grey/white — a flagship-page regression
  (`creatures-owl-tall.a-dark145r2.eye2.webp` shows the destruction;
  `creatures-owl-tall.a-final.eye2.webp` shows the floor protecting it).
* **Radius 2**: r=1 leaves visible rim; r≥3 starts eating pupil edges.
* **Page gate**: catalog lineW spot-checks — train-wide 75 (treated), cat-wide 165, unicorn-wide
  168, garbage-tall 170, owl-tall 201, circle-wide 251, spider-tall 254 (all skipped). Only the
  pages that shipped with the dark-outline ⚠ get touched; the luma bounds are defense in depth.

Results on train-wide: band rimΔ>40 share 0.20% → 0.08%; the mouth/nose shadow is gone
(`vehicles-train-wide.a-final.mouth.webp`), the pupil and catchlight untouched
(`vehicles-train-wide.a-final.eye.webp`), composite changes confined to 0.117% of pixels.

Also tried and rejected within (a):

* **rimΔ-threshold selection** (punch pixels with rimΔ>25): partial rim removal but blotches legit
  thin stripes (ate a chunk of the cat's bale strap, `farm-cat-wide.a-selective.bale.webp`) and
  misses rim next to dark features (Δ reference is dark there too).
* **thin-structure opening** (punch only overhang removed by a morphological opening, protecting
  thick dark bodies): cannot separate the train's ~5 px shadow from the owl's ~6 px legit ring —
  protected both, fixing nothing (train rim 0.20% → 0.20%).

## (c) blanket punch-mask dilation — PARTIAL

* **r=1**: safe everywhere (control page: no visible diff) but removes only about half the visible
  rim (`vehicles-train-wide.c-dilate1.mouth.webp`).
* **r=2**: removes most rim but visibly erodes small features — the train's pupil edge and
  catchlight smear, beige contamination creeps into the sclera
  (`vehicles-train-wide.c-dilate2.eye.webp`). Not shippable as a blanket default.

The (a) final rule is strictly better: it is (c) r=2 restricted to the mid-dark band, which is
exactly the part of the collar that is safe to re-bleed.

## (b) Gemini image-edit on the good take — PARTIAL (works for lines, re-rolls fills)

Prompt: "repaint every outline stroke BRIGHT WHITE… CHANGE NOTHING ELSE ANYWHERE", t=0.2,
`gemini-2.5-flash-image`, aligned with `alignToSource`, scored with the pipeline's own lineW math
(`code/edit-whiten-lines.mjs`).

| take          | lineW     | fill pixels changed >40 luma (outside a 3px chalk collar) |
| ------------- | --------- | --------------------------------------------------------- |
| train-wide #1 | 75 → 206  | 6.6%                                                      |
| train-wide #2 | 75 → 213  | 3.7%                                                      |
| train-wide #3 | 75 → 224  | 14.9%                                                     |
| cat-wide #1   | 165 → 161 | 3.6%                                                      |
| cat-wide #2   | 165 → 227 | 7.6%                                                      |

Line whitening genuinely works — every train take clears the 150 gate that ~27 fresh-generation
attempts couldn't. But "change nothing else" is never honored: the best take still redrew the
train's eye (pupil reshaped and moved, `vehicles-train-wide.b-edit2.eye.webp`), recolored the
tongue, and added glow; cat-wide #2 dropped the bale's red strap bands and shifted the whole mood
(`farm-cat-wide.b-edit2.full.webp` vs `before.full.webp`). An edited raw is a new generation: every
gate (drift, registration, eyes) must re-run and the result re-reviewed. Use (b) only if a page's
raw is unsalvageable AND fresh generation keeps failing — and expect to re-review everything.

## Limitations

* The in-eye speckle (raw's soft pupil edge deep inside the chalk hole) is out of reach for any
  punch-mask approach — that is idea #15/#7 territory.
* Bounds 55/145 calibrated on 7 pages (train, cat, circle, owl, spider, garbage, unicorn). A future
  page with deliberate mid-dark (luma 55–145) art exactly 1–2 px wide beside a chalk line would lose
  it — the lineW page gate makes that exposure near-zero today (one page in the catalog).
* The rimΔ analysis machinery (`code/analyze-rim.mjs`) doubles as the idea #7 halo audit — the band
  statistics + hotspot ranking are exactly what #7 asks for.

## Recommendation

1. Lift `addRimOverhang()` (`code/punch-rim-erase.mjs`) into `lib/punch-fill.mjs` behind an opt-in
   flag; have `punch-fill-outlines.mjs` enable it for night raws whose lineW < 150 (computable
   offline from the committed raw + chalk, or a tiny per-page flag list — today: train-wide only).
2. Do NOT adopt blanket dilation or paint-white.
3. Treat (b) as a last-resort regeneration lever, not a post-process.
