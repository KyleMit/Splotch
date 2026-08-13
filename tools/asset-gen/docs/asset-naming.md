# Uniform Dot-Separated Variant Suffixes for Coloring Assets (`{name}.{variant}.webp`)

**Decision record** — in force. Originally ADR-0054 in `docs/adrs/`; moved here 2026-07 so the
asset-generation pipeline's decisions live beside the pipeline (the ADR index notes the move).
**Date:** 2026-07

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
web/static/coloring/{book}/{name}.outline.webp   PEN line art (light picker + canvas overlay)
web/static/coloring/{book}/{name}.chalk.webp     CHALK line art (dark canvas overlay, ink-on-white)
web/static/coloring/{book}/{name}.thumb.webp     picker grid thumbnail (light, from the pen)
web/static/coloring/{book}/{name}.chalk.thumb.webp  picker grid thumbnail (dark, from the chalk)
web/static/coloring/{book}/{name}.overlay.webp   transparent black page overlay (light runtime)
web/static/coloring/{book}/{name}.dark.overlay.webp  transparent white page overlay (dark runtime)
web/static/coloring/{book}/{name}.light.webp     light magic-brush fill (fills-only)
web/static/coloring/{book}/{name}.night.webp     dark magic-brush fill (fills-only)
tools/asset-gen/fill-src/{book}/{name}.{light,night}.raw.webp   raw (lined) fills
```

Resolution is a separate axis and therefore lives in a directory prefix, never another filename
suffix:

```
web/static/coloring/{book}/{name}.{variant}.webp                 canonical/master asset
web/static/coloring/max-1152px/{book}/{name}.{variant}.webp      web page-overlay candidate
web/static/coloring/max-240px/{book}/{name}.{variant}.webp       web picker-thumbnail candidate
```

`max-{edge}px` names the longest-edge bound, not the HTML `srcset` width descriptor. A portrait
`max-1152px` image is 768 pixels wide and is advertised as `768w`; the landscape sibling is 1152
pixels wide and is advertised as `1152w`. The catalog owns both paths and descriptor widths, and an
asset-pipeline test reads every committed file's metadata so the declarations cannot drift.

Only the DOM-rendered presentation overlays and picker thumbnails have responsive derivatives.
Light/night fills stay canonical because the canvas path caps its render scale and measured no
visible benefit from fill tiering. Native also stays canonical: `build:cap` removes every
`max-{edge}px` directory until downloadable native packs can select a tier (issue #200).

The overlay tier is `max-1152px`, the largest measured downscale where every derivative is smaller
than its source while retaining the overlay pipeline's step-8 alpha quantization and maximum 4/255
composite-channel error. The initially considered 1366px tier was rejected: resampling increased
alpha entropy, 95 of 192 lossless derivatives grew, and the aggregate saved only 1%. At 1152px all
192 shrink and the aggregate overlay saving is about 26%. `gen:coloring-responsive` enforces both
per-file savings and a catalog-level savings floor.

The picker tier is `max-240px`. Its 160px-wide portrait candidate covers the approximately 152 CSS
pixel portrait slot on a 390px-wide DPR 1 viewport; the initially considered `max-200px` tier was
only 134px wide and therefore lost to the 267px canonical candidate in that common layout. The 240px
tier is the smallest round max-edge tier that crosses that selection boundary.

Key implementation points:

* `web/src/lib/state/books.ts` builds all catalog paths; `thumbPath()` swaps `.outline.webp` →
  `.thumb.webp`, `chalkThumbPath()` swaps `.chalk.webp` → `.chalk.thumb.webp`, and each is
  deliberately a **no-op on other paths** (only line art has thumbnails).
* `responsiveColoringAssets()` derives the web-only tier paths from those canonical paths;
  `bookAssetPaths()` includes them so `check:coloring-assets` rejects a partial tier.
* The asset-gen generators select line art positively by suffix (`gen-thumbnails.mjs` `isSource`
  matches `.outline.webp` + `.chalk.webp`; the `*-{tall,wide}.outline.webp` globs in
  `gen-light-fills.mjs` / `gen-night-fills.mjs` / `check-fill-drift.mjs`) — no exclusion lists.
* `lib/punch-fill.mjs` derives the shipped fill path from a raw by stripping `.raw`, and the mask
  path by swapping `.{light,night}` → `.outline`.
* `gen-overlays.mjs` positively selects page `.outline.webp` sources and writes `.overlay.webp` plus
  `.dark.overlay.webp`; the dark derivative uses the `.chalk.webp` sibling where present.
* CLI page arguments stay suffix-free (`farm/dog-wide`); each script appends `.outline.webp` when
  resolving them, and the dark generator's review samples in `.coloring-samples-dark/` stay bare
  (`dog-wide.webp`) — the `.night.raw` suffix is added at ship time (the night-fill runbook, now
  `../legacy/night-fills.md`).
* The E2E overlay assertions (`web/tests/flows-coloring-book.spec.ts`) pin the overlay `src` to
  `-{tall,wide}.outline.webp`.

## Consequences

* **+** Every role is an explicit dot-separated suffix. Multi-part roles such as `.chalk.thumb` and
  `.dark.overlay` remain recognizable without exclusion lists; source line art is matched positively
  by `.outline.webp`.
* **+** `light`/`night` name the fills by the theme they serve, matching `resolvedTheme()`'s pick in
  `DrawingCanvas` (ADR-0052).
* **+** Dots carry variants, dashes carry orientation — the two axes can't collide in a filename.
* **−** A 392-file rename with no runtime behavior change: history for the assets survives only via
  git rename detection, and any external link to an old asset URL (previously shared previews,
  cached PWA precache entries) breaks until the next service-worker update.
* **−** `{name}.outline.webp` is longer than the bare name, and prose in older ADRs (0043/0045/0052
  — updated in place) now describes the new names with their original dates.
