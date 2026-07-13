# Idea 19 — Chalk covers + dark-mode thumbnails

**Verdict: WORKED** (pages, end-to-end, verified in the real running app). The cover half is a
documented gap: no cover has a chalk asset, so cover tiles cannot swap yet — but generating cover
chalks turns out to need *zero* tooling changes, just 8 Gemini calls.

## What was attempted

Full end-to-end, fully offline (0 Gemini calls, as predicted):

1. **Asset side** — extended `tools/asset-gen/gen-coloring-thumbs.mjs` to treat `*.chalk.webp` as a
   second thumbnail source, written as `{page}.chalk.thumb.webp` beside the pen `.thumb.webp`. Ran
   it over the whole catalog: **94 chalk thumbs** generated in seconds (plus 2 strays for
   uncataloged assets on disk — `shapes/heart-tall`, `objects/umbrella-wide`). Regenerating the
   existing pen thumbs proved byte-identical (deterministic sharp pipeline), so a full regen is
   safe.
2. **App side** — `web/src/lib/state/books.ts` gained `chalkThumbPath()`
   (`x.chalk.webp → x.chalk.thumb.webp`) and `pageThumb(page, orientation, theme)` (dark → chalk
   thumb where the orientation has a chalk, else pen thumb); `bookAssetPaths()` now lists the chalk
   thumbs so `check-assets` validates them and `strip-native-assets` removes them with their book.
   `ColoringBook.svelte` swaps the page-tile `src` and the page-thumb prefetch to
   `pageThumb(page, orientation, resolvedTheme())` — the existing reactive resolved-theme rune
   module, so a live theme switch re-picks the thumbs (same pattern `DrawingCanvas.svelte` uses for
   the full-screen chalk overlay).
3. **Verified in the real app** — `run-splotch` driver + a Playwright script with
   `localStorage splotch-theme=dark`: before/after screenshots of the dark-mode picker (books grid,
   Creatures grid, Shapes grid), owl and circle tiles cropped as evidence.
4. `npm run check` (0 errors), `books` unit tests (9 passed, tests extended for the new helpers),
   `scripts/check-assets.mjs` (568 assets, all pass).

## The key simplification: no negation needed anywhere

The idea text said the chalk must be "negated appropriately" for dark-mode thumbs. **Empirically
false — and that's the best part.** The picker tile already applies
`filter: var(--lineart-filter)` + `mix-blend-mode: var(--lineart-blend)` (= `invert(1)` + `screen`
in dark mode) to every tile `<img>`. Chalks are stored ink-on-white *by design* so that exact
treatment renders them as white chalk (see the storage-polarity comment in
`gen-coloring-chalk.mjs`). So the chalk thumb is a plain resize of the chalk — same pipeline as the
pen thumb, no polarity fork, no CSS change, and the tile preview goes through the *identical* render
path as the canvas overlay it predicts. The whole feature is ~15 lines of real code plus derived
assets.

## What the fix actually changes on screen

* **Owl (max delta, the motivating case)**: before, the dark-mode tile showed the inverted pen —
  hollow outline eyes and a hollow wand star; tapping it loaded a chalk owl with solid-white
  sclera/catchlights/stars. After, the tile shows exactly what the canvas will show
  (`owl-tile-before.webp` vs `owl-tile-after.webp`).
* **Circle (minimal delta)**: chalk≈pen for this page — only a couple of bubble highlights go solid
  white. Confirms the swap is harmless where the fork is small (`circle-tile-{before,after}.webp`).
* Whole-grid evidence: `creatures-grid-dark-{before,after}.webp` (dragon/fairy/mermaid eyes all gain
  proper sclera).
* Shapes revealed a surprise: the pen art for square/star is *already* solid-filled subjects, so
  their dark tiles looked "chalky" even before — the owl-class pages (creatures, farm animals,
  dinosaurs) are where the mismatch was worst.

## The cover gap (assessed, not generated — 0-Gemini ground rule)

* **No cover has a chalk**: `web/static/coloring/*/cover.outline.webp` exists for all 8 books,
  `cover.chalk.webp` for none. Book tiles therefore still show the inverted-pen cover in dark mode
  (`covers-dark-today.webp`) — unchanged by this patch.
* **Generating one needs no tooling changes.** `gen-coloring-chalk.mjs`'s category glob
  (`**/*-{tall,wide}.outline.webp`) skips covers, but its explicit-page path (`resolveArg`) resolves
  `creatures/cover` → `creatures/cover.outline.webp` directly. The eye-polarity gate auto-skips
  (covers have no `fill-src` light raw); the keep/enclosure/white-budget gates all still apply.
  Covers have no fills, so there is no night-fill/punch follow-up — a cover chalk is a leaf asset.
  So: `npm run gen:coloring-chalk -- <book>/cover --apply` × 8 books = **8 Gemini calls, done**.
* **App side for covers** (not in this patch, small): `Book` needs a `coverChalk?: string` field (or
  a convention: derive `cover.chalk.webp` and gate on the same per-book flag pattern as `chalk`),
  `bookAssetPaths()` adds it + its thumb, and the books-grid tile + cover prefetch in
  `ColoringBook.svelte` pick it via a `coverThumb(book, theme)` twin of `pageThumb`.
  `gen-coloring-thumbs.mjs` as patched already picks up any `cover.chalk.webp` automatically.

## Limitations / notes

* Payload: +94 committed webp files, ~600KB total (chalk thumbs average ~6KB). Native bundles grow
  the same way; `strip-native-assets` handles web-only books via the updated `bookAssetPaths`.
* The cover half of the idea's title is **not** delivered here (needs the 8 Gemini calls + the small
  `Book.coverChalk` wiring above).
* The books-grid (covers) prefetch and tile still use plain `thumbPath` — fine until cover chalks
  exist.
* Playwright evidence used the dark theme via `localStorage splotch-theme=dark`; the
  system-preference path uses the same `resolvedTheme()` rune, and a live theme switch is reactive
  by construction (not separately screenshotted).
* `books.test.ts` was updated: the old "exactly N thumbs" assertion matched on
  `.endsWith('.thumb.webp')`, which chalk thumbs also match — split into pen/chalk counts, plus new
  `chalkThumbPath`/`pageThumb` cases.

## Shipping steps

1. `git apply idea-19-chalk-thumbs.patch` (script + app + tests; verified to apply cleanly on
   8e471b8).
2. `npm run gen:coloring-thumbs` — regenerates all 102 pen thumbs (byte-identical) and writes the 94
   new `.chalk.thumb.webp`; commit the new files.
3. `node scripts/check-assets.mjs`, `npm run check`, `npm test`.
4. Optional follow-up PR for covers: 8× `gen:coloring-chalk -- <book>/cover --apply` (human-review
   the samples first), `Book.coverChalk` + `coverThumb()` wiring, regen thumbs. Consider an ADR note
   amending ADR-0045/0052 that picker thumbs are now theme-forked too.

## Recommendation

Ship the page-thumb half as-is — tiny, offline, closes the worst UX seam (tile shows one art, canvas
shows another). Do the cover half as a small follow-up once someone can spend 8 Gemini calls and
review the results.
