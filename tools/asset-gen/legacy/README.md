# asset-gen legacy — retired techniques, failed approaches, and their history

Nothing in this folder is part of the current pipeline. It preserves the
approaches the coloring-page pipeline **tried and moved past** — with the
reasoning and the failure pictures — so a future session can borrow from them
without digging through git history. The current pipeline lives one level up:
[`../pipeline.md`](../pipeline.md); the decision record that ended most of
what's chronicled here is [`../docs/pen-chalk-fork.md`](../docs/pen-chalk-fork.md).

Contents:

| File | What it is |
| --- | --- |
| `README.md` (this file) | The chronicle: the white-blob problem, the three eras of fixing it, rejected alternatives, and the eye-failure gallery |
| `night-fills.md` | The night-fill runbook as written in the **canonical-eye / single-outline era**. Its gate documentation and stubborn-page levers migrated into `../pipeline.md`; its "eyes are line-art-driven" playbook is what the pen/chalk fork retired |
| `retouch-line-art.mjs` | The canonical-eye retouch tool (Gemini line-art edit). Retired with that era; kept runnable (no npm alias — invoke with `node --experimental-strip-types legacy/retouch-line-art.mjs`) because its `--instruction` mode is still a template for one-off line-art edits |

Illustrations reference the frozen copies in [`../pipeline-assets/`](../pipeline-assets/).

## The problem all of this orbited: white blobs at night

For most of its life the pipeline shipped **one outline per page** serving both
themes. Both halves of the renderer assumed every dark outline pixel was a thin
stroke: the punch cut every outline-dark pixel out of the fills, and dark mode
blanket-inverted the outline (`invert(1)` + screen). A large SOLID black region
(a cartoon pupil, a tire, a black patch) broke both at once: its correct fill
pixels were deleted by the punch, then the invert painted the hole **pure
white**. A white *border* reads fine; a white *blob* does not. The owl showed
the whole problem in one page:

| The blanket invert on solid pupils | …but the raw night fill already had the eyes |
| --- | --- |
| ![owl with white goggle eyes](../pipeline-assets/problem-invert-owl.webp) | ![owl raw night fill with correct amber eyes](../pipeline-assets/problem-rawfill-owl.webp) |

![owl outline with big solid pupils](../pipeline-assets/problem-outline-owl.webp)

*The source of it all: solid-black pupils in the shared outline.*

Three eras of fixes, each subsuming the last:

### Era 1 — canonical-eye retouching (pre-2026-07)

Reshape each page's eyes in the shared outline so the invert *accident* landed
well: a bold solid pupil + exactly one medium glare + no iris ring, which
inverts to a white eyeball with a small dark pupil. `retouch-line-art.mjs` (in
this folder) automated the edit; `night-fills.md` (in this folder) documents
the recipe and the mermaid saga that produced it — a pin-dot glare became a
blank white blob, "opening the eye into an outlined iris" over-corrected to a
dark socket, and the canonical form was what finally stuck. Why it retired:
eyes-only (nothing for tires/patches/shapes), per-page hand work, and it kept
the accident as the mechanism.

### Era 2 — thin-stroke normalization (2026-07, PR #122)

Normalize every outline to thin strokes only, so the blanket invert and the
punch were correct **by construction**, and the fill generators saw blob-free
inputs. `normalize-outline-strokes.mjs` and the solidity/ring-depth audits were
built for this (they remain in the active pipeline — demoted to a *light-theme
quality* tool, no longer what keeps dark mode correct).

![ant outline before and after normalization](../pipeline-assets/outline-ant-before-after.webp)

*ant-tall before (solid pupils) and after (thin outlined pupil + catchlight).*

![ant night render before and after](../pipeline-assets/night-ant-before-after.webp)

*ant-tall at night, before and after. The before looked passable only by
accident — the old solid pupil inverted to a white eyeball and the glare dot
became a fake pupil (era 1's trick). The after is the same look produced by
design: the night fill painted the eye and survived the punch.*

Why it retired as the dark-mode fix: one outline still served two masters.
Whites the dark render genuinely wants solid (an eye's sclera) can't exist in
a shared outline without breaking light mode, so the night fill had to paint
them and an ever-growing stack of eye gates had to police it.

### Era 3 — the pen/chalk fork (current; not legacy)

Dark mode got its own authored line art. See
[`../docs/pen-chalk-fork.md`](../docs/pen-chalk-fork.md) and
[`../pipeline.md`](../pipeline.md).

## Alternatives considered and rejected for dark mode

| # | Approach | Why not |
| --- | --- | --- |
| A | **Structure-aware "smart chalk"** — build-time morphological classifier splits thin strokes from solid interiors; ship a derived `.chalk.webp` per page; dark mode renders it instead of `invert(1)`; punch keeps solid interiors | Fully prototyped and it worked (below) — but a *classifier* can only preserve what the shared outline happens to contain; it can't decide a thin-ringed sclera should go solid white. The pen/chalk fork ships the same asset shape (a `.chalk.webp` per page) with an *author* instead of a classifier. |
| B | Same classifier at **runtime** (canvas, per page-apply) | The exact main-thread work ADR-0043 moved to build time, on low-end tablets. |
| C | **Canonical-eye retouch** at scale (era 1) | Eyes-only; keeps the accident as the mechanism. |
| D | **AI-generated dedicated night line art** per page, generated fresh | Two *independently-generated* line arts drift out of registration — the ghosting class ADR-0043 exists to prevent. The pen/chalk fork is D **domesticated**: the chalk is an *edit of the pen*, gated on outlineMatch registration, so every pen stroke provably survives in place and only bounded solid whites are added. |

![option A prototype, owl before and after](../pipeline-assets/optionA-chalk-owl.webp)

*Option A's prototype output (right) vs the blanket invert (left). It rescued
the owl's eyes without touching any asset — worth knowing it exists if a
category ever resists the chalk redraw.*

![option A unrevealed states](../pipeline-assets/optionA-chalk-unrevealed-owl.webp)

*Option A also solved the uncolored page (left: blob pupils; right: rimmed
outlines).*

## The eye problem — a chronicle of shipped (or nearly shipped) failures

Eyes are where every failure in this pipeline concentrated: the
highest-contrast, most anatomically-particular structure on the page, and
toddlers look at them first. Every gate in the active pipeline exists because
one of these actually happened — scores kept lying, and each row is the
regression that created a gate:

| Failure | What it looked like | The gate it created |
| --- | --- | --- |
| Solid pupils invert to white blobs | ![owl goggles](../pipeline-assets/problem-invert-owl.webp) | solidity audit (blob bar) |
| Small pupils duck a fixed erosion radius | ![bee-tall before and after](../pipeline-assets/fail-small-pupils-beetall.webp) | adaptive radius from measured stroke width |
| Fake-hollow redraw: still solid, holes fragment the blob metric | (never committed — blob 46 but 103 total interior px) | total-interior bar |
| "Hypno swirl" eyes: too many concentric rings, poisoning both fills | ![swirl eyes](../pipeline-assets/fail-swirl-eyes-caterpillar.webp) | ring-depth ≤ 4 |
| Normalizer redraw deletes an eye entirely, registration barely notices (99.7% local keep) | ![one-eyed caterpillar](../pipeline-assets/fail-missing-eye-caterpillar.webp) | eyes-preserved gate |
| Night fill floods the whole eye one color — rings never colored in | ![dead bee-wide rings](../pipeline-assets/fail-dead-rings-beewide.webp) | eye-fill gate |
| Night fill paints the catchlight but leaves the sclera dead (eye reads as a dark socket) | ![dead-sclera ladybug](../pipeline-assets/fail-dead-sclera-ladybug.webp) | all-cores enforcement in `judgeNightEyes` |
| Chalk redraw whitens the whole eyeball, pupil included — every ring still traced, so registration is blind | (nature's first spider/caterpillar chalks) | chalk eye-polarity gate |
| Chalk gate judged new ink by *thickness* and misread every whitened sclera (a thin annulus) as an invented stroke — rejected 9 of 12 perfectly good chalks | (gate bug, no asset shipped) | enclosure-based new-ink gate |

And the fixed versions that shipped (era 2's nature pilot):

| | | |
| --- | --- | --- |
| ![fixed ladybug](../pipeline-assets/fixed-ladybug-night.webp) | ![fixed caterpillar](../pipeline-assets/fixed-caterpillar-night.webp) | ![fixed spider](../pipeline-assets/fixed-spider-night.webp) |

## Useful branch history (feat/thin-stroke-outlines → the fork)

| Commit | What |
| --- | --- |
| `b801d1c` | pre-normalization baseline (solid-pupil outlines, era-1 night fills) |
| `3a686ad` | solidity gate + normalizer tooling |
| `4482aca` | first nature normalization — includes the swirl-eyed caterpillar outline (fixture) |
| `6840bba` | eye-fill gate, adaptive radius, bee/snail renormalized |
| `551ab52` | ring-depth gate, caterpillar de-swirled — includes the dead-sclera ladybug night raw (fixture) |
| `d96ae6f` | all-cores night-eye enforcement, final band definition, ladybug/spider regenerated |
| `a5c8dec` | the pen/chalk fork: chalk generator, per-theme punch, renderer swap |
| `e99fd22`–`abb651a` | nature chalks shipped; enclosure + eye-polarity chalk gates |

Known-bad fixtures live at those commits — recalibrate new gates against them
rather than trusting scores alone.
