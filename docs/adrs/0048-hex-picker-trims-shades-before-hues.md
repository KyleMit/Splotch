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

* **Keep media queries, reorder which rows drop** — can't fix landscape: as
  long as families are rows, any height trim removes whole hues.
* **CSS-only transposition** (grid placement per hex, orientation-swapped
  `grid-row`/`grid-column`) — hiding a shade level would leave an empty grid
  track, and the honeycomb's interlocking offset needs *visible-index* parity,
  which CSS can't express once arbitrary cells are hidden. `:nth-child(even)`
  counts `display:none` rows, so non-contiguous hiding flattens the offset and
  makes hex points collide.
* **Shrink hexes under pressure** — violates the 60px toddler touch-target
  floor.

## Decision

Layout is computed in JS from the viewport (`web/src/lib/hexPickerLayout.ts`,
pure and unit-tested; `ColorPicker.svelte` renders whatever it returns via
`svelte:window bind:innerWidth/innerHeight`). Three rules:

1. **The constrained axis trims shades, never hues.** In portrait, families
   are rows and a narrow viewport trims shades per row. In landscape the grid
   *transposes* — families become columns, shade levels become rows — so a
   short viewport trims shade rows while every family stays. Families only
   start dropping when the *long* axis runs out too.
2. **Even-spread selection.** When only N of 9 shades (or families) fit, the
   survivors are evenly spaced indices with endpoints kept (5 of 9 → 1st, 3rd,
   5th, 7th, 9th), so a trimmed ramp still spans lightest→darkest and a
   trimmed family list still sweeps rainbow endpoints — no priority lists to
   maintain.
3. **Only visible rows exist in the DOM.** No `display:none` trimming, so the
   `.row:nth-child(even)` honeycomb offset always alternates and no trim
   combination can produce jagged edges or overlapping hex points.

Gotcha: the module hard-codes the hex geometry (60px column pitch, 51px row
pitch, chrome margins, the dialog's 90vw/90vh cap) mirrored from
`ColorPicker.svelte`'s styles — change them together.

## Consequences

+ Landscape phones now show the full rainbow (every family) with a few shades
  each, instead of every shade of a few families.
+ Trimmed layouts are always well-formed honeycombs; the light→dark gradient
  reads top-to-bottom (landscape) or left-to-right (portrait) at every size.
+ Layout logic is a pure function with unit tests (`hexPickerLayout.test.ts`)
  instead of 13 interlocking media queries with hand-computed thresholds.
- Desktop/landscape users see families as columns while portrait shows them as
  rows — the full grid is the same 81 colors, but its orientation flips with
  the viewport.
- Geometry constants are duplicated between the TS module and the component's
  CSS; a size tweak in one without the other overflows or under-fills the
  dialog (the dialog clips overflow, so the failure is silent).
- SSR renders the full grid (no viewport); harmless today because the dialog
  only opens post-hydration.
