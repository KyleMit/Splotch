# ADR-0056: Fork the Line Art per Theme — Pen Outline (Light) + Gemini-Authored Chalk Outline (Dark)

**Status:** Active
**Date:** 2026-07

## Context

ADR-0052 rendered dark-mode coloring pages by blanket-inverting the single
shared outline (`--lineart-filter: invert(1)` + `screen`) — "no pre-generated
inverted assets." That held only while every dark outline pixel was a thin
stroke: a solid black region (a cartoon pupil, a tire) inverted to a **pure
white blob**, and the build-time punch (ADR-0043) deleted the night fill's
correct pixels underneath it. Two generations of fixes attacked the symptom:

- **Canonical-eye retouches** (pre-2026-07): reshape solid pupils so the
  invert *accident* landed well. Eyes-only, fragile, per-page hand work.
- **Thin-stroke normalization** (PR #122): redraw every solid region as thin
  outlines so the blanket invert is correct by construction. It worked, but it
  forced a single outline to serve two masters. Whites the dark render
  genuinely wants solid — an eye's sclera, a catchlight — cannot exist in a
  shared outline without breaking light mode, so the night *fill* had to paint
  them and an ever-growing stack of eye gates had to police it. Reusing one
  outline for both themes was the real constraint.

Alternatives evaluated for dark mode (chronicled with illustrations in
`tools/asset-gen/pipeline.md`): a build-time morphological classifier that
preserves solid interiors (can only *keep* what the pen contains — it can
never decide a thin-ringed sclera should go solid); the same classifier at
runtime (main-thread cost ADR-0043 exists to avoid); and fully independent
AI-generated night line art (registration drift — the ghosting class ADR-0043
prevents).

## Decision

Fork the line work per theme, with the dark variant *derived from* the light
one under registration gates:

- **Pen outline** (`{page}.outline.webp`) — black ink on white. The light-mode
  overlay and the source of every derivation (thumbs, light fills, chalk).
- **Chalk outline** (`{page}.chalk.webp`) — the dark-mode line art:
  `tools/asset-gen/gen-coloring-chalk.mjs` has Gemini redraw the inverted pen
  as a chalk drawing, making the judgment calls a blind invert can't — eye
  sclera and catchlights become deliberate SOLID WHITE, pupils stay black.
  Gates: every pen stroke still traced (`lib/outline-match.mjs` keep ≥ 92%,
  worst tile ≥ 80%), new ink only inside pen-enclosed interiors (judged by
  enclosure, not thickness — a sclera is a thin annulus), and a white-area
  budget. This is the "dedicated night line art" option *domesticated*: an
  edit, not a fresh generation, so registration is provable.
- **Storage polarity:** the chalk ships **ink-on-white** (the negation of what
  dark mode displays). The app's existing dark treatment (`invert(1)` +
  `screen`) renders it unchanged — `DrawingCanvas.svelte` just swaps the
  overlay `src` to `chalkUrl` in dark mode — every ink-on-white analysis tool
  (outline-match, punch, audits) reads chalks unmodified, and lossy webp
  without an alpha plane is smaller than a transparent line layer (and avoids
  the sharp alpha-flattening gotcha).
- **The punch is per-theme** (`lib/punch-fill.mjs`): light raws punch against
  the pen, night raws against the chalk. Because `screen` with white is white,
  the chalk's solid whites always survive into the final combined image — the
  punch and renderer stay dumb; all judgment lives in the chalk.
- **Night fills condition on the chalk** (`gen-coloring-fills-dark.mjs`): the
  model input is the chalk as-displayed, and the eye gate judges the simulated
  final composite (chalk-punched fill + screened chalk over dark paper), since
  the chalk now owns the eye whites.
- **Incremental migration:** `books.ts` lists chalk orientations per page
  (like `night`); absent a chalk, dark mode falls back to inverting the pen —
  the pre-fork behavior, byte-identical light mode throughout.

Nature (12 cells) is the pilot. Consequent loosening: pen thin-stroke
normalization (PR #122's machinery) is now a *light-theme quality* call — a
solid pen pupil no longer breaks dark mode, because the chalk redraw makes its
own judgment from whatever pen it gets.

## Consequences

- \+ Dark-mode whites are correct **by authorship**: what should be white at
  night is decided once, at generation time, by an editor with judgment —
  not reconstructed per-fill by prompts and policed by eye gates.
- \+ The renderer and punch stay trivially dumb (ADR-0043/0052 style); the
  only app change is a themed `src` swap with a safe fallback.
- \+ Night-fill generation gets easier, not harder: the model no longer has
  to nail three-tone eyes — the chalk carries the whites, the fill paints a
  pupil.
- \+ Un-migrated categories keep working unchanged (pen-invert fallback), so
  the fork rolls out category by category behind human review.
- \- One more shipped asset per page-orientation (~60–90 KB each, ~0.9 MB per
  fully-migrated 6-page book) on web and native installs.
- \- A page edit now fans out further: a pen change invalidates the chalk too
  (chalk → night fill → punch), and the chalk is a second Gemini artifact to
  review per cell.
- \- The chalk's whites are final — a night fill cannot overrule them (the
  punch wins). A wrong judgment call (the ladybug's first take whitened its
  canonically-black shell spots) is caught only by human review; page `--notes`
  at low temperature is the documented fix.
- \- Supersedes ADR-0052's "no pre-generated inverted assets" clause for
  coloring pages, and demotes parts of PR #122's thin-stroke rationale from
  correctness requirement to aesthetic preference; both docs now point here.
