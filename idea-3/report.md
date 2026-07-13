# Idea #3 — Chalk whites the night fill disagrees with

**Verdict: WORKED.** The scorer was built exactly as proposed, runs fully offline in ~50 s over the
whole catalog (70 pages with chalk + night raw + whitened regions), zero Gemini calls, and its
ranking is essentially all true positives — the three IDEAS.md pages behave as predicted (with one
instructive twist on the unicorn), and it surfaced **a dozen new disagreements nobody had listed**,
several stronger than the named ones. This closes the gap `pipeline.md` itself documents: *"Chalk
whites the fill disagrees with … is only caught by human review — no gate compares the chalk's
whites to the fill's intent."* Now a script does.

## How it works (`code/chalk-fill-disagreement.mjs`)

1. **Whitened regions** — same definitions as the chalk gates (INK_W=512, INK_DARK=110, PEN_SLACK=2,
   open-background flood, reused from idea #2's inventory): connected chalk-ink regions beyond the
   dilated pen strokes, not on the open background, >= 25 px.
2. **Sample the committed night raw** (`fill-src/{page}.night.raw.webp`, resized to the same 512
   fit:'fill' space) at those pixels — after eroding each region by 2 px so raw-vs-chalk
   misregistration and anti-aliased edges can't fake color.
3. **Per pixel**: chroma = max(R,G,B) - min(R,G,B); "colored" if chroma >= 40. **Per region**:
   coloredFrac, meanChroma, mean RGB of the colored pixels, score = area x coloredFrac. **Per
   page**: sum of region scores.

In the shipped composite the chalk always wins (punch clears the fill under chalk ink, then the
screened chalk white owns the region — screen with white is white), so any saturated paint the raw
put in a whitened region is provably invisible in what ships. The scorer measures exactly that.

A second variant (one-line change, `.light.raw.webp` instead of `.night.raw.webp`) samples the
**light raw** — which is conditioned on the *pen*, never the chalk — giving an independent "what
does canon want here" signal (see the unicorn, below).

## The three named pages

| page                                  | prediction        | result                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `farm/dog-tall` (collar)              | fill wanted color | **CONFIRMED** — night raw painted a golden-tan collar + tag (rgb 179,110,43, frac 1.0, chroma 136); light raw says canon is **red** (225,69,60) with a yellow tag. Ships as blank white. `farm-dog-tall-{before,after}.webp`                                                                                                          |
| `farm/cat-tall` (ears/nose)           | fill wanted color | **CONFIRMED (ears), threshold-edge (nose)** — both inner ears dusty pink (frac 1.0); the nose is pale pink at meanChroma 36, just under the 40 bar (light raw: nose chroma 76, clearly pink in canon). `farm-cat-tall-{before,after}.webp`                                                                                            |
| `creatures/unicorn-tall` (horn/cheek) | fill wanted color | **DISCONFIRMED on the night axis, confirmed on the canon axis** — the night fill *complied* with the chalk (horn/cheek meanChroma 4-6, score 0), but the light raw paints the horn pale cyan and the cheek pale yellow (chroma ~43-46). The night-raw signal alone can't see this class. `creatures-unicorn-tall-{before,after}.webp` |

## Ranked flag list (night-raw signal, annotated from crop review)

Score = sum of region area x coloredFrac at 512-space. Every crop was eyeballed (`crops/*.webp`,
3-up: chalk display | night raw | shipped composite).

| #     | score  | page                                                                                                                                                                                        | what the fill wanted (whited out in what ships)                                   | call                                                                       |
| ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1     | 11250  | `nature/spider-wide`                                                                                                                                                                        | two magenta flowers w/ yellow centers on the web                                  | **defect-ish** — blank white flowers ship                                  |
| 2     | 10658  | `objects/flower-wide`                                                                                                                                                                       | warm peach smiling sun-face w/ rosy cheeks                                        | art call, strong                                                           |
| 3     | 9162   | `vehicles/fire-tall`                                                                                                                                                                        | dark blue windshield glass w/ light streaks                                       | **defect-ish** — huge white blank                                          |
| 4     | 8126   | `space/moon-wide`                                                                                                                                                                           | golden glowing face-stars (x4 regions)                                            | art call (celestial canon, cf. idea #2)                                    |
| 5     | 6438   | `vehicles/police-wide`                                                                                                                                                                      | blue windshield glass behind the eyes                                             | **defect-ish** (same family as fire-tall)                                  |
| 6     | 5255   | `vehicles/excavator-tall`                                                                                                                                                                   | peach cab-face w/ rosy cheeks                                                     | art call, strong                                                           |
| 7     | 4694   | `creatures/pegasus-wide`                                                                                                                                                                    | golden mane + wings                                                               | art call                                                                   |
| 8     | 3724   | `objects/umbrella-wide`                                                                                                                                                                     | magenta flower                                                                    | **defect-ish** (same as spider-wide)                                       |
| 9     | 3568   | `farm/cow-wide`                                                                                                                                                                             | pink muzzle                                                                       | **defect-ish** — muzzle canon is pink                                      |
| 10    | 3146   | `objects/teddy-wide`                                                                                                                                                                        | dark-brown paw pad on tan paw                                                     | **defect-ish**                                                             |
| 11    | 2995   | `objects/house-tall`                                                                                                                                                                        | rose heart interior                                                               | art call                                                                   |
| 12    | 2935   | `space/astronaut-wide`                                                                                                                                                                      | the child's warm skin + rosy cheeks                                               | **most important find** — a face whited out                                |
| 13    | 2917   | `farm/dog-wide`                                                                                                                                                                             | tan floppy ear                                                                    | defect-ish                                                                 |
| 14    | 2764   | `creatures/owl-tall`                                                                                                                                                                        | warm facial-disc glow around eyes (frac 0.44 — sclera part is agreement)          | borderline                                                                 |
| 15    | 2556   | `farm/cow-tall`                                                                                                                                                                             | **golden bell** (chroma 131)                                                      | **defect-ish**, delightful catch                                           |
| 16    | 2538   | `space/station-wide`                                                                                                                                                                        | brown/gold module                                                                 | art call                                                                   |
| 17    | 2372   | `space/ship-wide`                                                                                                                                                                           | gold rocket fin/nose                                                              | art call (idea #2's planets family)                                        |
| 18    | 1628   | `dinosaur/pterodactyl-tall`                                                                                                                                                                 | golden rayed sun (chroma 133)                                                     | art call — cross-validates idea #2's sun finding from the fill-intent side |
| 19    | 1519   | `farm/dog-tall`                                                                                                                                                                             | tan/gold collar + tag                                                             | **defect** (IDEAS.md)                                                      |
| 20    | 1247   | `farm/cat-tall`                                                                                                                                                                             | pink inner ears                                                                   | **defect** (IDEAS.md)                                                      |
| 21-37 | <=1036 | teddy-tall (muzzle), duck-tall (**orange bill + pink mouth**, chroma 114), pig-wide (**pink snout**), owl-wide, balloon-wide, cat-wide, trex-tall, meteor-wide, unicorn-wide, bee-wide, ... | duck-tall and pig-wide are small-area but unambiguous canon defects               | mixed                                                                      |
| 38-70 | 0      | 33 pages incl. all dinosaur-tall bodies, nature-tall eyes, shapes                                                                                                                           | fill painted the whitened regions white/near-white — **the chalk and fill agree** | clean                                                                      |

Chroma-weighted alternative (severity = area x frac x meanChroma/255) promotes the high-chroma small
regions (pterodactyl sun, dog collar, duck bill, cow bell) and demotes big warm-white glows — better
matches human judgment of "how wrong does it look"; both orderings are derivable from the report
data (`disagreement.json`, plus `disagreement-light.json` for the canon variant).

## What the crops show (evidence files)

* `farm-dog-tall-{before,after}.webp` — golden collar+tag -> blank white
* `farm-duck-tall-{before,after}.webp` — orange bill, pink open mouth -> white bill
* `farm-pig-wide-{before,after}.webp` — pink snout w/ dark nostrils -> white snout
* `farm-cow-tall-{before,after}.webp` — golden bell -> white bell
* `vehicles-fire-tall-{before,after}.webp` — blue glass windshield -> white blank
* `space-astronaut-wide-{before,after}.webp` — warm-skin child face -> white face
* `nature-spider-wide-{before,after}.webp` — magenta flower -> white flower
* `farm-cat-tall-{before,after}.webp` — pink inner ear -> white ear
* `creatures-unicorn-tall-{before,after}.webp` — **control**: raw is already white-lavender;
  composite identical (score 0 is a true negative)
* `crops/*.webp` — 3-up strips (chalk | raw | composite) for the whole top-20 review

## What worked

* **The eroded-region chroma sampling is a clean signal.** Zero-score pages (33/70) are genuine
  agreements; every eyeballed high scorer was a real disagreement. The 2 px erode + MIN_SAMPLED=12
  killed edge-misregistration false positives outright.
* **The cheap ranking already separates classes**: meanChroma < ~15 = agreement, 15-40 = tinted
  whites (judgment), > 40 = the fill unambiguously wanted color.
* **The light-raw variant closes the compliance blind spot** — night fills are conditioned on the
  chalk, so a compliant fill (unicorn horn) hides canon intent; the light raw is chalk-blind and
  reveals it. The two signals classify every case: night-high = fill fought the chalk; night-low +
  light-high = fill complied but canon wants color (pure human call); both low = true agreement.

## Limitations

* **The scorer finds disagreement, not wrongness.** Solid-white stars/suns/manes at night are
  arguably the chalk aesthetic working as designed; the flag list needs a human pass (that is the
  idea's stated intent — flag for human call).
* **CHROMA_MIN=40 misses pale-pastel canon** (cat nose at 36 scored 0 on the night axis). Lowering
  to ~30, or reporting the 15-40 band separately, catches these; meanChroma is already in the output
  either way.
* **The light-raw signal over-flags at night**: light canon paints stars yellow, but white-glowing
  stars at night are deliberate. Use it only to adjudicate night-compliant regions, not as a
  standalone ranking.
* **Whitened-region granularity is the chalk's**, so a region mixing intended white (sclera) with
  disagreement (facial disc) dilutes frac (owl-tall's 0.44).
* bbox coordinates are in the 512 fit:'fill' space (distorted for non-square pages); the crop tools
  convert back per-image.

## Recommendations

1. **Adopt as `tools/asset-gen/audit-chalk-fill-disagreement.mjs`** beside the other two audits
   (offline, no key, ~50 s catalog-wide) — print the ranked table with both the night-raw and
   light-raw chroma columns, flag `frac >= 0.5 && meanChroma >= 40` for review. Advisory audit, not
   a hard gate (too many legitimate art calls).
2. **Run it whenever a chalk or night fill is (re)generated** — could also run per-page inside
   `gen-coloring-fills-dark.mjs` as a WARN line, since everything it needs is already in memory
   there.
3. **Human review queue, in order**: astronaut-wide's face, the two windshields (fire-tall,
   police-wide), the farm set (dog collar, duck bill, pig snout, cow muzzle + bell, cat ears/nose,
   dog-wide ear), the two web/umbrella flowers, teddy paw pad. Then decide the celestial canon
   (stars/suns/rockets gold vs white) once, per idea #2's recommendation — it covers ranks 4, 7, 17,
   18 wholesale.
4. Fixing any of these = re-chalk with `--notes` naming the colored treatment (idea #2 validated
   that loop end-to-end), then regen the night fill + re-punch.
