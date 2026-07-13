# Idea #9 — Tall↔wide palette coherence for the same subject

**Verdict: WORKED** — both halves landed. (1) The offline inventory exists: a subject-level
hue-signature scorer ranked all 46 tall/wide pairs in both modes and the worst offenders are
visually confirmed real (blue vs pink rectangle, green vs teal-with-orange-horns dragon, blue vs
green garbage truck). (2) Conditioning a `-wide` light fill on its `-tall` sibling was validated
end-to-end — but **not** the way IDEAS.md guessed: multi-image conditioning (the idea-8 recipe)
fails catastrophically across orientations because the model copies the reference's *composition*; a
**text palette plan extracted from the tall fill** appended to the proven single-image prompt fixed
`creatures/dragon-wide` on the first take (keep 100%, local 99.3%, EMD 52.9° → 10.6°).

## Part 1 — Cross-orientation hue-signature scorer (offline, no API)

`code/score-orient-coherence.mjs` (run from repo root; imports `lib/paths.mjs` +
`lib/morphology.mjs`):

* Regions don't correspond across orientations (separate pen drawings), so the scorer compares
  **color signatures**, not regions: for each orientation it segments interior fillable regions from
  the PEN outline (border-connected background excluded, ≥2 px clear of ink, slivers dropped) and
  accumulates a chroma-weighted circular hue histogram (36 × 10° bins) over the chromatic pixels
  (chroma ≥ 22).
* Two distances per pair, per mode:
  * **`emdDeg`** — circular earth-mover's distance between the normalized histograms, in degrees of
    average hue transport (ranking key).
  * **`mismatch`** — fraction of chromatic mass with no counterpart within ~35° on the other side.
* Top hue families are printed per side for human reading. `--wide-file` re-scores a pair against a
  fresh wide take (used to score the conditioned result).
* Runs the whole 46-pair catalog, light + night, in ~50 s.

### Inventory answer ("worth one contact-sheet pass just to inventory how bad it is")

It is bad, and broadly so. Light-mode: median EMD ≈ 21°, 8 pairs ≥ 50°, 4 pairs ≥ 86°. Night-mode
incoherence is *worse* and largely independent of light-mode incoherence (see below). Full table:
`ranking.txt` / `ranking.json`.

Worst light-mode pairs (EMD°, visually verified where noted):

| Pair              | EMD   | What it looks like                                                                                                                  |
| ----------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------- |
| shapes/rectangle  | 126.0 | **Confirmed**: tall = BLUE rectangle, wide = PINK rectangle (the shape IS the subject)                                              |
| nature/spider     | 102.1 | **Scorer false positive at subject level**: both spiders are purple; the divergence is scene (cream web vs blue sky + pink flowers) |
| space/meteor      | 87.1  | tall blue-dominant vs wide yellow-green                                                                                             |
| vehicles/garbage  | 86.4  | **Confirmed**: tall = BLUE truck, wide = GREEN truck                                                                                |
| vehicles/monster  | 69.6  | red vs red/yellow/orange mix                                                                                                        |
| space/station     | 66.5  | grey-white station vs gold station (night pair confirmed: 149.1°, white vs gold)                                                    |
| creatures/dragon  | 52.9  | **Confirmed (the IDEAS.md question)**: tall = green dragon, wide = teal dragon with ORANGE horns                                    |
| creatures/unicorn | 50.5  | cyan/green/purple vs red/yellow                                                                                                     |

Good controls (confirmed coherent): farm/dog 4.4° (brown dog both), dinosaur/trex 4.6°, farm/pig
5.6°.

IDEAS.md's suggested checks: **dragon confirmed incoherent** (green vs teal/orange). **balloon
confirmed incoherent** but under-ranked — tall = RED balloon, wide = YELLOW balloon (a total subject
flip) yet it scores only 37.9° because scene props (wagon, trees, sky) dilute the subject's share of
the histogram.

Night-mode is separately incoherent (median ≈ 38°; station 149°, circle 127°, triangle 123°,
astronaut 108°, meteor 104°, brachiosaurus 103°) and *uncorrelated* with light: `farm/cat` is
light-coherent (7.9° — orange cat both) but night 90.8° because only the TALL cat went blue at night
(idea #8's light↔night flip hitting one orientation only). Fixing idea #8's flips would fix much of
the night column here for free.

### Scorer limitations (important for reading the ranking)

* **It inventories the scene palette, not strictly the subject**: prop-heavy pages dilute the
  subject (balloon under-ranked at 37.9° despite a red→yellow subject flip) and scene-composition
  differences inflate scores when the subject is fine (spider over-ranked at 102°). It's a triage
  tool — worst-first review order — not a hard gate. A true subject scorer would need subject
  segmentation (largest-character heuristic or a VLM mask).
* Thresholds inherited from idea #8 (chroma ≥ 22 etc.), eyeballed not calibrated.
* Night pairs score raw-vs-raw on the pen segmentation (chalk traces pen, held up fine in practice —
  same as idea #8).

## Part 2 — Conditioning dragon-wide on dragon-tall (8 Gemini calls)

Target: `creatures/dragon-wide` light (the marquee IDEAS.md case). Reference: the shipped
**punched** `dragon-tall.light.webp` (idea #8's lesson — never the black-lined raw). Tool:
`code/gen-coloring-fills-cond.mjs`, a copy of `gen-coloring-fills.mjs`'s loop with all four standard
gates unchanged (keep / localKeep / white / eyes), writing to a scratch dir, never `fill-src/`.

| Calls | Approach                                                                                                                                                                                                                       | Result                                                                                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–4   | **Multi-image** (wide outline first, punched tall fill second, "use IMAGE 2 ONLY for colors, never its pose/framing"), t 0.4→0.85                                                                                              | **Total failure**: keep 8–26%, local 0%. The model produced the TALL dragon's composition — it copied the reference *drawing*, not its palette. See `dragon-wide-failure-composition-copy.webp`.     |
| 5–6   | Multi-image with the reference **downscaled to a 320 px thumbnail** + "small thumbnail, reproducing IMAGE 2 is a failure", t 0.3                                                                                               | Still fails (keep 15–21%): now a *hybrid* — wide scene props but the tall dragon's pose redrawn in the middle. Palette right, registration destroyed.                                                |
| 7–8   | **Text palette plan** (single image, the proven verbatim fill prompt + a COLOR PLAN block: per-part colors with hexes auto-extracted from the tall punched fill + "do NOT color the dragon teal/cyan… no orange horns"), t 0.4 | **Works first take**: keep 100.0%, local 99.3%, white 0.2%. Wide line art perfectly held, dragon green with pale yellow-green horns/wings/belly. EMD vs tall: **52.9° → 10.6°** (control territory). |

The eye gate reported `flat eyes` on both text-palette takes — but the **shipped**
`dragon-wide.light.raw.webp` fails `judgeLightEyes` with the *same* near-white "cores" at the same
coordinates, so this is a pre-existing detector quirk on this page (the detected nested contours
aren't the pupils), not a conditioning regression; visually the eyes are classic
black-with-catchlight. The conditioned take is gate-equivalent to the shipped asset.

### The transferable lesson (extends idea #8's)

Idea #8 found *image evidence beats prompt text* (a black-lined reference makes the model re-ink
black lines). Idea #9 finds the corollary and its limit: **a reference image whose composition
differs from the target hijacks the whole generation** — the model switches from edit-mode to
generate-mode and draws the reference's scene, and no prompt wording (nor shrinking the reference to
a thumbnail) stopped it in 6/6 takes. Multi-image palette conditioning is only safe when reference
and target share the same drawing (idea #8's same-page light→night case). Across different drawings,
**flatten the reference into text**: extract the palette from the sibling fill, describe it per
part, and append it to the known-good single-image prompt. That keeps the model in edit-mode
(registration held at 100%/99.3%) while still transferring the palette.

One manual step remains: mapping extracted hexes to part names ("body", "horns"). Dominant-color
extraction is trivial offline (the top-4 quantized colors of the tall punch were exactly
sky/body/pale-green/cream); assigning them to parts took one human glance. A pipeline version could
automate this with a single cheap VLM text call ("name the color of each part of the character"), or
semi-automate with a per-page notes file.

## Files

* `ranking.txt` / `ranking.json` — the full 46-pair inventory, light + night, worst-first (light
  EMD).
* `rectangle-light-pair.webp`, `garbage-light-pair.webp`, `balloon-light-pair.webp` — confirmed
  light-mode offenders (tall | wide).
* `spider-light-pair.webp` — the scorer's false-positive case (subject coherent, scene divergent).
* `station-night-pair.webp` — worst night pair (149°).
* `dog-light-pair-control.webp` — coherent control (4.4°).
* `dragon-light-pair.webp` — **before**: shipped green-tall vs teal-wide dragon (52.9°).
* `dragon-light-pair-after.webp` — **after**: tall vs text-palette-conditioned wide (10.6°), both
  green.
* `dragon-wide-failure-composition-copy.webp` — calls 1–4 failure: the model drew the tall
  composition on the wide canvas.
* `code/score-orient-coherence.mjs` — the scorer (standalone; run from repo root next to `lib/`).
* `code/gen-coloring-fills-cond.mjs` — the conditioned generator with both modes (`--ref`
  multi-image, `--palette-text` text plan; needs `--experimental-strip-types` for the geminiSafety
  import).
* `code/make-pair-image.mjs` — side-by-side pair builder.
* `code/dragon-wide.light.conditioned.fullres.webp` — the full-res winning take (would still need
  human contact-sheet review + punch before shipping).

## What was NOT done (budget/scope)

* No second page conditioned (rectangle-wide or balloon-wide would be the next targets); the 8-call
  cap went to discovering the composition-copy failure mode (6 calls) and the text-palette fix (2
  calls).
* No punch/contact-sheet of the conditioned take (offline + mechanical).
* No automation of the hex→part-name mapping (needs a VLM text call or notes file).
* No night-mode cross-orientation conditioning (likely compounding with idea #8's fix; fix
  light↔night first).

## Recommendations

1. **Adopt the scorer as a triage audit** alongside idea #8's: it ranks pairs worst-first in under a
   minute, free. Read it as scene-level; eyeball before regenerating (spider is fine, balloon is
   worse than its score).
2. **Retrofit the confirmed offenders** (rectangle, garbage, dragon done-in-principle, balloon,
   meteor, monster, unicorn, station) with the **text-palette** method: pick the better-looking
   orientation as canonical, auto-extract its dominant colors, write a one-line-per-part COLOR PLAN,
   regenerate the sibling with the standard generator + that block. ~1–2 calls per page on this
   evidence.
3. **Do not use multi-image conditioning across different drawings** — record this beside idea #8's
   punched-reference lesson. Same-drawing references only.
4. Fix idea #8's light↔night flips first; that alone repairs much of the night half of this
   inventory (the `farm/cat` pattern).
5. Optional pipeline hardening: accept a `--palette-notes` flag on `gen-coloring-fills.mjs` so a
   regen can carry the sibling's palette without a code copy.
