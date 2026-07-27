# Every swatch element is captured into `$state`, but only the custom swatch's ref is read

**Priority/category:** P3[performance] · **Cluster:** C10 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/lib/components/ColorPalette.svelte:23, 137, 85` — pinned at SHA
f934d43 **Draft patch:** none

## Verdict

**FIX — clear winner**, but reframed: the performance claim is negligible and should not be the
justification. The cleanup stands on readability — ten dead `bind:this` bindings and a reactive
record that misleads a reader into thinking per-swatch refs matter. Replace the record with a single
plain `let customSwatchEl`, matching the `paletteEl` precedent in the same file.

## Original finding (condensed)

`let swatchEls = $state<Record<string, HTMLButtonElement>>({})` receives a `bind:this` from every
palette button, but the only consumer is `selectCustomColor` reading `swatchEls[CUSTOM_SWATCH]`. All
ten color-swatch refs are stored into a reactive `$state` record nothing reads, causing "needless
proxy writes on mount/trim". Proposed binding only the custom swatch into a single variable.

## Why it was deferred

Verifier unavailable — the burndown recorded no verification brief either way.

## Current state of the code

Still present, shifted a few lines: `web/src/lib/components/ColorPalette.svelte:23` (the `$state`
record), `:133` (per-swatch `bind:this`), `:149` (custom-swatch `bind:this`), `:80` (the sole read,
inside `selectCustomColor`). `rg swatchEls` confirms those four sites are the only uses.

The perf claim does not hold up:

* `PALETTE_COLORS` is a static list and swatch trimming is pure CSS (`display: none` media queries)
  — buttons never mount or unmount at runtime, so there are no "trim" writes at all. The proxy
  receives exactly eleven writes, once, at mount.
* Nothing reads the record in a reactive context — the one read is inside a pointer-event handler —
  so the `$state` proxy never triggers an effect, a derived, or a template invalidation.

Total cost: nanoseconds at mount, zero steady-state. As a performance finding this is invalid. As a
readability finding it is real: the reactive record signals "these refs drive reactivity" when ten
of eleven are dead weight, and `$state` isn't needed even for the live one.

## Options considered

1. **Single plain `let customSwatchEl` (winner).** `paletteEl` at line 22 is already a plain
   (non-`$state`) `bind:this` target in this component, and the ref is only read inside an event
   handler, so no reactivity is required. Smallest diff, removes all dead bindings.
2. **Keep the record but make it non-reactive** (plain object). Fixes the misleading `$state` but
   keeps ten dead bindings and the misleading record shape. Strictly worse than option 1.

## Recommendation

Three-line change, behavior identical:

```svelte
let customSwatchEl: HTMLButtonElement | undefined;
...
colorPicker.show(customSwatchEl ? buttonCenter(customSwatchEl) : null);
```

Delete `bind:this={swatchEls[hex]}` from the palette-button `{#each}` (line 133) and change the
custom swatch's binding (line 149) to `bind:this={customSwatchEl}`. When re-staging, file it as
maintainability/readability, not performance.

Verification: `rg swatchEls` returns nothing; opening the picker still flies in from the custom
swatch's center (`buttonCenter` anchor) — covered by tapping the gradient swatch in the existing
picker E2E flow.

## Suggested next step

Re-stage in `docs/AUDIT.md` reframed as a P4 readability cleanup (or fold into any small palette
touch-up PR).
