# Handoff — Vector-canonical coloring art

> 2026-08-20 · branch `claude/outline-vectorization-handoff-fcg5lc` · PR
> [#1171](https://github.com/KyleMit/Splotch/pull/1171) merged · Make SVG the sole canonical
> line-art format, including covers and picker tiles, then re-punch fills and retire raster line-art
> assets

## Objective & non-goals

Build a successor to #1171 that:

* retires the picker's raster thumbnail tier in favor of the overlay SVGs already shipping in the
  pack;
* vectorizes the eight light and eight dark book covers;
* moves every authoring, audit, proof-sheet, and punch consumer from committed raster line-art
  masters to canonical SVGs or deterministic SVG rasterization;
* resolves the punch's reproducibility contract (see **The punch determinism decision** below) and
  deterministically re-punches shipped light/night fills if that decision calls for it; and
* deletes committed `*.outline.webp` / `*.chalk.webp` line-art masters only after no consumer needs
  them.

Do **not** regenerate the creative colored fills through Gemini. Preserve the committed
`tools/asset-gen/fill-src/**/*.raw.webp` artwork and change only the deterministic inpaint punch. Do
not change the approved line-art design, theme fork, Magic Brush semantics, or runtime source-over
composition.

**This is three PRs, not one.** See **Risks & next 3 steps** — the ordering matters and the original
single-PR framing was wrong.

## State

PR #1171 **has merged**. `main` is at 6648980c3bd1bb0c4d66e3e81845713ad7db7adf and contains the
campaign merge 27d8127. The rebase precondition in the previous revision of this handoff is
satisfied; there is nothing to wait on.

| Commit                                   | What landed                                                   |
| ---------------------------------------- | ------------------------------------------------------------- |
| efed61160ea5306e71347c74677d265217ad9c30 | Vectorized all light page overlays                            |
| adf3229493ef593483d42034b681fc9ca04a2424 | Made page SVGs invariant compact/full pack members            |
| 6c2323d7430455d636804692e93e39015dfe4b99 | Added the first 83 dark page overlays                         |
| cb4545e9826563e904334f842d53b38fd4070976 | Completed all 96 dark page overlays and retired overlay WebPs |

No implementation file has been changed. This handoff is the only repo change on this branch.

Contracts to replace, with line numbers verified against 6648980:

* `web/src/lib/state/books.ts:129-138` — `ASSET_SUFFIXES`, the raster/vector suffix vocabulary;
* `web/src/lib/state/books.ts:175-178` — `coverPath()`, raster-only cover derivation;
* `web/src/lib/state/books.ts:274-281` — `pageOverlayAssetPath()`, which derives the SVG path by
  **string-slicing the `.outline.webp` suffix off the raster path**;
* `web/src/lib/state/books.ts:293-322` — `thumbPath()` / `chalkThumbPath()` / `pageThumb()` /
  `coverThumb()`;
* `web/src/lib/state/books.ts:344-386` — `responsiveColoringAssets()`, the `max-240px` tier;
* `web/src/lib/state/books.ts:388-459` — `bookAssetPaths()` (validation + native strip) and
  `bookPackAssetPaths()` (pack inventory, carries both thumbnails and page SVGs);
* `tools/asset-gen/lib/punch-fill.mjs:105-142` — light/night masks from raster pen/chalk luma; and
* `tools/vectorize/vectorize-coloring-overlays.mjs:54,76` — the two places the campaign runner
  excludes covers.

Read-only inventory on this commit (every figure re-measured and exact):

| Asset class                              | Files |      Bytes |
| ---------------------------------------- | ----: | ---------: |
| Raster pen/chalk masters, pages + covers |   208 | 19,709,932 |
| Root picker thumbnails                   |   208 |  2,819,266 |
| `max-240px` picker derivatives           |   208 |  1,378,460 |
| Existing page overlay SVGs               |   192 |  7,532,218 |
| Cover masters alone (8 light + 8 dark)   |    16 |  1,421,690 |

The last reported Vectorizer.AI balance was 37.9 credits. Sixteen production cover traces would cost
16 credits, but the successor must query the account again before spending. The current campaign
driver excludes covers and caps one paid batch at 12.

## Decisions made (and why)

* **Retire page thumbnails first, as a standalone PR.** Page tiles can render the light/dark overlay
  SVG the paper already uses, which is **already a pack member** — so this costs **0 Vectorizer
  credits and adds 0 bytes** while removing ~3.9 MB of the 4.2 MB thumbnail tier (192 of 208 root
  thumbs plus their `max-240px` siblings). It is fully separable from covers: cover tiles keep
  `cover.thumb.webp` until the covers are traced. This also exercises the picker-grid performance
  question — the plan's main unproven assumption — without spending a credit on it. The previous
  revision buried this behind cover vectorization; that was risk-inverted.
* **Vectorize all 16 covers, last.** The picker displays covers large enough that the 400 px raster
  source upscales on Retina iPads, and a cover SVG completes the format boundary. But the byte case
  is roughly break-even (1.42 MB of masters replaced by a comparable volume of SVG at the ~39 KB
  average page trace), the fidelity is unmeasured, and it costs 16 of ~37.9 remaining credits. It is
  the most expensive and least certain item, so it goes last. Use a free dense-cover pilot first and
  one paid keeper per cover/theme only after parameters are fixed.
* **Treat SVG as the new canonical line art, then delete raster masters.** Git retains the original
  rasters as provenance, and future bitmap inputs can be deterministically rasterized from SVG. Do
  not describe that as reconstructing the old original: Vectorizer output is a deliberately lossy,
  fidelity-gated replacement. Deletion happens only after every tool and ledger has migrated **and
  the punch determinism decision below is settled** — deletion gates on that, not on the cover
  trace.
* **Remove thumbnail assets, not the UI concept of a picker tile.** Keep lazy loading, accessibility
  labels, and picker semantics. Remove `thumbPath()`, `chalkThumbPath()`, thumbnail `srcset`, the
  `max-240px` tier, thumbnail generation, and duplicate pack entries once the SVG path passes
  performance gates.
* **The tile's blend/filter CSS is the migration, not a preserved detail.**
  `ColoringBook.svelte:445` applies `mix-blend-mode: var(--lineart-blend)` +
  `filter: var(--lineart-filter)` — `invert(1)` in dark (`web/src/tokens.css:155`) — and that
  treatment exists because thumbnails are **opaque ink-on-white raster**. The overlay SVGs are
  transparent-alpha and **already theme-forked** into `.overlay.svg` / `.dark.overlay.svg`. Applying
  `invert(1)` to a dark overlay SVG flips white chalk back to black. This CSS must be neutralized on
  the SVG path, and `ActivePageChip.svelte:75` carries the identical treatment.
* **Keep raw fill sources.** `fill-src/**/*.raw.webp` contains creative color information that
  cannot be recovered from line-art SVGs and is outside the raster-master purge.
* **Approve the simplification empirically.** #1171 measured one full-paper SVG at a time; a picker
  simultaneously decodes/renders eight covers or twelve page-orientation tiles. Retain only after
  the real iPad book-open/page-grid actions and visual scroll remain frame-bound.

### The punch determinism decision

This is the blocker, and the previous revision of this handoff contained a contradiction rather than
a plan.

`tools/asset-gen/coloring/punch-fill-outlines.mjs:9-11` advertises the contract: *"Offline +
deterministic: pure sharp, no network. Safe to re-run anytime; a raw fill with no matching line art
fails loudly."* The punch reproduces a committed shipped fill from a committed raw fill plus a
committed line-art mask.

A union mask (legacy raster ∪ canonical SVG alpha) **requires the raster masters that the plan then
deletes**. After deletion, the committed fills could not be reproduced from surviving committed
inputs. And this is not a one-time migration concern — `punchFill()` is also on the *creation* path
for every new page (`tools/asset-gen/coloring/gen-light-fills.mjs:321`,
`tools/asset-gen/coloring/gen-night-fills.mjs:454`).

Pick one explicitly before writing any code:

1. **Commit the derived union mask** as its own artifact class, and let the punch read that. Keeps
   reproducibility; adds a committed binary per page.
2. **Demote raster line art to an uncommitted authoring intermediate** — generated, used for the
   punch, never committed — and restate the determinism contract in the script header to match.
   Cheapest in bytes; gives up "re-runnable from a fresh clone".
3. **Prove SVG-alpha-only masks suffice** and skip the union entirely. Cleanest end state, needs
   pixel/composite proof sheets and negative tests.

Also settle a question the previous revision never asked: **is a re-punch needed at all?** Shipped
fills are already punched against the raster mask. Where the vector stroke is *thinner* than the
raster stroke, the shipped fill carries bled color the SVG does not cover — smooth inpainted color,
plausibly invisible. Where the vector stroke *wanders outside* the raster stroke, the SVG ink covers
it. The re-punch's real gain may be marginal against regenerating 200+ committed binaries. Measure
before committing to it. The union is only needed *because* a re-punch restarts from the unpunched
raw fill; option 3 or "no re-punch" removes that pressure.

## Unverified assumptions

* **Picker-grid performance.** Eight or twelve simultaneously displayed SVGs staying within the
  picker action/scroll gates on the physical iPad is still unproven; existing evidence covers
  full-paper presentation only. This is the plan's single most load-bearing unknown and step 1 is
  designed to test it cheaply.
* **Cover fidelity and size.** No cover has been traced or analyzed. Current page-vector parameters
  are assumed to transfer; the byte case is assumed break-even from the page-trace average, not
  measured.
* **Mask sufficiency.** Whether any of the three punch options removes raw-fill outline remnants
  without erasing legitimate dark fill detail needs pixel/composite proof sheets and negative tests
  before the masters are deleted.
* **Stale-manifest tolerance on removal.** Adding cover SVGs needs no format bump (below), but
  *removing* thumbnail paths means a client holding a cached format-3 manifest lists files the
  server no longer serves. The 404 behavior on that path is unverified and may be what actually
  forces a bump.

Now **verified**, and no longer assumptions:

* The `rg` consumer inventory. Roughly 20 live consumers plus tests reference the raster suffixes,
  spanning `tools/asset-gen/coloring/`, `tools/asset-gen/lib/`, `tools/mobile/`, `tools/vectorize/`,
  and `web/src/lib/`. The `tools/asset-gen/ideas-exploration/` tree also matches heavily but is
  historical scratch and needs no migration.
* Manifest format. `web/src/lib/coloringPacks/manifest.ts:79-81` is
  `/(?:^|\/)[^/]+(?:\.dark)?\.overlay\.svg$/`, which `cover.overlay.svg` and
  `cover.dark.overlay.svg` already satisfy. **Cover SVGs need no format bump** if named on that
  pattern — the bump risk lives entirely on the removal side.
* Single-PR reviewability. It is not one PR; see the three-step split.

## Done & verified

* PR #1171 merged; `main` at 6648980, ADR Integrity and the full Tests workflow passed at
  cb4545e9826563e904334f842d53b38fd4070976.
* Current page catalog: `vectorize:coloring:check` reports 96 light + 96 dark records;
  `vectorize:postprocess:check` reports 196 SVG fixed points.
* Physical-iPad completed-catalog sweep: book opening 14/17/22 ms and page selection 18/20/20 ms
  (first-frame P95 / post-action P95 / max). Full-paper only — **not** a picker grid.
* Every inventory figure in the State table re-measured against 6648980 and exact.
* `bookPackAssetPaths()` (`books.ts:431-459`) confirmed to carry both theme-specific thumbnails and
  theme-specific page SVGs, so page-tile reuse can drop duplicate pack members.
* `punchFill()` (`punch-fill.mjs:105-142`) confirmed to build masks from `.outline.webp` /
  `.chalk.webp` luma, so deleting masters before the punch migration breaks deterministic fill
  generation.
* **The runtime already stopped fetching `.outline.webp` for the paper.** `overlayUrl()` survives
  only as a truthiness check (`DrawingCanvas.svelte:265,273`); the displayed `src` is the SVG. So
  `page.images` is now a pure identifier. Two consequences: the `.outline.webp` string is
  load-bearing as a *key* and cannot be renamed without reworking `pageOverlayAssetPath()`'s slicing
  (`books.ts:274-281`); and `pageCompositionKey()` feeds in-memory magic-op recoding only
  (`engine.ts:1046,1167`, `magicBrush.ts:457`), is never persisted, so **there is no saved-drawing
  migration**.
* **The golden gate fails open, not loudly.** `check-golden-scores.mjs:80` enumerates the catalog by
  globbing `**/*.outline.webp` under `COLORING_DIR`. Delete the masters and it scores **zero pages
  and passes** rather than erroring. Enumeration-source and mask-source are two distinct raster
  dependencies; only one of them fails visibly. `check:coloring-fill-drift`,
  `check:coloring-fill-eyes`, `check:coloring-invented-shapes`, `check:coloring-night-halo`, and
  `check:coloring-outline-quality` share the raster dependency and need the same audit.
* ADR-0129 states outright that "Picker covers and thumbnails, Magic fills, and authoring outlines
  remain raster assets." The successor reverses three of those four, so a superseding/amending ADR
  is **required**, not optional.
* No cover trace, new punch, thumbnail removal, or grid performance measurement has been run.

## Risks & next 3 steps

Three PRs, in this order. Deletion of the 208 masters gates on step 2's decision, **not** on step 3.

1. **Page-thumbnail retirement.** 0 credits, 0 added bytes, ~3.9 MB removed. Point page tiles at the
   existing overlay SVGs, neutralize the `mix-blend-mode`/`filter` treatment on the SVG path
   (`ColoringBook.svelte:445`, `ActivePageChip.svelte:75`), drop the page half of `thumbPath()` /
   `max-240px` / pack duplication, and keep cover thumbs untouched. Gate on the physical-iPad
   page-grid open + scroll measurement — this PR exists partly to produce that evidence.
2. **Canonical-source migration and the punch decision.** The hard PR. Settle the three-way punch
   choice above; migrate proof sheets, the six `check:coloring-*` gates (fixing the fail-open
   enumeration), generators, and ledgers to SVG inputs or deterministic rasterization; re-freeze
   `golden/golden-scores.json` knowing the baseline's historical comparability is spent; verify the
   stale-manifest removal path and bump the format only if it forces one; write the ADR amending
   ADR-0129. Only then delete the 208 raster masters and 416 thumbnail files, and run full
   tests/builds/offline pack checks.
3. **Cover vectorization.** Query credits first. Free simple/dense light+dark cover trials, then a
   paid keeper gate with fidelity, raw/gzip/native size, Chromium/WebKit decode, and physical-iPad
   cover-grid checks before spending. Name the outputs `cover.overlay.svg` /
   `cover.dark.overlay.svg` to stay inside the existing manifest format. Extend the campaign runner
   past its two cover exclusions (`vectorize-coloring-overlays.mjs:54,76`). Then retire the last 16
   cover thumbs and repeat the physical-iPad theme/book/page/Magic/rotation/clear/export sweep with
   PR before/after imagery.

## Reread first

* `docs/adrs/0129-invariant-svg-overlays-in-coloring-packs.md`
* `docs/adrs/0045-coloring-picker-thumbnails-and-prefetch.md`
* `docs/adrs/0091-alpha-overlays-and-worker-magic-sheets.md`
* `docs/adrs/0103-progressive-coloring-book-packs.md`
* `web/src/lib/state/books.ts`
* `web/src/lib/coloringPacks/manifest.ts`
* `web/src/lib/components/ColoringBook.svelte`
* `tools/asset-gen/lib/punch-fill.mjs`
* `tools/asset-gen/coloring/punch-fill-outlines.mjs`
* `tools/asset-gen/coloring/check-golden-scores.mjs`
* `tools/asset-gen/docs/inpainted-fill-punch.md`
* `tools/asset-gen/docs/asset-naming.md`
* `tools/asset-gen/docs/pipeline.md`
* `tools/vectorize/README.md`
* Skills: `resume-handoff`, `vectorize-image`, `profiling`, `mobile`, `testing`, `create-adr`,
  `update-adrs`, and `pr-screenshots`
