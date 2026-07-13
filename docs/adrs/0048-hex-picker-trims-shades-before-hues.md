# ADR-0048: Hex Color Picker Trims Shades Before Hues, Transposing in Landscape

**Status:** Active
**Date:** 2026-07

## Context

The custom color picker is a 9×9 honeycomb: 9 hue families × 9 shades. Small
viewports can't fit all 81 hexes (touch targets stay 60px for toddler fingers,
so shrinking hexes is off the table). The original implementation trimmed with
CSS media queries: `max-height` rules hid whole *family rows* and `max-width`
rules hid shade columns via `:nth-child`. On landscape phones — a short, wide
viewport — that dropped family after family until the picker offered many
shades of only 2–4 hues, the opposite of what a toddler picking "a color"
wants.

Alternatives considered:

* **Keep one grid, reorder which rows drop** — can't fix landscape: as long as
  families are rows, any height trim removes whole hues.
* **Compute the visible rows in JS** from `svelte:window`'s viewport bindings
  (tried first — a pure `buildPickerRows(vw, vh)` function). It works and only
  renders the hexes that fit, but it mirrors the hex geometry in TS, is blank
  of layout until hydration, and diverges from the project's established
  pattern: `ColorPalette.svelte` deliberately trims via CSS media queries so
  the prerendered first paint is correct with no JS measurement or resize
  flash (ADR-0040 keeps the home route SSG).
* **CSS grid transposition in one DOM** (orientation-swapped
  `grid-row`/`grid-column` per hex) — hiding a shade level would leave an
  empty grid track, so tracks would need per-breakpoint remapping anyway.
* **Shrink hexes under pressure** — violates the 60px toddler touch-target
  floor.

## Decision

Pure CSS, dual grid (`web/src/lib/components/ColorPicker.svelte`;
`web/src/lib/hexPickerLayout.ts` holds the palette data and the two static
arrangements). Three rules:

1. **The constrained axis trims shades, never hues.** Both arrangements are
   rendered: portrait (families as rows) and its transpose for landscape
   (families as columns, shade levels as rows). An `orientation` media query
   displays exactly one, so the short viewport axis always trims shade levels
   and the long axis trims families — and families only start dropping when
   the long axis is genuinely out of room.
2. **Positional spread trimming, shared by both grids.** Rows and hexes carry
   position classes (`r1`–`r9`, `c1`–`c9`), and the drop ladders hide
   positions `2, 4, 6, 8, 3, 7 (, 5)` — never the endpoints — so survivors
   stay evenly spread: a trimmed shade ramp still spans lightest→darkest, a
   trimmed family list still sweeps the rainbow. Because the trimming is
   positional, one set of `max-height`/`max-width` rules serves both grids
   (only one is displayed); orientation queries exist *only* for the grid
   toggle.
3. **Each height step restates the honeycomb offset.** Hidden rows still
   count for `:nth-child`, and spread-trimming hides non-adjacent rows, so an
   `:nth-child(even)` offset would flatten and let hex points collide.
   Instead every `max-height` step re-declares which rows carry the 31px
   offset so it alternates by *visible* position — that's what keeps every
   trimmed layout interlocking instead of jagged.

Thresholds derive from the hex geometry and the dialog's 90vw/90vh cap:
`r` rows fit while `90vh ≥ 51r + 50`, `c` columns while `90vw ≥ 60c + 63`
(the ladder comments in the component show the math). The trim ladders are
pinned by E2E tests (`web/tests/picker-trim.spec.ts`, same pattern as
`palette-trim.spec.ts`), including an offset-alternation walk over every
height rung — that's the coverage for the restatement rules, which are the
easiest thing to break when editing the ladder.

## Consequences

- \+ Landscape phones now show the full rainbow (every family) with a few shades
  each, instead of every shade of a few families.
- \+ Correct on the prerendered first paint, no JS measurement or resize flash —
  consistent with how `ColorPalette.svelte` trims.
- \+ Trimmed layouts are always well-formed honeycombs; the light→dark gradient
  reads top-to-bottom (landscape) or left-to-right (portrait) at every size.
- − Both grids live in the DOM (162 hexes, one grid always `display:none`).
  Harmless today — hidden hexes aren't focusable and the pointer snap logic
  already skips zero-width rects — but anything iterating `.hexagon` must
  tolerate the hidden copy.
- − The offset-restatement blocks are hand-derived from the drop ladder; editing
  the ladder without re-deriving them silently breaks the interlock (the E2E
  offset walk exists to catch exactly this).
- − A geometry change (hex size, padding, overlap) invalidates every threshold;
  the ladder comments carry the formulas to re-derive them.
- − Desktop/landscape users see families as columns while portrait shows them as
  rows — the full grid is the same 81 colors, but its orientation flips with
  the viewport.
