# ADR-0054: Uniform Dot-Separated Variant Suffixes for Coloring Assets (`{name}.{variant}.webp`)

**Status:** Active
**Date:** 2026-07

## Context

Every coloring page ships as a family of derived images, and the family had
grown one naming convention at a time: the line art was the bare name
(`cat-tall.webp`), the picker thumbnail was dash-suffixed (`cat-tall-thumb.webp`,
ADR-0045), and the magic-brush fills were dot-suffixed (`cat-tall.color.webp`
ADR-0043, `cat-tall.night.webp` ADR-0052), with raw fills in `fill-src/` adding
`.raw` (`cat-tall.color.raw.webp`, ADR-0043's build-time punch follow-up). Three
problems:

- **The base asset had no variant marker**, so tooling identified line art by
  *exclusion* (`gen-coloring-thumbs.mjs` filtered out `-thumb`/`.color`/`.night`),
  and globs like `*-{tall,wide}.webp` silently matched more than line art if a
  new variant was ever added. Every new variant meant touching every exclusion
  list.
- **Two separator conventions** (`-thumb` vs `.color`) meant no single rule for
  "strip the variant to get the page name," and the dash collided with the
  dash-separated orientation (`-tall`/`-wide`) in the same filename.
- **`.color` misnamed its role**: it is specifically the *light-theme* fill,
  the counterpart of `.night` — the pair reads as light/night, not color/night.

The alternative of keeping the bare line-art name (renaming only `-thumb` →
`.thumb` and `.color` → `.light`) was considered and rejected: it preserves the
identify-by-exclusion problem, which is the structural flaw.

## Decision

Every shipped coloring asset carries an explicit dot-separated variant suffix —
`{name}.{variant}.webp`, where `{name}` is `cover` or `{page}-{tall,wide}`:

```
web/static/coloring/{book}/{name}.outline.webp   line art (picker + canvas overlay)
web/static/coloring/{book}/{name}.thumb.webp     picker grid thumbnail
web/static/coloring/{book}/{name}.light.webp     light magic-brush fill (fills-only)
web/static/coloring/{book}/{name}.night.webp     dark magic-brush fill (fills-only)
tools/asset-gen/fill-src/{book}/{name}.{light,night}.raw.webp   raw (lined) fills
```

Key implementation points:

- `web/src/lib/state/books.ts` builds all catalog paths; `thumbPath()` swaps
  `.outline.webp` → `.thumb.webp` and is deliberately a **no-op on non-outline
  paths** (only line art has thumbnails).
- The asset-gen generators select line art positively by `.outline.webp`
  (`gen-coloring-thumbs.mjs` `isSource`, the `*-{tall,wide}.outline.webp` globs
  in `gen-coloring-fills.mjs` / `gen-coloring-fills-dark.mjs` /
  `check-coloring-drift.mjs`) — no exclusion lists.
- `lib/punch-fill.mjs` derives the shipped fill path from a raw by stripping
  `.raw`, and the mask path by swapping `.{light,night}` → `.outline`.
- CLI page arguments stay suffix-free (`farm/dog-wide`); each script appends
  `.outline.webp` when resolving them, and the dark generator's review samples
  in `.coloring-samples-dark/` stay bare (`dog-wide.webp`) — the `.night.raw`
  suffix is added at ship time (`night-fills.md`).
- The E2E overlay assertions (`web/tests/flows.spec.ts`) pin the overlay `src`
  to `-{tall,wide}.outline.webp`.

## Consequences

- **+** One rule for every asset: strip the final `.{variant}.webp` to get the
  page name; add a suffix to get a sibling. New variants need no changes to
  exclusion lists — line art is matched positively.
- **+** `light`/`night` name the fills by the theme they serve, matching
  `resolvedTheme()`'s pick in `DrawingCanvas` (ADR-0052).
- **+** Dots carry variants, dashes carry orientation — the two axes can't
  collide in a filename.
- **−** A 392-file rename with no runtime behavior change: history for the
  assets survives only via git rename detection, and any external link to an
  old asset URL (previously shared previews, cached PWA precache entries)
  breaks until the next service-worker update.
- **−** `{name}.outline.webp` is longer than the bare name, and prose in older
  ADRs (0043/0045/0052 — updated in place) now describes the new names with
  their original dates.
