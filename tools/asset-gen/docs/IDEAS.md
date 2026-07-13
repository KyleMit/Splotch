# IDEAS — image-quality backlog from the 2026-07 full-catalog migration

> **2026-07-13 status:** every idea was empirically explored in
> [`ideas-exploration/`](../ideas-exploration/README.md), and the `gemini-3.1-flash-image`
> regeneration wave ([run record](gemini-3.1-migration.md)) **landed #11, #12, and #17** (the
> page-thumbnail half of **#19** landed 2026-07-13 — chalk thumbs catalog-wide + the theme-aware
> picker; chalk *covers* remain open), effectively resolved **#1** (re-inking gone), **#5** (both
> flat-pupil pages now lively without pen surgery), and **#4** (night bgLuma tightened to 18–48 via
> `--night-luma-max 60`), and ran **#7/#13** as post-regen audits (1 real invented shape caught and
> regenerated); **both landed 2026-07-13 as first-class audit scripts**
> (`gen:coloring-fills:audit:halo` / `gen:coloring-fills:audit:shapes`). **#23 and #25 landed
> 2026-07-13** as the committed regression fixtures in `golden/`
> (`gen:coloring-golden:freeze`/`diff` + `gen:assets:manifest`/`check:assets:manifest`). **#10
> landed 2026-07-13** as the per-page notes registry (`fill-src/<cat>/notes.json` +
> `lib/page-notes.mjs`, auto-loaded by the night/chalk/normalize generators). The remaining ideas
> below are still open leads. The living list of concrete outstanding defects and gate blind spots
> (as opposed to these exploratory leads) is [`ISSUES.md`](ISSUES.md).

Brainstormed immediately after generating and reviewing the whole catalog (7 categories: 83 chalks +
83 night fills, ~350 candidate images eyeballed). **Nothing here is empirically verified** — each
idea is a lead to run down in a fresh session, with 1–3 example pages to try it on. Ideas range from
one-flag tweaks to pipeline rethinks; several overlap — landing one may shrink or absorb another.
Related, already-filed engineering items live in `docs/AUDIT.md` (gate blind spot, generator output
semantics, shipping traps); this file is about the *images*.

Legend: **[edge]** isolated to specific pages · **[systemic]** shows up across many images ·
**[unknown]** suspected, needs a look.

---

## A. Visible issues in shipped images

### 1. Dark-bodied subjects keep re-inking their outlines dark **[edge, recurring per category]**

`vehicles/train-wide` held lineW 51–105 through ~27 attempts of every documented lever (strict gate,
low temp, `--dilate-lines`, `--notes`). The composite renders fine because the chalk owns the lines
— but the shipped raw carries dark ink wider than the chalk stroke, so a faint dark rim survives the
punch at some edges. Ideas: (a) post-process the raw — detect fill pixels at chalk-line positions
that are dark and *paint them white* before punching (deterministic, sharp-only); (b) regenerate via
**image-edit on the good take** ("make every outline bright white, change nothing else") instead of
fresh generation; (c) accept-and-erase: since the punch discards line pixels anyway, dilate the
punch mask 1–2 px on pages with low lineW so the rim goes with it.

* Try on: `vehicles/train-wide`, `farm/cat-wide` (lineW 170), `shapes/… none` (control: any lineW
  255 page).

### 2. Whitened-motif inconsistency across sibling pages **[edge, a few pages]**

The chalk decides what is solid white per page, independently — so the same motif gets different
treatments inside one category. Seen: bubbles are thin rings on
`shapes/rectangle-tall`/`square-wide` but fat white donuts on `shapes/rectangle-wide`; the sun is
solid white (moon-like, arguably great) on `dinosaur/pterodactyl-tall`. Idea: a "motif consistency"
review pass — group pages sharing a motif (bubbles, clouds, sun, stars, flowers), eyeball the chalk
treatment side by side, and re-chalk the outliers with a `--notes` naming the sibling's treatment.
Could be a small contact-sheet mode (`--motif bubbles`?) or just a documented checklist.

* Try on: `shapes/rectangle-wide` (donut bubbles vs `shapes/square-wide`),
  `dinosaur/pterodactyl-wide` (does its sun match -tall?).

### 3. Chalk whites the night fill disagrees with **[systemic risk, few confirmed]**

The chalk's whitening is authored before the fill exists and the punch makes it win. This migration
whitened things canon might want colored: the dog's collar (`farm/dog-tall`), the unicorn's horn +
heart cheek (`creatures/unicorn-tall`), the cat's nose/inner ears (`farm/cat-tall`). They read well
as chalk art, but nobody checked what the *night fill* wanted there. Idea: a scorer that compares
each chalk-whitened region against the same region in the committed night raw — if the fill painted
it saturated (it "wanted" color), flag for human call. Cheap version: list whitened-region area per
page (already computed as the white budget) sorted desc, and eyeball the top N in the sheet.

* Try on: `farm/dog-tall` (collar), `creatures/unicorn-tall` (horn/heart), `farm/cat-tall`
  (ears/nose).

### 4. Night-sky brightness varies ~4× across the catalog **[systemic]**

Shipped night bgLuma ranges 16 (`creatures/owl-tall`) to 66 (`farm/cow-wide`). Each passes the ≤100
gate, but side-by-side in the picker the moods clash — some pages read midnight, others dusk. Ideas:
(a) tighten the bar to ≤50 and regen the bright tail; (b) deterministic post-normalization — scale
the flood-filled background region's luma toward a target band (risky at region edges); (c) accept
variance but *order* pages in each book from dusk→midnight so it reads intentional.

* Try on: `farm/cow-wide` (66), `creatures/unicorn-wide` (61), vs `creatures/owl-tall` (16).

### 5. Nature's two known flat-pupil ships are still there **[edge, 2 pages]**

Pre-existing (status table): `nature/caterpillar-wide` + `ladybug-wide` ship with flat pupils
because their pen eyes use a spiral catchlight the fill model refuses to paint dark (≥11 attempts
each). The durable fix was already named: de-swirl those two pen eyes (as caterpillar-tall was),
then regen their whole suites (thumb + chalk + light + night). Now that the chalk era owns eye
whites, the fix may be easier than when it was written.

* Try on: `nature/caterpillar-wide`, `nature/ladybug-wide`.

### 6. Light fills on un-normalized pens have dead/solid eyes **[systemic, ~10+ pages]**

The catalog-wide eye audit flags most light-side FAILs on accident-era pens (solid black eye blobs →
the light fill can't paint a lively eye): `objects/teddy-*`, `objects/balloon-wide`,
`vehicles/train-tall`, `vehicles/fire-wide`, `farm/*` several. Dark mode is now fixed by the chalk;
**light mode still shows solid-ink pupils**. Idea: run the pen normalizer worst-first
(`gen:coloring-outlines:normalize`, the audit prints the ranking), then regen those pages' light
fills — leaving night alone (it keys off the chalk). This is the single biggest *light-theme*
quality lever left.

* Try on: `objects/teddy-tall` (blob 719), `vehicles/police-tall` (blob 1886), `creatures/owl-tall`
  (blob 1919 — also the riskiest, its chalk is perfect; light-only regen).

### 7. Residual dark halo audit after the punch **[LANDED 2026-07-13]**

> Validated in `ideas-exploration/idea-7/` (found 3 real halos the lineW gate missed), then landed
> as `bin/audit-night-halo.mjs` (`gen:coloring-fills:audit:halo`).

I only checked `train-wide` at 2× zoom by hand. Nobody has systematically looked for the
dotted-dark-ring / halo failure at display scale across all 94 shipped night fills. Idea: automate
what I did manually — composite every shipped night fill (`lib/night-composite.mjs`), diff a 1-px
band around each chalk stroke against the fill's neighbor color, and score "rim darkness"; report
the worst 10 pages as crops. Same machinery doubles as a regression gate after any punch change.

* Try on: `vehicles/train-wide` (known suspect), `vehicles/garbage-tall` (lineW 175),
  `creatures/unicorn-wide` (lineW 174).

## B. Cross-image consistency

### 8. Light↔night palette coherence **[systemic, by design]**

The two fills are independent generations; nothing keeps the bee's stripes or the teddy's bow the
same color family across modes (pipeline.md's known "ant blanket: red/white by day, teal/olive by
night"). Idea: condition the night generation on the **light raw** as a second input image ("same
scene at night — keep each object's hue family, dim and cool it") — the API takes multi-image input;
the drift/registration gates all still apply. Cheaper retrofit: a region-hue scorer (segment regions
from the pen, compare median hue light vs night, flag flips) to find the worst offenders and regen
just those with a palette note.

* Try on: `nature/ant-wide` (the canonical blanket case), `objects/teddy-tall` (bow),
  `farm/duck-wide`.

### 9. Tall↔wide palette coherence for the same subject **[unknown]**

Each orientation is a separate drawing *and* separate fills — the same character can wear different
colors in portrait vs landscape (does the dragon stay the same green? the teddy the same brown?).
Idea: same region-hue scorer as #8 applied across orientations; or condition the -wide fill on the
-tall fill. Worth one contact-sheet pass just to inventory how bad it is.

* Try on: `creatures/dragon-tall` vs `dragon-wide`, `objects/balloon-tall` vs `balloon-wide`.

### 10. Per-page notes registry so regens don't rediscover levers **[process — LANDED 2026-07-13]**

> Validated in `ideas-exploration/idea-10/` (registry mined from history; spider-tall passed every
> gate FIRST take with its registry note auto-injected), then landed as `lib/page-notes.mjs` +
> per-category `fill-src/<cat>/notes.json`, auto-loaded by the night/chalk/normalize generators
> (explicit CLI always wins; `--dry-run` previews). Seeded by reconciling the mined 2.5-era registry
> with the 3.1 migration record — durable page quirks kept, dead-model-habit workarounds dropped.
> See `pipeline.md` "The per-page notes registry".

The levers that finally worked are buried in commit messages and pipeline.md prose (spider: "THE
EYES ARE THE STAR", train-wide: composite-over-gate, house-wide: "this scene has no eyes"). Any
regen (e.g. from ideas #1–#9) will re-fight those battles. Idea: `fill-src/<cat>/notes.json` (or
YAML frontmatter per page) holding the known-good `--notes` / temperature / gate-overrides per page,
read automatically by the generators.

* Try on: `nature/spider-tall`, `vehicles/train-wide`, `objects/house-wide`.

## C. Gates & scoring

### 11. Whiten pen solids out of the chalk keep reference **[systemic — 13 overrides]**

Filed in `docs/AUDIT.md` (top finding) — listed here because it's also a *quality* lever: with the
gate fixed, retries can hunt for genuinely better chalks instead of the first overlay-clean
candidate being hand-shipped.

* Try on: `shapes/circle-tall` (worst score, 49.7%), `creatures/owl-tall`, `vehicles/police-tall`.

### 12. Eye detector: side profiles and non-face cores **[systemic noise]**

`judgeNightEyes` false-flagged `farm/duck-wide` (side-profile eye, verified lively) and fired on
wheel hubs/roof lights (`vehicles/monster-wide` "7 flat"), while genuinely eyeless pages pass
vacuously. Ideas: (a) a committed per-page eye annotation (core coordinates blessed once by a human,
from the light-raw reference detection) so the gate stops re-deriving *which* cores are eyes; (b) a
side-profile band tweak (single-eye pages relax the ≥-count); (c) suppress cores whose light-fill
reference isn't strongly lit (already partially done — verify why hubs still fire).

* Try on: `farm/duck-wide`, `vehicles/monster-wide`, `space/rover-wide`.

### 13. Colored-shape invention isn't gated **[audit LANDED 2026-07-13; the gate half is ISSUES]**

> Validated in `ideas-exploration/idea-13/` (11 pre-wave night fills carried confirmed inventions;
> anchoring, not saturation, is the discriminator), then landed as `bin/audit-invented-shapes.mjs`
> (`gen:coloring-fills:audit:shapes`). Wiring it as a generation-time gate is still open — see
> `ISSUES.md`.

`scoreDrift` only counts *white/low-chroma* pixels far from source lines — an invented **colored**
shape (an extra saturated star or planet on the open background, with no white outline) slips every
gate. I never confirmed one shipped, but nothing would have caught it. Idea: flood the open
background (as `scoreNightness` does) and flag saturated blobs above ~N px that sit outside every
source region.

* Try on: `space/ship-tall` (busy sky, drift 0.0020), `dinosaur/trex-wide` (drift 0.0035, the
  near-threshold keeper), `vehicles/police-wide` (drift 0.0040).

### 14. Local-warp registration check (the shimmer suspect) **[unknown]**

`alignToSource` corrects only the global nudge; outlineMatch tolerates ±2 px at 512. A redraw warped
locally 3–4 px passes gates but can shimmer at reveal edges under the punch (pipeline.md lists this
as "no incident yet"). Several shipped pages carried big global shifts (pig-wide −11, excavator-wide
−9, stegosaurus-wide −11) — big global nudges may correlate with local warp. Idea: score per-tile
displacement (tile-wise cross-correlation, not just coverage) and eyeball the worst pages' reveal
edges live via `run-splotch`.

* Try on: `farm/pig-wide` (−11,0), `vehicles/excavator-wide` (−9,0), `dinosaur/stegosaurus-wide`
  (−11,0).

### 15. Punch-inpaint quality on dense line work **[unknown]**

The inpaint bleeds neighbor fill color under every line; at multi-color junctions (plaid, wheels,
grilles) the bled color is a guess. Nobody has zoomed the shipped fills at junction-heavy spots.
Idea: crop-audit the top-10 "punched %" pages (train-wide 9.8%, flower-wide 11.7%) at 2–4×, look for
smearing; if found, try per-region mean-color inpaint instead of nearest-bleed.

* Try on: `objects/flower-wide` (11.7% punched), `vehicles/train-wide` (9.8%), `space/station-tall`.

## D. Different ways to generate

### 16. Night fill as a *recolor edit* of the light raw **[architecture]**

Instead of generating night from line art, image-edit the committed light raw: "repaint this as a
moonlit night scene; keep every outline exactly where it is, turn outlines white". Registration is
inherited (the light raw already passes), palette coherence (#8) is free, and the eye structure is
preserved. Risk: the model may not switch outline polarity cleanly — the crisp/line gates still
apply. Could become the default night path if it beats the current one on a 3-page bake-off.

* Try on: `nature/ant-wide` (blanket), `farm/duck-wide`, `vehicles/train-wide` (the hardest
  line-polarity case).

### 17. Model bake-off: flash-image vs the pro image model (and temperature ladders per model) **[architecture]**

Everything is tuned on `gemini-2.5-flash-image` (2026-07 behavior). The pro image tier (or any newer
image-edit model) may simply not have the re-inking habit, the nudge, or the eye-flooding tendency —
one hard page each from the known failure classes, 5 takes per model, same gates, compare pass rates
and keep the better default (or a per-page-class routing table).

* Try on: `vehicles/train-wide` (re-inking), `nature/caterpillar-wide` (spiral eye),
  `shapes/rectangle-wide` (whiten-everything misfire).

### 18. Deterministic fills: model picks the palette, code paints **[architecture, biggest rethink]**

Drift, registration, and line-color failures all come from asking a raster model to repaint line
art. Alternative: segment the pen into closed regions (flood fill — the punch/enclosure machinery
already half-does this), have a *text* model assign each region a color from a curated palette
("region 14: petal → dusty rose"), and paint programmatically. Perfect registration by construction,
perfect light/night coherence (two palettes over one region map), regens are instant and free.
Losses: no gradients/glow, needs gap-closed line art (strokes must seal regions), and shading
texture would go flat — maybe hybrid: deterministic base + one model pass for soft shading.

* Try on: `shapes/circle-tall` (simplest regions), `objects/balloon-tall`, then a hard one:
  `creatures/mermaid-tall`.

### 19. Chalk covers + dark-mode thumbnails **[gap in dark-mode UX]**

> **Landed 2026-07-13 (page half):** every chalk ships a `.chalk.thumb.webp` and the picker's page
> tiles are theme-aware (`pageThumb()` in `books.ts`). Covers still have no chalk — the book tiles
> keep the inverted pen until the 8 cover chalks are generated (see `ideas-exploration/idea-19`).

The picker still shows the *inverted pen* thumbnail in dark mode (`books.ts` comment), and covers
have no chalk at all — so a child taps a blob-eyed inverted-pen owl thumb and gets a solid-sclera
chalk owl on canvas. Now that every page has a chalk, generate `*.chalk`-based thumbs (and chalk
covers) and teach the picker to swap in dark mode. Asset-gen side is trivial (`gen-coloring-thumbs`
from the chalk); app side is a small `thumbPath()` variant.

* Try on: `creatures/owl` (max pen↔chalk delta), `shapes/circle`, any cover (`creatures/cover`).

### 20. Upscale / resolution audit vs device DPR **[unknown]**

Pages ship at 1024×1536. On a 3× tablet in landscape the reveal can display the wide asset near or
above native size; softness would show most in the line-adjacent fill detail. Idea: measure the real
rendered size on target devices (profiling harness), and if short, either regenerate at higher
resolution (model supports it — cost check) or lanczos/AI-upscale the committed raws and re-punch
(deterministic, no drift risk).

* Try on: `creatures/dragon-wide`, `space/station-wide` (dense detail), on a tablet-landscape
  profile.

## E. Review & process tooling

### 21. Before/after contact sheet from git history **[review speed]**

The pre-fork night fills are one `git show` away. For the user's set-by-set cleanup pass, a
`--source git:<ref>` mode on `gen-contact-sheet.mjs` (or a tiny wrapper) rendering old-vs-new pairs
would turn "is the regen better?" from memory into a side-by-side.

* Try on: `farm` (first migrated category), `creatures/owl-tall` (the "target to preserve" case).

### 22. Composite view as a first-class sheet layer **[review fidelity]**

The sheet's Combined view already simulates the canvas, but the *gates* and my manual train-wide
check used `lib/night-composite.mjs` ad hoc via `node -e`. Promote it:
`gen:coloring-composite -- <page>` writing light+night composites to the scratch dir, and use it in
every "should I override this gate?" call. (Doubles as the harness for ideas #7 and #15.)

* Try on: `vehicles/train-wide`, `farm/cat-tall`.

### 23. Golden-set regression fixtures **[safety net for all of the above — LANDED 2026-07-13]**

> Landed as `bin/audit-golden.mjs` + the committed `golden/golden-scores.json`
> (`gen:coloring-golden:freeze` / `gen:coloring-golden:diff`), with the night generation gates
> extracted into `lib/night-scores.mjs` so the committed raws re-score offline.

Before running down any regen-heavy idea, freeze the current shipped set's scores
(keep/localKeep/drift/bgLuma/lineW/eye verdicts per page — all cheap and offline) into a committed
JSON. Any future pipeline change re-runs the audits and diffs against the golden scores, so
"improved train-wide" can't silently degrade the other 93 pages. The audits already compute
everything; this is just persistence + a diff report.

* Try on: whole catalog (it's offline/free); spot-verify the diff catches a deliberate one-page
  revert.

### 24. Complete the orphan pages: heart-wide + umbrella-tall **[catalog gap]**

`shapes/heart` and `objects/umbrella` each have a full suite for exactly one orientation
(heart-tall, umbrella-wide) and are therefore uncataloged — invisible in the app despite ~10
finished assets. Author the missing pen outlines (the AI art prompts live in `docs/PROMPTS.md`), run
each through the standard suite, and wire both pages into `books.ts`.

* Try on: `shapes/heart-wide` (new pen needed), `objects/umbrella-tall` (new pen needed).

### 25. Light-mode byte-stability check in CI **[guard rail — LANDED 2026-07-13]**

> Landed as `bin/gen-asset-manifest.mjs` + the committed `golden/asset-manifest.sha256`
> (`gen:assets:manifest` / `check:assets:manifest`, verified in CI's Quality job and prerelease).

Several ideas above regenerate *night* assets; the standing invariant is "light mode stays
byte-identical through a night pass". Right now that's discipline, not a check. Idea: a tiny script
(or pre-commit/CI step scoped to asset PRs) that fails if
`*.light.webp`/`*.outline.webp`/`*.thumb.webp` changed when the commit message declares a night-only
pass — or more simply, a `gen:assets:manifest` hash file that makes any unexpected light-side change
show up in the diff.

* Try on: rerun of `farm` night fills (should touch zero light bytes).

---

## Suggested first burn-down order

1. **#6 pen normalization + light regen** (biggest visible light-mode win) — with **#11** landed
   first so the chalk gate stops fighting the same pages.
2. **#16 recolor-edit night fills** bake-off on 3 pages — if it wins, it absorbs #1 and #8
   wholesale.
3. ~~**#23 golden-set fixtures** before any mass regen.~~ Landed — `gen:coloring-golden:diff` is the
   standard post-change check.
4. **#19 dark-mode thumbs/covers** — cheap, user-visible, no model risk.
5. **#7/#15 halo + inpaint crop-audits** — verify the punch quality story before building anything
   else on top of it. (#7 landed as `gen:coloring-fills:audit:halo`; #15's junction crop-audit
   remains.)
