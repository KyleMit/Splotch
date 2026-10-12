# ADR-0152: Keep Full Coloring Art Vector; Present Selectors as Responsive Rasters

**Status:** Active — amends [ADR-0045](0045-coloring-picker-thumbnails-and-prefetch.md) and
[ADR-0129](0129-invariant-svg-overlays-in-coloring-packs.md)

**Date:** 2026-08

## Context

ADR-0129 made the light and dark page SVGs canonical, resolution-independent coloring art. Its first
runtime used those same SVGs in the full paper, six-page picker grid, and Active-page chip. That
minimized the asset inventory, but it asked WebKit to repeatedly rasterize several vector trees
while a modal was opening, scrolling, selecting, or clearing. The deployment-target performance
campaign traced picker scrolling and teardown stalls to those selector surfaces.

A later amendment separated canonical authority from runtime presentation by generating one 400 px
selector WebP plus full-size and 1,152 px canvas-presentation WebPs. Selector rasterization fixed
the small-surface cost, but the canvas derivatives recreated the duplication the vector campaign had
retired: 384 full/compact files totaling 15,086,982 bytes. The paper does not need to trade away its
resolution-independent SVG to make a 36 px chip or a picker tile cheap.

We measured WebP, AVIF, and indexed PNG encodings over all 192 theme/orientation page variants at
96, 240, and 400 px maximum edges. Alpha and premultiplied-color error were measured against a
deterministic Resvg render; Sharp decode time is a local native-decoder proxy, not a browser timing
claim.

| Tier | Encoding            | Catalog bytes | Alpha error | Worst binary-ink IoU | Decode proxy |
| ---- | ------------------- | ------------: | ----------: | -------------------: | -----------: |
| 96   | lossless WebP       |       238,610 |        0.00 |               1.0000 |     105.1 ms |
| 96   | WebP q30 / alpha 50 |       280,012 |        1.63 |               0.3269 |            — |
| 96   | AVIF q30            |       307,071 |        2.61 |               0.4000 |     157.4 ms |
| 96   | indexed PNG, 32     |       265,492 |        0.09 |               0.8583 |      71.1 ms |
| 240  | lossless WebP       |       938,440 |        0.00 |               1.0000 |     171.6 ms |
| 240  | WebP q30 / alpha 50 |     1,224,400 |        1.63 |               0.3269 |            — |
| 240  | AVIF q30            |     1,017,882 |        2.61 |               0.4000 |     404.7 ms |
| 240  | indexed PNG, 32     |       930,016 |        0.36 |               0.8343 |     137.4 ms |
| 400  | lossless WebP       |     1,890,960 |        0.00 |               1.0000 |     262.5 ms |
| 400  | WebP q30 / alpha 50 |     2,571,658 |        1.63 |               0.3269 |            — |
| 400  | AVIF q30            |     1,899,300 |        2.61 |               0.4000 |     730.6 ms |
| 400  | indexed PNG, 32     |     1,819,179 |        0.27 |               0.8887 |     246.9 ms |

Lossy encoding is counterproductive for sparse transparent line art: its prediction metadata and
alpha quantization make the q30 WebPs larger than lossless at every tier. Indexed PNG saves only
53,323 bytes across the complete three-tier catalog while damaging thin alpha edges. AVIF is not a
size win at these dimensions and has the slowest decode proxy.

## Decision

The canonical theme- and orientation-matched SVG is the only full-page line art on web and native.
It remains the presentation source, Magic registration authority, and screenshot-export source.
Canvas-presentation WebPs and their compact siblings are retired.

The page picker and Active-page chip use deterministic, alpha-preserving lossless WebP selectors.
Each selector publishes a width-descriptor `srcset` with two maximum-edge tiers:

* 240 px — 160w portrait / 240w landscape, used by narrow DPR-1 picker tiles and covers; and
* 400 px — 267w portrait / 400w landscape, the canonical fallback for large/high-density tiles and
  native packs.

Measured Chromium selection is intentionally narrower than the tier name suggests: a roughly 152 CSS
px phone tile selects 240 px at DPR 1, while the same tile at DPR 2/3, a roughly 217 CSS px tablet
tile at DPR 2, and a roughly 418 CSS px desktop tile select 400 px.

The page grid publishes orientation-specific `sizes` derived from its two/three-column portrait and
two-column landscape layouts. The Active-page chip publishes `36px`. Web browsers choose among the
two candidates. Capacitor omits `srcset` and uses the installed 400 px selector because hosted
responsive URLs are not valid inside an installed pack.

The 240 px candidate is a web-responsive distribution file, not an additional logical pack member
and not separately precached. The measured 96 px candidate is not shipped: the picker always selects
at least the 240 px candidate before the Active-page chip can mount, and browsers may reuse that
cached response instead of fetching a smaller candidate. The 400 px selector remains the single pack
path in compact and full variants. Every selector is rendered directly from the canonical SVG with
pinned Resvg settings and encoded as lossless/exact WebP; the catalog gate decodes every generated
file and requires pixel equality with a fresh canonical render at the same dimensions.

## Consequences

* \+ Full-page art stays crisp at every zoom and density, and one SVG remains the presentation,
  drawing-registration, export, and integrity authority.
* \+ The picker and Active-page chip avoid repeatedly rasterizing full vector trees and transfer
  only the candidate appropriate to their rendered size.
* \+ Removing 15,086,982 bytes of canvas derivatives and adding 938,440 bytes of responsive selector
  candidates reduces the committed runtime catalog by 14,148,542 bytes.
* \+ Web and native packs return to the same 74-file logical inventory per book.
* − The web paper again pays the browser's full-page SVG rasterization cost when a page is selected,
  rotated, or theme-swapped. Those actions remain physical-device performance gates; a future
  optimization must preserve the canonical SVG contract rather than reintroduce unbounded canvas
  raster tiers.
* − Web distribution carries two selector files per theme/orientation instead of one, and the PWA
  fallback must understand the responsive tier root.

## Amendment 2026-09-02: raster presentation tiers measured and rejected

The consequence above — the web paper pays WebKit's full-page SVG raster on select, rotation, and
theme swap — was tested as a product change on the physical iPad (PR 1553, kept as the record):
lossless WebP presentation tiers of every page SVG at whole-number 3:2 scales (max edges 1152, 1536,
2304, 3072 px; 768 files, 44.7 MB) served through the paper's `srcset`, with the SVG kept as export
and Magic authority. Concurrent A/B against `origin/main`, canonical full action sweeps, same rig
and night: no scored frame moved in portrait (`select coloring page` 21 / 23 vs 21 / 22 ms) or
landscape (26 / 28 vs 26 / 91), and select readiness P95 rose 131 → 229 / 235 ms because the tier
decodes before the ready-gated swap. On the 12.9" iPad the 3072-wide tier's first paint costs the
same order (24–91 ms) as the SVG raster it replaces (21–28 ms at 2732 px), and the matrix's 76–88 ms
`clear coloring page` red the layer had targeted had already been fixed on `main` by
39f75bf0928bfecba1aafae9cbf89d159ebd4029 (the picker retires before the page clears). The canonical
SVG therefore remains the only paper presentation on every platform; the two appearance questions
that could reopen this (a smaller top tier, decode on picker press) are issue #1562.
