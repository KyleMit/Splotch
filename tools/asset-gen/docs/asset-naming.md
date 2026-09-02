# Uniform Dot-Separated Variant Suffixes for Coloring Assets (`{name}.{variant}.webp`)

**Decision record** — in force. Originally ADR-0054 in `docs/adrs/`; moved here 2026-07 so the
asset-generation pipeline's decisions live beside the pipeline (the ADR index notes the move).
**Date:** 2026-07

> **Amendment (2026-08):** ADR-0129 makes invariant `.overlay.svg` and `.dark.overlay.svg` files
> canonical for page and cover line art. Cover thumbnails remain raster derivatives.

## Context

Every coloring page ships as a family of derived images, and the family had grown one naming
convention at a time: the line art was the bare name (`cat-tall.webp`), the picker thumbnail was
dash-suffixed (`cat-tall-thumb.webp`, ADR-0045), and the magic-brush fills were dot-suffixed
(`cat-tall.color.webp` ADR-0043, `cat-tall.night.webp` ADR-0052), with raw fills in `fill-src/`
adding `.raw` (`cat-tall.color.raw.webp`, ADR-0043's build-time punch follow-up). Three problems:

* **The base asset had no variant marker**, so tooling identified line art by *exclusion*
  (`gen-thumbnails.mjs` filtered out `-thumb`/`.color`/`.night`), and globs like
  `*-{tall,wide}.webp` silently matched more than line art if a new variant was ever added. Every
  new variant meant touching every exclusion list.
* **Two separator conventions** (`-thumb` vs `.color`) meant no single rule for "strip the variant
  to get the page name," and the dash collided with the dash-separated orientation (`-tall`/`-wide`)
  in the same filename.
* **`.color` misnamed its role**: it is specifically the *light-theme* fill, the counterpart of
  `.night` — the pair reads as light/night, not color/night.

The alternative of keeping the bare line-art name (renaming only `-thumb` → `.thumb` and `.color` →
`.light`) was considered and rejected: it preserves the identify-by-exclusion problem, which is the
structural flaw.

## Decision

Every shipped coloring asset carries an explicit dot-separated variant suffix —
`{name}.{variant}.webp`, where `{name}` is `cover` or `{page}-{tall,wide}`:

```
web/static/coloring/{book}/{page}.overlay.svg   canonical transparent black page pen
web/static/coloring/{book}/{page}.dark.overlay.svg  canonical transparent white page chalk
web/static/coloring/{book}/cover.overlay.svg    canonical transparent black cover pen
web/static/coloring/{book}/cover.dark.overlay.svg  canonical transparent white cover chalk
web/static/coloring/{book}/cover.thumb.webp     picker cover thumbnail (light)
web/static/coloring/{book}/cover.chalk.thumb.webp  picker cover thumbnail (dark)
web/static/coloring/{book}/{name}.light.webp     light magic-brush fill (fills-only)
web/static/coloring/{book}/{name}.night.webp     dark magic-brush fill (fills-only)
web/static/coloring/{book}/{page}.selector.webp  400 px page selector fallback (light)
web/static/coloring/{book}/{page}.dark.selector.webp  400 px page selector fallback (dark)
tools/asset-gen/fill-src/{book}/{name}.{light,night}.raw.webp   raw (lined) fills
vectorized/coloring-{,dark-}overlays/{stem}.source.webp        uncommitted trace source
```

Resolution is a separate axis and therefore lives in a directory prefix, never another filename
suffix:

```
web/static/coloring/{book}/{name}.{variant}.webp                 canonical raster asset
web/static/coloring/{book}/{name}.{overlay-role}.svg             invariant line-art overlay
web/static/coloring/max-1152px/{book}/{name}.{variant}.webp      web fill candidate
web/static/coloring/max-240px/{book}/{name}.{variant}.webp       web picker candidate
web/static/coloring/max-{edge}px/{book}/{page}.{dark.}presentation.webp   web paper candidate (edge 1152, 1536, 2304, 3072)
```

`max-{edge}px` names the longest-edge bound, not the HTML `srcset` width descriptor. A portrait
`max-1152px` image is 768 pixels wide and is advertised as `768w`; the landscape sibling is 1152
pixels wide and is advertised as `1152w`. The catalog owns both paths and descriptor widths, and an
asset-pipeline test reads every committed file's metadata so the declarations cannot drift.

The invariant full-page SVG overlays stay canonical, and the web paper presents them through
`presentation.webp` tiers: lossless, alpha-exact Resvg renders at max edges 1152, 1536, 2304, and
3072 px — every one a whole-number 3:2 (wide) or 2:3 (tall) scale of the 1536×1024 viewBox, so a
tier registers against the SVG and the 1152×768 fills exactly. The paper's `srcset` lists the four
tiers and closes with the SVG itself, so a paper wider than the top tier keeps vector art. Each tier
is bound to the digest of the SVG it was rendered from in `golden/presentation-sources.json`, which
the catalog test checks so a re-trace cannot leave a stale raster. Raster fills, picker cover
thumbnails, and page selectors retain their responsive tiers. Native stays canonical: `build:cap`
removes every `max-{edge}px` directory because installed packs contain the 400 px selector fallback
and no hosted responsive URLs, and the Capacitor paper presents the SVG.

The earlier `max-1152px` overlay derivative was retired as a *compression* tier (a lossy downscale
under alpha-quantization limits); the presentation tiers are lossless renders that trade bytes for
WebKit's synchronous SVG raster time and are exempt from the compression savings rule.

Page selectors use a `max-240px` candidate for ordinary picker tiles and the Active-page chip, plus
the canonical 400 px selector for large or high-density tiles. A measured 96 px tier was removed
because the page grid always selected a larger candidate before the chip mounted, making the tier
unreachable in real sessions. Cover thumbnails use the 240/400 px pair. All page selector candidates
are lossless/exact WebPs rendered directly from the canonical SVG: catalog-wide measurement found
that lossy WebP and AVIF were larger for this sparse transparent line art, while indexed PNG damaged
thin alpha edges (ADR-0152).

Key implementation points:

* `web/src/lib/state/books.ts` builds all catalog paths and derives the light/dark cover-thumbnail
  and selector siblings. Page tiles and the Active-page chip publish responsive selector sources;
  the canvas uses `pageOverlayImage()` directly.
* `responsiveColoringAssets()` derives web-only tier paths for raster fills and cover thumbnails;
  `responsiveSelectorColoringAssets()` derives the smaller selector tier. Invariant SVG page
  overlays have no responsive candidate. `bookAssetPaths()` includes every runtime path so
  `check:coloring-assets` rejects a partial inventory.
* `lib/line-art-targets.mjs` positively selects canonical `*-{tall,wide}.overlay.svg` pages and adds
  `cover.overlay.svg` when callers request covers.
* `lib/punch-fill.mjs` derives the shipped fill path from a raw by stripping `.raw`; light and night
  mask against the canonical light or dark SVG alpha.
* CLI page arguments stay suffix-free (`farm/dog-wide`); each script resolves the canonical SVG, and
  the dark generator's review samples in `.coloring-samples-dark/` stay bare (`dog-wide.webp`) — the
  `.night.raw` suffix is added at ship time (the night-fill runbook, now
  `../legacy/night-fills.md`).
* The E2E overlay assertions (`web/tests/flows-coloring-book.spec.ts`) pin the full-page overlay
  `src` to the theme-matched SVG and the selector surface to raster `srcset` candidates.

## Consequences

* **+** Every role is an explicit dot-separated suffix. Multi-part roles such as `.chalk.thumb` and
  `.dark.overlay` remain recognizable without exclusion lists; canonical page line art is matched
  positively by `.overlay.svg`.
* **+** `light`/`night` name the fills by the theme they serve, matching `resolvedTheme()`'s pick in
  `DrawingCanvas` (ADR-0052).
* **+** Dots carry variants, dashes carry orientation — the two axes can't collide in a filename.
* **−** The original 392-file rename had no runtime behavior change: history for the assets survives
  only via git rename detection, and any external link to an old asset URL (previously shared
  previews, cached PWA precache entries) breaks until the next service-worker update.
* **−** Prose in older ADRs (0043/0045/0052 — updated in place) describes the explicit-suffix era
  with its original dates.
