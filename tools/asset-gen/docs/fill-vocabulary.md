# The Magic-Brush Reveal Assets Are "Fills", Not "Twins"

**Decision record** — in force. Originally ADR-0055 in `docs/adrs/`; moved here 2026-07 so the
asset-generation pipeline's decisions live beside the pipeline (the ADR index notes the move).
**Date:** 2026-07

## Context

The pre-colored images the magic brush reveals were called **"twins"** from their inception
(ADR-0043): the app started with light mode only, and when dark mode arrived (ADR-0052) it generated
a night "twin" of each existing light image. The name encoded the feature's *history* — a
counterpart generated from something that came first — rather than what the assets *are*. With both
themes fully shipped, an outline page simply has two colored-in states, light and dark; neither is
derived from the other, so "twin" read as a legacy artifact and carried no meaning for a new
contributor.

Alternatives considered for the replacement term:

* **Keep "twin"** — rejected: the origin story it encodes is no longer how the system works, and the
  word says nothing about the asset's content.
* **"variant"** — rejected: ADR-0054 already uses *variant* as the umbrella term for every dot
  suffix (`.outline`, `.thumb`, `.light`, `.night`), so it cannot also name just the colored pair.
* **"colorway"** — rejected: apt but obscure; not a word contributors reach for.
* **"reveal"** — rejected: names the consumer (the magic brush's reveal interaction, ADR-0043), not
  the asset; a future non-brush consumer would make it wrong.
* **"fill"** — chosen: the codebase already half-used it. The generators were named
  `gen:coloring-fills` / `gen-coloring-fills-dark` from the start, and every doc described the
  shipped assets as "fills-only" (outlines punched to transparency, ADR-0043). The asset literally
  *is* the colored fills for an outline page, which is forward-looking and self-describing.

## Decision

The colored counterpart images are **fills**: the **light fill** (`{name}.light.webp`) and the
**night fill** (`{name}.night.webp`), with raw (lined) sources — **raw fills** — committed under
`tools/asset-gen/fill-src/`. Renamed accordingly, with no runtime behavior change:

* `tools/asset-gen/twin-src/` → `fill-src/` (`TWIN_SRC_DIR` → `FILL_SRC_DIR` in `lib/paths.mjs`);
  `lib/punch-twin.mjs` → `lib/punch-fill.mjs` (`punchTwin` → `punchFill`); `punch-twin-outlines.mjs`
  → `punch-fill-outlines.mjs`; the night runbook `night-twins.md` → `night-fills.md`.
* `web/src/lib/drawing/magicBrush.ts`: `twinImage`/`twinUrl` → `fillImage`/`fillUrl`, and
  `activeSource()`'s `'twin'` tag → `'fill'`.
* Prose/comments across `web/src`, tests, skills, and ADRs 0043/0045/0052/0053/ 0054 updated in
  place (the ADR-0054 precedent for renames).
* **Shipped asset filenames and URLs are unchanged** — the `.light`/`.night` suffix scheme is
  ADR-0054's decision and was not revisited; this ADR renames only the *vocabulary* around the
  assets, so no PWA precache or external-link breakage.

Deliberately untouched: generic-English "twin" (the JSON twin of `/admin`, the simulator twin in
ADR-0020, the keyline twin in `app.css`) and the historical entries in `docs/AUDIT-LOG.md`. The
thumbnail's "twin" wording became "sibling" (`books.ts`, ADR-0045) since a thumbnail is not a fill.

## Consequences

* **+** The name describes the asset's content, not the feature's history; the vocabulary now
  matches the generator names (`gen:coloring-fills`) and the "fills-only" shipping invariant instead
  of fighting them.
* **+** One term family for the whole pipeline: raw fill (lined, committed source of truth) →
  punched shipped fill (fills-only) → revealed by the brush.
* **−** "fill" is overloaded in nearby prose — a fill *asset* vs. a filled *region* vs. canvas
  `fill` operations — so sentences like "anything lighter is a fill and kept" (punch mask docs) need
  the reader to track which sense is meant. Judged acceptable since context disambiguates.
* **−** History references the old name: merged PRs, AUDIT-LOG entries, and git log all say "twin";
  `git log --follow` is needed to trace a raw fill's history across the `fill-src/` rename.
