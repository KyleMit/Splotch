# Idea #4 — Night-sky brightness varies ~4× across the catalog

**Verdict: WORKED.** The spread is confirmed (16.5 → 65.3 across all 94 night raws), and **approach
(b) — deterministic post-normalization — works end-to-end**: it hits the target bgLuma exactly,
produces no visible edge artifacts, leaves enclosed regions and white lines byte-untouched, and
still passes the generator's other gates. Approach (a) — regen with a tightened ≤50 gate — also
works (cow-wide passed at bgLuma 48 on attempt 4 of 4) but costs API calls and replaces the whole
artwork. Approach (c) — dusk→midnight ordering — is undermined by a measured fact: the tall/wide
variants of the *same page* differ by 14.4 bgLuma on average (owl itself spans 16.5 → 54.7), and a
book's page order is shared across orientations, so no single ordering reads dusk→midnight in both.

## 1. Measurement — the distribution (all 94 shipped night raws)

Recomputed offline with the exact `scoreNightness` machinery from `gen-coloring-fills-dark.mjs`
(flood-fill the true background from the border through the chalk's light pixels at 384 px; median
luma of the fill in that region). Every page scored against its chalk (all 94 pages are forked).
Code: `code/measure-night-bgluma.mjs`; full data: `bgluma.json`.

**Summary:** n = 94 · min 16.5 · p25 30.1 · median 36.2 · p75 44.1 · max 65.3. 33 pages > 40; 17
pages > 50; 4 pages > 60 (unicorn-wide 61.6, balloon-wide 62.0, ant-wide 63.9, cow-wide 65.3). Every
page is far below the ≤100 gate — the gate never constrained mood, only excluded outright daytime
skies.

Histogram (bin = bgLuma):

```
15–20  ███ 3
20–25  █████ 5
25–30  ███████████████ 15
30–35  ███████████████████ 19
35–40  ██████████████████ 18
40–45  █████████████ 13
45–50  █████ 5
50–55  ████████ 8
55–60  ██████ 6
60–66  ████ 4
```

Full table (sorted, brightest last — this is also the catalog-wide dusk→midnight order, reversed):

| page                       | bgLuma |   | page                        | bgLuma |
| -------------------------- | ------ | - | --------------------------- | ------ |
| creatures/owl-tall         | 16.5   |   | vehicles/train-tall         | 38.1   |
| nature/spider-tall         | 18.6   |   | vehicles/police-wide        | 38.2   |
| space/station-tall         | 18.8   |   | vehicles/excavator-wide     | 38.5   |
| nature/bee-tall            | 23.4   |   | farm/pig-tall               | 38.5   |
| shapes/rectangle-tall      | 23.4   |   | space/ship-tall             | 38.6   |
| farm/duck-tall             | 23.5   |   | vehicles/train-wide         | 38.7   |
| space/astronaut-tall       | 24.2   |   | space/astronaut-wide        | 38.8   |
| space/moon-wide            | 24.6   |   | dinosaur/pterodactyl-tall   | 39.5   |
| space/meteor-tall          | 25.8   |   | objects/teddy-wide          | 40.0   |
| space/rover-tall           | 25.8   |   | space/meteor-wide           | 40.6   |
| objects/flower-tall        | 25.8   |   | space/rover-wide            | 41.7   |
| shapes/star-tall           | 25.9   |   | creatures/pegasus-wide      | 41.8   |
| nature/ladybug-tall        | 26.6   |   | dinosaur/trex-wide          | 42.2   |
| objects/teddy-tall         | 26.7   |   | vehicles/monster-tall       | 43.1   |
| shapes/triangle-wide       | 27.0   |   | vehicles/fire-tall          | 43.3   |
| nature/snail-tall          | 28.1   |   | nature/bee-wide             | 43.9   |
| shapes/star-wide           | 28.1   |   | dinosaur/brachiosaurus-wide | 44.0   |
| nature/caterpillar-tall    | 28.7   |   | creatures/fairy-wide        | 44.0   |
| vehicles/garbage-tall      | 29.0   |   | shapes/square-wide          | 44.1   |
| shapes/square-tall         | 29.2   |   | dinosaur/brachiosaurus-tall | 44.2   |
| creatures/fairy-tall       | 29.2   |   | farm/dog-wide               | 48.7   |
| shapes/circle-wide         | 29.2   |   | farm/duck-wide              | 48.9   |
| dinosaur/triceratops-tall  | 30.0   |   | vehicles/police-tall        | 49.1   |
| space/station-wide         | 30.1   |   | objects/apple-wide          | 49.2   |
| space/ship-wide            | 30.2   |   | nature/snail-wide           | 50.0   |
| creatures/unicorn-tall     | 30.3   |   | farm/cat-wide               | 50.9   |
| objects/apple-tall         | 30.4   |   | farm/dog-tall               | 52.1   |
| dinosaur/stegosaurus-wide  | 30.4   |   | farm/horse-wide             | 52.6   |
| shapes/triangle-tall       | 30.4   |   | objects/house-tall          | 53.7   |
| nature/ladybug-wide        | 31.5   |   | creatures/dragon-wide       | 54.6   |
| vehicles/excavator-tall    | 32.5   |   | creatures/owl-wide          | 54.7   |
| creatures/mermaid-tall     | 32.5   |   | dinosaur/triceratops-wide   | 54.9   |
| objects/umbrella-wide      | 32.6   |   | shapes/rectangle-wide       | 55.1   |
| dinosaur/velociraptor-tall | 32.6   |   | farm/pig-wide               | 55.7   |
| vehicles/monster-wide      | 32.7   |   | dinosaur/velociraptor-wide  | 56.9   |
| dinosaur/trex-tall         | 32.7   |   | creatures/pegasus-tall      | 58.2   |
| nature/caterpillar-wide    | 32.7   |   | vehicles/fire-wide          | 58.2   |
| farm/cat-tall              | 33.4   |   | farm/horse-tall             | 58.4   |
| objects/balloon-tall       | 33.5   |   | creatures/unicorn-wide      | 61.6   |
| nature/ant-tall            | 34.1   |   | objects/balloon-wide        | 62.0   |
| dinosaur/stegosaurus-tall  | 34.1   |   | nature/ant-wide             | 63.9   |
| farm/cow-tall              | 34.7   |   | farm/cow-wide               | 65.3   |
| vehicles/garbage-wide      | 35.1   |   |                             |        |
| space/moon-tall            | 35.2   |   |                             |        |
| dinosaur/pterodactyl-wide  | 35.2   |   |                             |        |
| creatures/mermaid-wide     | 36.0   |   |                             |        |
| nature/spider-wide         | 36.1   |   |                             |        |
| objects/house-wide         | 36.2   |   |                             |        |
| shapes/circle-tall         | 36.2   |   |                             |        |
| shapes/heart-tall          | 36.4   |   |                             |        |
| objects/flower-wide        | 37.1   |   |                             |        |
| creatures/dragon-tall      | 37.2   |   |                             |        |

**Two systematic patterns hiding in the table:**

* **Wide pages are systematically brighter than tall ones**: wide mean 43.1 vs tall mean 33.4. Of
  the 22 pages >= 44, 17 are wide. Likely cause: wide compositions carry more border-connected open
  ground (grass, hills), and the flood-filled "background" region includes that ground, not just sky
  — so bgLuma partially measures *ground brightness*, which the night prompt polices less than the
  sky.
* **The same page's two orientations disagree by 14.4 bgLuma on average** (46 pages have both).
  Worst gaps: owl 16.5→54.7, rectangle 23.4→55.1, unicorn 30.3→61.6, cow 34.7→65.3, ant 34.1→63.9.
  The idea's poster children (owl-tall vs cow-wide) are really instances of this intra-page effect.

Evidence: `mood-clash-owl16-vs-cow65.webp` — the shipped composites side by side; the owl reads deep
midnight (moon, near-black sky), the cow reads green-grass dusk.

## 2. Approach (b) — deterministic post-normalization: WORKS

`code/normalize-night-sky.mjs`. Method:

1. Flood-fill the true background from the border through the chalk's light pixels (>170 luma) at
   **full resolution** — the same region `scoreNightness` scores, so the fix moves exactly the
   number the gate reads. On cow-wide this region is the sky **plus the whole border-connected grass
   field** (see `cow-wide-bgregion.webp`); enclosed regions (subject, clouds, fence, flowers) are
   excluded.
2. Compute the region's median luma over its non-bright pixels (< 160, so the fill's own white line
   glow doesn't skew the median), and a single multiplicative factor `k = target / median` (target
   30, the healthy band's center). Multiplying RGB by one scalar preserves hue and relative
   saturation — the sky stays navy, grass stays green.
3. Feather the region mask (gaussian σ2) so the factor ramps at region borders, and **protect bright
   pixels** (luma 160→220 ramps protection 0→1) so the fill's white outlines and their anti-aliased
   glow keep their value.
4. `out = rgb * (1 - m·(1-k)·(1-protect))`.

Results (scored with the real 384-px `scoreNightness` after normalization):

| page                   | before | after    | k     |
| ---------------------- | ------ | -------- | ----- |
| farm/cow-wide          | 65.3   | **30.3** | 0.459 |
| creatures/unicorn-wide | 61.6   | **30.0** | 0.488 |
| nature/ant-wide        | 63.9   | ~30      | 0.470 |
| objects/balloon-wide   | 62.0   | ~30      | 0.484 |

Edge scrutiny (the idea flagged "risky at region edges"): `edge-cow-flower-grass.webp`,
`edge-cow-cloud-sky.webp`, `edge-unicorn-flowers.webp` are 2× zoom before|after pairs at the busiest
boundaries. No stepping, no dark rims, no halos; white lines stay crisp; the line glow survives
(protected). Pixel-sampled verification: cloud interiors and the cow's body are byte-identical
before→after (177,180,191 → 178,181,192 is webp re-encode noise); sky 43,39,65 → 20,18,30 and grass
68,91,58 → 32,43,30 scale exactly by k with hue held.

Gate compatibility: `scoreLineColor` medians before→after: cow 199→199, ant 249→248, balloon
253→252, unicorn 168→160. All still clear the 150 bar; unicorn's margin shrank because its lines are
dimmer than the 220 full-protection knee (see limitations). Drift and eye gates are untouched by
construction (geometry unchanged, subject regions m=0).

Judgment on the simulated final render (`lib/night-composite.mjs`, the same composite the eye gate
judges): `cow-wide.before.webp` vs `cow-wide.after-normalized.webp`, `unicorn-wide.before.webp` vs
`unicorn-wide.after-normalized.webp`, plus ant/balloon pairs. The after images read as the *same
artwork at midnight* — subject colors, clouds, and composition intact.

**One real bug found on the way** (worth remembering for any sharp mask work): piping a 1-channel
raw buffer through `sharp(...).blur().raw()` returned a **3-channel** buffer (sharp converts to
sRGB); indexing it as 1-channel silently applied a garbage mask — blotchy patches, subject
darkening. Fix: `.toColourspace('b-w')` before `.raw()`, plus a length assertion. This is a cousin
of the repo's documented "sharp alpha gotcha".

## 3. Approach (a) — regen with the gate tightened to ≤50: works, but costs

```
node tools/asset-gen/gen-coloring-fills-dark.mjs farm/cow-wide --night-luma-max 50 --max-attempts 4
→ ok  (4 tries)  drift 0.0001  bgLuma 48  lineW 209
```

The catalog's brightest page passed at 48 — but only on the **4th of 4 attempts**, i.e. the ≤50 bar
is reachable but tight for the bright tail (17 pages > 50 would need regens, at several Gemini calls
each). Result: `cow-wide.after-regen48.webp`. Note it is a *different artwork* — new palette (brown
cow, purple flowers), new cloud shapes — so regen also discards the shipped page a child may
recognize, and each regen re-rolls the other gates (eyes, drift, line color). Normalization keeps
the shipped art and moves only the mood.

## 4. Approach (c) — dusk→midnight ordering: weak, don't bother

Farm book ordered dusk→midnight by page-mean bgLuma: **horse (55.5) → dog (50.4) → cow (50.0) → pig
(47.1) → cat (42.2) → duck (36.2)**.

But the order is stored once per book (`web/src/lib/state/books.ts` `pages:` list) while each page
ships tall+wide, and the orientations disagree wildly (cow: tall 34.7 / wide 65.3). In portrait that
farm order runs 58.4, 52.1, 34.7, 38.5, 33.4, 23.5 (two inversions); in landscape it runs 52.6,
48.7, **65.3**, 55.7, 50.9, 48.9 — the cow breaks it outright. A single ordering cannot read
dusk→midnight in both orientations, and the picker shows only one orientation at a time. (c) would
also reorder the light-mode book for a dark-mode reason. Not recommended.

## Recommendations

1. **Adopt (b) as an offline batch pass** over the bright tail: normalize every night raw above ~45
   toward a 28–32 target, re-punch, review on the contact sheet, commit. Zero API cost,
   art-preserving, exact. The 17 pages > 50 shrink the catalog spread from 16–65 to roughly 16–45 in
   one deterministic run.
2. **Tighten the generator gate for future pages** to ≤45–50 (`NIGHT_BG_LUMA_MAX_DEFAULT`) so new
   categories don't regrow the bright tail; keep ≤100 only as the daytime catastrophic check if
   desired. Budget ~4–5 attempts for bright-tail compositions.
3. Consider making the normalizer a permanent tool (`normalize-night-sky.mjs`) beside the punch — it
   reuses the flood-fill semantics of `scoreNightness` and composes with the existing raw→punch flow
   (normalize the raw, then `gen:coloring-punch`).
4. If the wide-vs-tall brightness bias matters (wides +10 mean), the root cause is likely
   ground-heavy wide compositions; the prompt could ask for "deeply darkened night grass / ground"
   explicitly.

## Limitations

* Human review of normalized pages happened only at composite + zoom-crop level here; a
  contact-sheet pass (the pipeline's sanctioned review surface) should gate any real shipping. The
  normalized raws were not committed or punched into `web/static/`.
* The luma-based line protection assumes the fill's outlines are bright (>~200). On pages whose
  lines sit near the 160 knee (unicorn-wide, lineWhite 168) protection is partial and the lineWhite
  margin erodes slightly (168→160). A distance-based protection (dilate the chalk ink mask ~3 px)
  would be stricter if a page ever fails; not needed on the four tried.
* A single multiplicative k dims *everything* border-connected, including intentional bright accents
  in the open background (a glowing firefly painted into the sky would dim too — the protect ramp
  only spares near-white). None of the four pages had such accents.
* bgLuma conflates sky and open ground; "target 30" makes ground-heavy pages read darker overall
  than sky-heavy ones at the same score. A future refinement could normalize sky and ground
  sub-regions to separate targets, but the uniform version already looks right.
* Gemini budget spent: 4 calls (the one ≤50 regen). Everything else was offline.

## Files

| file                                                                                      | what                                                |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `bgluma.json`                                                                             | full per-page measurement (bgLuma, bgFrac, p10/p90) |
| `mood-clash-owl16-vs-cow65.webp`                                                          | shipped composites: darkest vs brightest page       |
| `cow-wide.before.webp` / `cow-wide.after-normalized.webp` / `cow-wide.after-regen48.webp` | the three cow-wide states                           |
| `unicorn-wide.before.webp` / `unicorn-wide.after-normalized.webp`                         | second normalization target                         |
| `ant-wide.*` / `balloon-wide.*`                                                           | generality check (next two brightest)               |
| `edge-*.webp`                                                                             | 2× zoom before/after pairs at region edges          |
| `cow-wide-bgregion.webp`                                                                  | flood-filled background region (red) over the chalk |
| `code/measure-night-bgluma.mjs`                                                           | catalog-wide bgLuma measurement (offline)           |
| `code/normalize-night-sky.mjs`                                                            | the deterministic normalizer (offline)              |
