# Handoff — coloring vector campaign

> 2026-08-19 · branch `codex/vectorize-coloring-pilot` · PR
> [#1165](https://github.com/KyleMit/Splotch/pull/1165) · validate the SVG overlay pilot, integrate
> a runtime slice, then decide whether to vectorize the catalog

## Objective & non-goals

Validate the committed Vectorizer.AI pilot through PR review, then prove the proposed runtime path
on a small pen/chalk slice before spending credits across the catalog.

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

Files touched by the pilot commit: `knip.json`, `tools/vectorize/README.md`, and
`tools/vectorize/pilot/**`. This handoff is the only additional feature-branch file.

## Decisions made (and why)

* Recommend one SVG for each full-page pen/chalk runtime overlay. The three page samples total 99.8
  KB raw / 38.4 KB Brotli versus 169 KB of compact WebP or 237 KB of full WebP, while one SVG
  replaces both raster presentation tiers.
* Keep raster cover/picker thumbnails. The farm cover SVG is 18.2 KB Brotli versus the 9.9 KB
  compact WebP, so vectorizing covers increases transfer.
* Keep raster pen/chalk sources and light/night fills. The vector is a presentation derivative, not
  a new authoring source or Magic-sheet format.
* Keeper parameters are `processing.max_colors=2`, black/transparent-white palette mapping, disabled
  gap filler, stacked shapes, and no color grouping. Details are in
  [`tools/vectorize/pilot/README.md`](../../tools/vectorize/pilot/README.md).
* Preserve both raw and SVGO-optimized paid outputs. Watermarked discovery and rehearsal files are
  disposable and were deliberately not promoted into git.
* Require a runtime slice and physical-iPad gate before the campaign. Browser microbenchmarks are a
  compatibility signal, not evidence about selection-frame responsiveness on real hardware.
* The campaign boundary is 96 canonical pen page sources plus 96 canonical chalk page sources. The
  pilot already produced circle pen, owl pen, and owl chalk keepers, leaving 189 production traces
  if those files are reused. The 16 pen/chalk covers are outside the recommended campaign.

## Unverified assumptions

* Netlify will Brotli-compress the served SVG responses as estimated; verify response headers and
  transferred bytes on a deployed runtime slice.
* SVG-backed overlays preserve selection, theme switching, Magic reveal, rotation, offline/PWA
  behavior, native pack installation, and screenshot export after app integration.
* The three page samples span enough path complexity for the rest of the catalog. Add an outlier
  test-mode/production sample before batching if the catalog contains materially denser artwork.
* The account was previously observed after a credit upgrade, but the current balance was not
  queried in this session. Run `npm run vectorize -- --account` immediately before budgeting the 189
  remaining production traces.
* Decide whether the raw paid SVGs remain useful once the integration selects the optimized files;
  the pilot commits both for reviewability, not as a permanent catalog storage rule.

## Done & verified

* Four production traces charged 4.0 credits; no Vectorizer.AI call was made while preparing this PR
  or handoff.
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

## Risks & next 3 steps

Main risks are an unrepresentative high-complexity page, changed service output during a long paid
batch, SVG response compression differing from the estimate, and runtime/PWA/native cache seams that
the evidence-only pilot intentionally does not touch.

1. Review and address feedback on PR [#1165](https://github.com/KyleMit/Splotch/pull/1165); confirm
   or revise the page-SVG / raster-thumbnail split before any campaign call.
2. Integrate the circle pen and owl pen/chalk keepers as a minimal runtime slice, including
   manifest, responsive-tier, cache migration, PWA/native packaging, and export behavior; verify
   transferred bytes on a deploy.
3. Run physical-iPad selection, light/dark theme, Magic reveal, rotation, offline reload, and export
   gates. If green, query the balance, state the exact 189-credit remaining cost, and batch with an
   offline fidelity/size acceptance gate after every result.

## Reread first

* [`tools/vectorize/pilot/README.md`](../../tools/vectorize/pilot/README.md)
* [`tools/vectorize/README.md`](../../tools/vectorize/README.md)
* [`web/src/lib/state/books.ts`](../../web/src/lib/state/books.ts)
* [`web/src/lib/coloringPacks/`](../../web/src/lib/coloringPacks/)
* [`docs/adrs/0091-alpha-overlays-and-worker-magic-sheets.md`](../adrs/0091-alpha-overlays-and-worker-magic-sheets.md)
* [`docs/adrs/0103-progressive-coloring-book-packs.md`](../adrs/0103-progressive-coloring-book-packs.md)
* The `vectorize-image`, `architecture`, `adrs`, `mobile`, `profiling`, and `resume-handoff` skills
