# Handoff — coloring vector campaign

> 2026-08-19 · branch `codex/vectorize-coloring-pilot` · PR
> [#1165](https://github.com/KyleMit/Splotch/pull/1165) · validate the SVG overlay pilot, automate
> its safe production path, integrate a runtime slice, then stage the pen and chalk campaigns

## Objective & non-goals

Validate the committed Vectorizer.AI pilot through PR review, automate its post-processing
invariants, then prove the proposed runtime path on a small pen/chalk slice before spending credits
on a pen-first campaign. Re-gate chalk separately on a dense-wide production trace.

This branch does **not** serve SVGs in the app, modify coloring manifests/caches, vectorize the
remaining catalog, or replace raster authoring sources, fills, covers, or picker thumbnails.

## State

* Branch: `codex/vectorize-coloring-pilot`, pushed to origin.
* Draft PR: [#1165](https://github.com/KyleMit/Splotch/pull/1165).
* Base: `main` at 72982b9a56260743d5c6a430565c6ad4c6e7f1c9.
* Pilot assets and analyzers: [`tools/vectorize/pilot/`](../../tools/vectorize/pilot/).
* Generated comparison PNGs and watermarked discovery/rehearsal traces remain gitignored under
  `vectorized/pilot/`; the seven PR images are hosted on the orphan `pr-assets` branch under
  `vectorize-coloring-pilot/`.

| Commit                                   | What                                                                                    |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| ea090f6720a53ce336ac4b1282ae662ea46178e5 | Add the raw/optimized keeper SVGs, offline analyzers, measurements, and pilot rationale |
| 5797a1e350207194a0aa468e4ca7c6cfd12e24bf | Add this campaign handoff                                                               |

Files touched by the pilot commit: `knip.json`, `tools/vectorize/README.md`, and
`tools/vectorize/pilot/**`. This handoff is the only additional feature-branch file.

## Decisions made (and why)

* Recommend one SVG for each full-page pen runtime overlay. The three page samples total 99.8 KB raw
  / 38.4 KB Brotli versus 169 KB of compact WebP or 237 KB of full WebP, while one SVG replaces both
  raster presentation tiers. Stage chalk separately because its sample saves only 21% versus the
  compact dark overlay before HTTP compression, and native receives canonical bytes without Brotli.
* Keep raster cover/picker thumbnails. Covers have no runtime overlay variant and render only at
  thumbnail size, where resolution independence has no presentation benefit. The farm SVG does beat
  the 83.5 KB canonical authoring outline at 49.4 KB raw, but the actual runtime comparison is its
  9.9 KB 240 px thumbnail versus 18.2 KB Brotli SVG. The paid cover trace could not change the
  structural decision.
* Keep raster pen/chalk sources and light/night fills. The vector is a presentation derivative, not
  a new authoring source or Magic-sheet format.
* Keeper parameters are `processing.max_colors=2`, black/transparent-white palette mapping, disabled
  gap filler, stacked shapes, and no color grouping. Details are in
  [`tools/vectorize/pilot/README.md`](../../tools/vectorize/pilot/README.md).
* Preserve both raw and SVGO-optimized paid outputs. Watermarked discovery and rehearsal files are
  disposable and were deliberately not promoted into git.
* Before any batch, replace the pilot's manual SVGO plus intrinsic-size restoration with a
  re-runnable post-processing script and a drift-guard test. Require every committed page SVG's
  `width` and `height` to match its `viewBox`, following ADR-0044's fixed-point audit model.
* Require a runtime slice and physical-iPad gate before the campaign. Browser microbenchmarks are a
  compatibility signal, not evidence about selection-frame responsiveness on real hardware.
* The campaign boundary is 96 canonical pen page sources plus 96 canonical chalk page sources. The
  pilot already produced circle pen, owl pen, and owl chalk keepers, leaving 94 pen and 95 chalk
  production traces. Run pen first; use one of the 95 chalk traces as the dense-wide production
  re-gate before authorizing the other 94. The 16 pen/chalk covers are outside the campaign.

## Unverified assumptions

* Netlify will Brotli-compress the served SVG responses as estimated; verify response headers and
  transferred bytes on a deployed runtime slice.
* SVG-backed overlays preserve selection, theme switching, Magic reveal, rotation, offline/PWA
  behavior, native pack installation, and screenshot export after app integration. Explicitly check
  raster fill registration beneath vector edges: no fill color peeking through and no hairline gap,
  especially on chalk where the sample has 97.47% binary IoU and 219/255 maximum alpha error.
* The manifest representation is undecided. `coloringPacks/manifest.ts` currently rejects any
  logical or download path not ending in `.webp`; choose and test the SVG-aware wire-format rule
  before starting the runtime slice.
* The pack-resolution model is undecided for invariant overlays. `ColoringPackResolution` remains a
  closed `compact | full` axis used by cache names and markers, while an SVG overlay would be shared
  across both variants and fills/thumbnails would still vary. Resolve that contract before editing
  manifest generation or cache behavior.
* Pack marker fingerprints should invalidate a changed asset set on the next app version without a
  bespoke migration, but the SVG slice must prove the end-to-end swap and cleanup behavior.
* Decide whether the raw paid SVGs remain useful once the integration selects the optimized files;
  the pilot commits both for reviewability, not as a permanent catalog storage rule.

## Done & verified

* Four production traces charged 4.0 credits; no Vectorizer.AI call was made while preparing this PR
  or handoff.
* The post-pilot account query recorded 26.9 credits. The 94-trace pen remainder is short 67.1
  credits; the complete 189-trace remainder is short 162.1 credits. Treat purchase authorization as
  a real gate, then re-query immediately before spending.
* `node tools/vectorize/pilot/analyze-results.mjs` reproduced the committed size and fidelity
  report. Page binary ink IoU is 97.47–97.91%; mean composite error is 0.46–0.73/255.
* Offline inspection of all full sheets and 2× crops found every shape, eye ring, catchlight,
  deliberate chalk white, and line closure intact; differences are antialiasing/subpixel edges.
* `node tools/vectorize/pilot/check-browser.mjs` passed five decode/draw/export samples per format
  in Chromium and WebKit; every SVG reported 1024×1536 intrinsic dimensions.
* `npm run test:tools -- tools/vectorize/tests/vectorize-image.test.mjs` — 11 passed.
* `npx eslint tools/vectorize/pilot/analyze-results.mjs tools/vectorize/pilot/check-browser.mjs` —
  passed.
* `npm run lint:dead` — passed.
* `npm run format:check` — passed.
* Hosted PR image sanity check — `200 image/png`.
* Review validation confirmed 96 pen and 96 chalk page sources; 48 pen pages are tall and 48 are
  wide. The two pen keepers are approximately the 3rd and 70th source-size percentiles. The five
  densest pen sources are all wide, and `creatures/fairy-wide.outline.webp` is the maximum at 181.5
  KB, 1.57 times the densest pen keeper.
* The runtime integration surface and current invariants were verified against ADR-0091 and
  ADR-0103, `books.ts`, `manifest.ts`, `resolution.ts`, `cacheKeys.ts`, the manifest/check scripts,
  and their focused unit/E2E tests.

## Risks & next 3 steps

Main risks are the manifest's WebP-only validator, manual post-processing silently dropping
intrinsic dimensions, an unrepresentative tall-only pilot, dense chalk approaching byte parity on
native, overlay/fill registration artifacts, changed service output during a long paid batch, and
deployed SVG compression differing from the estimate. Cache migration is not presumed necessary:
verify existing version/resolution namespaces and marker fingerprints on the slice.

1. Before any paid batch, add a deterministic Vectorizer post-processor plus an intrinsic-dimension
   drift guard, then run `creatures/fairy-wide.outline.webp` through free watermarked test mode and
   the offline fidelity/size analysis. Decide the manifest's SVG allowlist/format-version rule and
   how invariant overlays participate in the existing `compact | full` pack variants.
2. Integrate circle pen and owl pen/chalk as the runtime slice across `books.ts`, manifest
   generation/validation, coloring-asset checks, PWA/native packs, and export. On a deploy and
   physical iPad, verify transferred bytes, selection frames, light/dark theme, Magic reveal,
   rotation, offline reload, screenshot export, overlay/fill pixel registration, and automatic pack
   invalidation from the existing version/resolution namespace plus marker fingerprint.
3. If the slice passes, re-query the balance and explicitly authorize at least the 67.1-credit pen
   shortfall before batching the 94 remaining pen traces with an offline acceptance gate after every
   result. Then production-trace `creatures/fairy-wide.chalk.webp`, compare raw/native bytes and
   registration, and authorize the other 94 chalk traces only if that separate gate passes. The
   observed balance is 162.1 credits short of the complete 189-trace remainder.

## Reread first

* [`tools/vectorize/pilot/README.md`](../../tools/vectorize/pilot/README.md)
* [`tools/vectorize/README.md`](../../tools/vectorize/README.md)
* [`web/src/lib/state/books.ts`](../../web/src/lib/state/books.ts)
* [`web/src/lib/coloringPacks/manifest.ts`](../../web/src/lib/coloringPacks/manifest.ts),
  [`resolution.ts`](../../web/src/lib/coloringPacks/resolution.ts), and
  [`cacheKeys.ts`](../../web/src/lib/coloringPacks/cacheKeys.ts)
* [`tools/asset-gen/gen-asset-manifest.mjs`](../../tools/asset-gen/gen-asset-manifest.mjs) and
  [`tools/check-coloring-assets.mjs`](../../tools/check-coloring-assets.mjs)
* Manifest/resolution tests: [`manifest.test.ts`](../../web/src/lib/coloringPacks/manifest.test.ts),
  [`manifestBuild.test.ts`](../../web/src/lib/coloringPacks/manifestBuild.test.ts), and
  [`resolution.test.ts`](../../web/src/lib/coloringPacks/resolution.test.ts)
* Runtime tests: [`coloringFallback.test.ts`](../../web/src/lib/pwa/coloringFallback.test.ts),
  [`coloringPackRoute.test.ts`](../../web/src/lib/pwa/coloringPackRoute.test.ts),
  [`imagePrefetch.test.ts`](../../web/src/lib/imagePrefetch.test.ts),
  [`overlay.test.ts`](../../web/src/lib/drawing/overlay.test.ts),
  [`exportDrawing.test.ts`](../../web/src/lib/drawing/exportDrawing.test.ts),
  [`books.test.ts`](../../web/src/lib/state/books.test.ts), and
  [`coloringBook.svelte.test.ts`](../../web/src/lib/state/coloringBook.svelte.test.ts)
* Focused E2E: [`pwa-registration.spec.ts`](../../web/tests/pwa-registration.spec.ts) and
  [`flows-coloring-book.spec.ts`](../../web/tests/flows-coloring-book.spec.ts)
* [`docs/adrs/0044-svg-optimization-audit.md`](../adrs/0044-svg-optimization-audit.md)
* [`docs/adrs/0091-alpha-overlays-and-worker-magic-sheets.md`](../adrs/0091-alpha-overlays-and-worker-magic-sheets.md)
* [`docs/adrs/0103-progressive-coloring-book-packs.md`](../adrs/0103-progressive-coloring-book-packs.md)
* The `vectorize-image`, `architecture`, `adrs`, `mobile`, `profiling`, and `resume-handoff` skills
