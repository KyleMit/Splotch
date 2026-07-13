# Idea #24 — Complete the orphan pages: heart-wide + umbrella-tall

**Verdict: WORKED.** Both orphan pages were completed end-to-end — new pen outlines authored, full
standard suites generated with every stock gate passing, both pages wired into `books.ts`, and
`check:assets` + `svelte-check` + 353 unit tests all green — in **12 Gemini image calls** (hard cap
was 14). The remaining cost to actually ship this is **zero further API calls**: all assets are
finished copies in this directory.

## 1. Orphan inventory (verified on disk, baseline 8e471b8)

The IDEAS.md entry had the orientations backwards; the note from idea-run #19 was right:

| Page               | Exists (full 5-asset suite + 2 raws)                                  | Missing                          |
| ------------------ | --------------------------------------------------------------------- | -------------------------------- |
| `shapes/heart`     | `heart-tall` (outline, chalk, light, night, thumb + light/night raws) | **`heart-wide`** — everything    |
| `objects/umbrella` | `umbrella-wide` (same full suite + raws)                              | **`umbrella-tall`** — everything |

Neither page appears in `web/src/lib/state/books.ts` because `ColoringPage.images`/`colorImages` are
`Record<BookOrientation, string>` — both orientations are mandatory, so a single-orientation page
cannot be cataloged. ~14 finished assets were invisible in the app.

## 2. Authoring the missing pens

`docs/PROMPTS.md` turned out **not** to contain a usable pen-outline prompt — its "Drawings" prompt
is colored-pen-stroke art and its "Icons" prompt is app icons. The pipeline calls pens
"hand-curated" with no generation script. So the pens were authored with a small ad-hoc script
(`code/gen-pen-idea24.mjs`, run inside `tools/asset-gen/`, deleted after) that:

* conditions Gemini (`gemini-2.5-flash-image`, the pipeline's stock model) on the page's **existing
  sibling orientation** as a style reference — far stronger style anchoring than any text prompt
  could give;
* asks for the same subject recomposed for the target orientation, thin closed outlines, no solids,
  no text;
* requests the aspect ratio explicitly via `config.imageConfig.aspectRatio` ('3:2' / '2:3'), which
  `@google/genai` 2.10 supports — the model honors it (returns 1248x832 / 832x1248);
* normalizes output to the pen contract: resize to exact page dims (1536x1024 / 1024x1536), `b-w`
  colourspace + normalise, webp q90.

**Attempt log (pen):**

| Attempt                                                                                    | Result                                                                                                               |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| heart-wide #1 (t 0.6, no note)                                                             | Correct wide canvas, but the model re-centered a portrait composition — big empty side margins. Rejected on eyeball. |
| heart-wide #2 (+ "FILL THE WHOLE LANDSCAPE WIDTH … flowers across the ENTIRE bottom edge") | Proper landscape composition (heart center, 5 flowers across, 3 clouds spread). **Accepted.**                        |
| umbrella-tall #1 (fill-the-height note included from the start)                            | Good portrait composition first try. **Accepted.**                                                                   |

Lesson: the model defaults to reproducing the *reference's* composition even on a differently shaped
canvas; an explicit fill-the-axis instruction fixes it in one retry. Bake it in from the start (as
the umbrella run did).

**Pen gates:** `gen:coloring-outlines:audit` — both new pens score **0 solid px, 0 interior px, ring
depth 0** ("ok"), cleaner than 9 of the 13 existing shapes entries (which carry advisory SOLID
findings). No normalizer pass needed. Neither page has eyes, so eye topology was moot.

## 3. Standard suite runs (stock gates, default model, no gate edits)

| Step                                       | heart-wide                                                             | umbrella-tall                                                        |
| ------------------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| thumb (`gen:coloring-thumbs`, offline)     | ok                                                                     | ok                                                                   |
| chalk (`gen:coloring-chalk --apply`)       | **1 attempt** — keep 100.0%, local 100.0%, white 0.0%, invented 0.0000 | **1 attempt** — keep 99.9%, local 98.1%, white 0.0%, invented 0.0000 |
| light fill (`gen:coloring-fills`)          | **1 attempt** — keep 100.0%, local 100.0%, white 0.0%                  | **4 attempts** — final keep 100.0%, local 100.0%, white 0.0%         |
| night fill (`gen-coloring-fills-dark.mjs`) | **1 attempt** — drift 0.0016, bgLuma 25, lineW 252                     | **1 attempt** — drift 0.0000, bgLuma 33, lineW 255                   |
| punch (`gen:coloring-punch`, offline)      | 3.4% / 3.5% px                                                         | 3.9% px (night)                                                      |
| drift audit (`gen:coloring-fills:audit`)   | 100.0% / 100.0%, 0 flagged                                             | 100.0% / 100.0%, 0 flagged                                           |
| eye audit                                  | 0 cores (eyeless page) — ok/ok                                         | 0 cores — ok/ok                                                      |

The pipeline's "eye-flavored redraw can refuse eyeless scenes" hazard (objects/house-wide precedent)
was preempted by passing `--notes "This page has NO eyes and NO faces anywhere -
that is expected…"`
to both chalk runs; both cleared in one attempt. Recommend the same for any future eyeless page.

**API-call tally (12 total):** heart-wide = 2 pen + 1 chalk + 1 light + 1 night = **5**;
umbrella-tall = 1 pen + 1 chalk + 4 light + 1 night = **7**.

## 4. Catalog wiring + validation

`code/books-ts-wiring.patch` adds two lines to `web/src/lib/state/books.ts`:

* `page('shapes', 'heart', 'Heart', ['portrait', 'landscape'], ['portrait', 'landscape'])` (after
  circle — alphabetical);
* `page('objects', 'umbrella', 'Umbrella', ['portrait', 'landscape'], ['portrait', 'landscape'])`
  (after teddy).

With the assets in place: `check:assets` passes (**496 assets across 8 books**, up from 486
heart-only / 476 baseline), `svelte-check` 0 errors, `npm run test:unit` 35 files / 353 tests green.
Shapes grows to 7 pages, Objects to 6.

## 5. What's in this directory

* `assets/web/static/coloring/{shapes,objects}/…` — the 10 shipped-tree files (outline, chalk,
  light, night, thumb per page), punched and gate-passing. Copy back verbatim.
* `assets/fill-src/{shapes,objects}/…` — the 4 committed raw fills (source of truth).
* `code/books-ts-wiring.patch` — the catalog change.
* `code/gen-pen-idea24.mjs` — the sibling-conditioned pen authoring script (was temporary in
  `tools/asset-gen/`; worth promoting to a real `gen:coloring-pen` script).
* `code/evidence-idea24.mjs` — composite builder used for the evidence images.
* Evidence images (long side ≤ 560 px):
  * before: `heart-tall.pen.webp`, `umbrella-wide.pen.webp` (the lone sibling orientations — the gap
    was everything else);
  * after: `{heart-wide,umbrella-tall}.pen.webp`, `.chalk-display.webp` (negated, as dark mode
    shows), `.light-combined.webp` (raw lined fill = light-mode look), `.night-combined.webp`
    (simulated final dark composite via `lib/night-composite.mjs`).

## 6. Limitations & follow-ups

* **Human review not yet done** — the pipeline's shipping runbook requires contact-sheet review
  (Combined view, both themes) before commit. My eyeball review: both suites look
  category-consistent; heart-wide's flowers differ per-bloom in night palette (charming, matches
  nature pages); umbrella-tall's light fill left raindrop interiors a near-white pale tint — passed
  the white gate (0.0%) but a reviewer might want them bluer.
* **Composition margins**: umbrella-tall carries slightly larger top/bottom margins than its wide
  sibling; acceptable vs. heart-tall's margins, but a regenerate-with-note is cheap (~1 call) if the
  reviewer disagrees.
* **PROMPTS.md gap**: the doc the IDEAS entry points at does not contain the pen prompt. If this
  ships, add the sibling-conditioned pen recipe (and the fill-the-axis lesson) to `docs/PROMPTS.md`
  and/or promote `gen-pen-idea24.mjs` — otherwise the next orphan page re-derives all of this.
* Thumbs regeneration is deterministic — rerunning `gen:coloring-thumbs` over the categories
  produced byte-identical existing thumbs (only the 2 new ones appeared in `git status`).

## 7. Remaining cost to finish both pages completely

**0 Gemini calls.** Both pages are done. To ship: copy `assets/` into the repo, apply the books.ts
patch, re-run the three offline audits + `check:assets`/`check`/`test:unit` (all verified green
here), rebuild the shapes + objects contact sheets, human-review, commit. Optional polish (raindrop
tint, umbrella margins): ~1–5 calls.
