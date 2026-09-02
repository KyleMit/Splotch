# ADR-0152: Keep Full Coloring Art Vector; Present Selectors as Responsive Rasters

**Status:** Active — amends [ADR-0045](0045-coloring-picker-thumbnails-and-prefetch.md) and
[ADR-0129](0129-invariant-svg-overlays-in-coloring-packs.md); amended 2026-09-02 (web paper
presentation tiers)

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

## Amendment 2026-09-02: the web paper presents a whole-number raster tier of the SVG

The consequence this decision accepted — "the web paper again pays the browser's full-page SVG
rasterization cost when a page is selected, rotated, or theme-swapped" — is the remaining
physical-iPad red in the deployment-target matrix: `select coloring page` and `clear coloring page`
measured 76–88 ms post-action P95 on every physical iPad web mode at c80fc3b240a3, and 83 ms on
physical iPad native. Chromium rasterizes an SVG `<img>` off the main thread; WebKit rasterizes it
synchronously on the main thread at the displayed size, so the cost lands inside the frame the child
is watching. Raster cost scales with outline length × linear size, not node count: tripling a page's
path nodes with identical outlines moved a 2732 px raster by ~12%, so simplifying paths was
rejected, as was pre-rasterizing at idle (memory, timing dependence, the first pick still pays).

**Decision.** The paper keeps the canonical SVG as `src`, export authority, and Magic registration
authority, and on web adds a `srcset` of deterministic, lossless, alpha-exact Resvg renders of that
SVG at max edges **1152, 1536, 2304, and 3072 px** (1152/1536/2304/3072 wide, 768/1024/1536/2048
tall) — every tier a whole-number 3:2 or 2:3 scale of the 1536×1024 viewBox, so registration against
the SVG and the 1152×768 fills cannot drift, and 2732 (whose two-thirds is fractional) is
deliberately absent. The SVG itself closes the `srcset` above the ladder so a paper wider than 3072
px keeps vector art rather than an upscaled raster. `sizes` is written in `vmin`/`vmax`
(`min(100vmax, 150vmin)` wide, `min(100vmin, calc(200vmax / 3))` tall) so a rotation with ink —
where the paper locks its art and is only re-presented — never re-selects a candidate, and the same
expressions warm the other orientation's art for a blank-canvas rotation. The decode-gated swap
decodes the browser-selected candidate off-DOM with the same `sizes`/`srcset`, so the paint is a
cache blit.

The tiers are `{page}.{dark.}presentation.webp` under the existing `max-{edge}px/{book}/` resolution
prefix — a name this ADR retired for the earlier lossy compression derivative, revived because the
file is exactly that: the paper's presentation of the canonical art. Unlike the compression tiers, a
presentation tier is larger than its SVG by design and is exempt from the generator's size and
savings rules. Every tier is bound to the SHA-256 of the SVG it was rendered from in
`tools/asset-gen/golden/presentation-sources.json`; the catalog test fails on a re-trace that leaves
a stale raster, regenerates the 1152 tier pixel-for-pixel, and checks the larger tiers by digest.

**Packs.** Web packs carry the tiers under their hosted tier URLs — the paper's `srcset` requests
those URLs and the installed pack serves them from the cache — with the compact variant carrying the
1152 tier and the full variant the whole ladder, since a full device selects a different tier per
orientation (a tablet's tall art in landscape is height-limited to 1536, its wide art in portrait
width-limited to 2304). Tier paths are the one part of a book's inventory that may differ between
variants; the manifest format is version 4. The service worker's responsive route consults the cache
before the network and falls back from a presentation raster to the canonical SVG it was rendered
from.

**Native stays on the canonical SVG in this amendment.** The WKWebView pays the same synchronous
raster, so the physical-iPad native coloring cells stay red, and this is recorded rather than solved
here: installed packs resolve `/coloring/{book}/` paths to a local root and carry no hosted tier
URLs, the pack format's two-resolution axis cannot express a per-device tier, a single fixed tier
would either bloat phones or soften the 12.9" iPad, and the native bundle check rejects presentation
rasters. A native tier needs its own sizing evidence and a pack-resolution decision; it is a
follow-up, not an omission.

**Consequences.**

* \+ The web paper's page select and clear no longer rasterize a vector tree on WebKit's main
  thread; a lossless WebP decodes off it and paints as a blit. Registration is exact by
  construction.
* \+ The canonical SVG remains the only export and Magic authority on every platform.
* − 768 committed files, 44.7 MB (6.1 / 8.3 / 12.8 / 17.5 MB per tier), roughly doubling the
  committed coloring tree; a web full pack grows by about 5.6 MB per book, a compact pack by about
  0.8 MB.
* − Export re-fetches the canonical SVG when the paper displays a raster tier (one request, off the
  frame path); it previously reused the decoded `<img>`.
* − Native keeps the synchronous raster until a native tier decision is made.
