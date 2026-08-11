<script lang="ts">
  import {
    PALETTE_COLORS,
    TRIM_ORDER,
    CUSTOM_SWATCH,
    colors,
    selectPaletteColor,
    selectCustomSwatch,
    themedSwatchColor,
  } from '$lib/state/colors.svelte';
  import { resolvedTheme } from '$lib/state/appearance.svelte';
  import { releaseAllPointers } from '$lib/drawing/engine';
  import { scribbleGuard, scribbleTap } from '$lib/actions/scribbleGuard';
  import { colorPickerModal } from '$lib/state/ui.svelte';
  import { buttonCenter } from '$lib/state/modal.svelte';
  import { toolState, selectInkBrush } from '$lib/state/tool.svelte';
  import { clearPaletteMeasurement, publishPaletteMeasurement } from '$lib/state/layout.svelte';
  import { getRingColor } from '$lib/colorRing';
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';

  let paletteEl: HTMLDivElement;
  let customSwatchEl: HTMLButtonElement | undefined;

  const dark = $derived(resolvedTheme() === 'dark');

  // The selection ring hides while erasing (no ink is being laid down) and
  // stays visible for every other brush, matching the pre-brush-menu behavior.
  const erasing = $derived(toolState.brush === 'eraser');

  // Publish our rendered size so ActionsPanel can offset past our width in
  // landscape (and the action-button sizing math can clear our height in
  // portrait) without reaching in via querySelector. A ResizeObserver keeps it
  // current as the palette trims swatches at breakpoints.
  onMount(() => {
    const ro = new ResizeObserver(() => {
      const rect = paletteEl.getBoundingClientRect();
      publishPaletteMeasurement(rect.width, rect.height);
    });
    ro.observe(paletteEl);
    return () => {
      ro.disconnect();
      clearPaletteMeasurement();
    };
  });

  // Track the most recent click so we can fire the confirmation ring animation
  // only on the actual selection (not on every reactivity change).
  let ringAnimateHex = $state<string | null>(null);

  // The selected-state gap (border + seam) is surface-colored, not white, so in
  // dark mode it reads as bar background and the colored ring floats around the
  // swatch. Light mode is unchanged (surface is white there).
  function selectionRingShadow(ringColor: string): string {
    return `0 0 0 0.5px var(--surface), 0 0 0 var(--selection-ring-width) ${ringColor}, 0 4px 8px rgba(0, 0, 0, 0.2)`;
  }

  function selectSwatch(hex: string, paint: string) {
    selectInkBrush();
    selectPaletteColor(hex, paint);
    ringAnimateHex = hex;
    releaseAllPointers();
  }

  function selectCustomColor() {
    selectInkBrush();
    selectCustomSwatch();
    colorPickerModal.show(customSwatchEl ? buttonCenter(customSwatchEl) : null);
    releaseAllPointers();
  }

  function handlePaletteDown(e: PointerEvent) {
    releaseAllPointers();
    e.preventDefault();
    e.stopPropagation();
  }

  function handlePaletteUp(e: PointerEvent) {
    e.stopPropagation();
  }

  function handleSwatchCancel(e: PointerEvent) {
    releaseAllPointers();
    e.stopPropagation();
  }

  // Each swatch is tagged with its trim rank (0 = first to be hidden) so the
  // style block can drop swatches by priority at each breakpoint. Hiding is
  // done entirely in CSS media queries — no JS measurement — so the layout is
  // correct on the prerendered first paint with no resize flash. The palette
  // always spans the full relevant viewport dimension (height in landscape,
  // width in portrait), so viewport breakpoints map directly onto its room.
  const trimRank = new Map(TRIM_ORDER.map((hex, i) => [hex, i]));
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="color-palette"
  bind:this={paletteEl}
  use:scribbleGuard
  onpointerdown={handlePaletteDown}
  onpointerup={handlePaletteUp}
>
  {#each PALETTE_COLORS as { hex, label } (hex)}
    {@const shown = themedSwatchColor(hex, dark)}
    {@const ringColor = getRingColor(shown)}
    <button
      class="color-swatch"
      class:active={!erasing && colors.activeSwatch === hex}
      class:ring-animate={ringAnimateHex === hex}
      data-color={hex}
      data-trim-rank={trimRank.get(hex)}
      style="background-color: {shown}; {!erasing && colors.activeSwatch === hex
        ? `box-shadow: ${selectionRingShadow(ringColor)}; --ring-color: ${ringColor};`
        : ''}"
      aria-label={shown === hex ? label : 'White'}
      use:scribbleTap={() => selectSwatch(hex, shown)}
      onpointerdown={handlePaletteDown}
      onpointercancel={handleSwatchCancel}
    ></button>
  {/each}

  <button
    class="color-swatch gradient-swatch"
    class:active={!erasing && colors.activeSwatch === CUSTOM_SWATCH}
    class:ringed={!erasing && colors.activeSwatch === CUSTOM_SWATCH && colors.customColorSelected}
    data-color="custom"
    aria-label="Custom Color"
    style={!erasing && colors.activeSwatch === CUSTOM_SWATCH && colors.customColorSelected
      ? `box-shadow: ${selectionRingShadow(colors.customColor)};`
      : ''}
    use:scribbleTap={selectCustomColor}
    onpointerdown={handlePaletteDown}
    onpointercancel={handleSwatchCancel}
    bind:this={customSwatchEl}
    ><Icon name="more-colors" class="more-colors-icon" aria-hidden="true" /></button
  >
</div>

<style>
  .color-palette {
    --selection-ring-width: 4.5px;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    justify-items: center;
    align-content: center;
    width: var(--palette-landscape-width);
    gap: 12px;
    padding: 12px;
    background: var(--surface);
    box-shadow: 2px 0 10px rgba(0, 0, 0, 0.1);
    z-index: var(--z-palette); /* Above the clear coachmark, the tallest chrome below it */
    flex-shrink: 0;
    position: relative;
    overflow: hidden;
    touch-action: manipulation; /* Prevent iOS gesture delays */
  }

  .color-swatch {
    display: block;
    position: relative;
    width: 60px;
    height: 60px;
    border: 4px solid transparent;
    border-radius: 50%;
    cursor: pointer;
    /* Orientation changes resize every swatch together. Keep those geometry
       changes synchronous so rotation does not schedule sixteen layout
       transitions; only interaction and theme feedback should animate. */
    transition:
      background-color var(--duration-base) ease,
      border-color var(--duration-base) ease,
      box-shadow var(--duration-base) ease,
      transform var(--duration-base) ease;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    touch-action: manipulation; /* Prevent iOS gesture delays */
  }

  .color-swatch:active {
    transform: scale(0.9);
  }

  .color-swatch.active {
    border-color: var(--surface);
    /* Selection Ring is set dynamically via JavaScript to match swatch color */
  }

  /* Selection-confirmation flourish: a ring that expands from the center
     out to the resting selection-ring position. Skipped on the gradient
     swatch (whose confirmation is the picker opening). */
  .color-swatch:not(.gradient-swatch)::before {
    content: '';
    position: absolute;
    inset: calc(-1 * var(--selection-ring-width));
    border-radius: 50%;
    border: var(--selection-ring-width) solid var(--ring-color, transparent);
    box-sizing: border-box;
    pointer-events: none;
    opacity: 0;
    transform: scale(0);
  }

  .color-swatch.ring-animate:not(.gradient-swatch)::before {
    animation: swatch-ring-expand 0.45s var(--ease-pop) forwards;
  }

  @keyframes swatch-ring-expand {
    0% {
      transform: scale(0);
      opacity: 0;
    }
    40% {
      opacity: 1;
    }
    100% {
      transform: scale(1);
      opacity: 0;
    }
  }

  /* The custom-color swatch is a honeycomb of palette-color dots (echoing the
     picker's hexagon swatches) on the bar's own surface color, so it reads as
     "more colors" beside the flat swatches and follows the theme in dark mode. */
  .gradient-swatch {
    --pop-scale: 1.12;
    background: var(--surface);
    position: relative;
  }

  /* Centered absolutely (not via flex) so it survives the display:block/none
     toggling on each swatch. The SVG keeps its aspect ratio. Resting size is
     the content box divided by the selection pop, so the popped cluster lands
     exactly on the content box — the same circle an active swatch's disc fills
     inside the Selection Ring — giving the ringed hexagon the same width of
     white band as a ringed round swatch (issue #310). */
  .gradient-swatch :global(.more-colors-icon) {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: calc(100% / var(--pop-scale));
    height: calc(100% / var(--pop-scale));
    pointer-events: none;
    transition: transform 150ms ease-out;
  }

  /* Selection pop: the hexagon cluster scales toward the ring. Keyed on .ringed
     (ring visible), not .active — tapping the swatch arms it before a color is
     picked, and the cluster shouldn't pop ringless. Popped it spans exactly the
     content box (52px at 60px), well inside the button, so nothing clips
     against the palette's overflow: hidden. */
  .gradient-swatch.ringed :global(.more-colors-icon) {
    transform: translate(-50%, -50%) scale(var(--pop-scale));
  }

  /* Landscape prefers a single column (1 bar): the narrow bar leaves the most
     canvas, and it trims swatches one at a time as the viewport shortens. A
     single column holds N swatches when height ≥ 72·N + 12 (60px swatch + 12px
     gap, 24px padding); below the floor in design/trimGeometry.ts it would be
     down to a handful, so the layout falls back to the roomier 2-column grid
     (the default here), which fits rows of two and trims in pairs. That module
     is the executable form of this formula, pinned by trimGeometry.test.ts. */
  @media (orientation: landscape) and (min-height: 444px) {
    .color-palette {
      grid-template-columns: 1fr;
    }
  }

  @media (orientation: portrait) {
    .color-palette {
      display: flex;
      flex-direction: row;
      justify-content: center;
      width: 100%;
      height: auto;
      padding: 10px;
      gap: 8px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
      overflow-x: hidden;
      overflow-y: visible;
      flex-wrap: nowrap;
    }

    .color-swatch {
      width: 55px;
      height: 55px;
      flex-shrink: 0;
    }
  }

  /* ── Trim-by-priority ──────────────────────────────────────────────────────
     Every swatch carries its data-trim-rank — its place in palette.ts's
     TRIM_ORDER, 0 being the first to go. All of them render by default and each
     rule below hides the next rank as the palette's room shrinks, so a viewport
     shows as many swatches as fit at full size: the touch target never shrinks
     to make room for a color. The gradient swatch has no rank and is never
     hidden.

     The ladders cascade — a smaller viewport satisfies every larger max-*
     threshold at once — and each layout owns its own, because the same viewport
     holds a different number of swatches depending on which one it is in. The
     single-column rules carry the layout switch as a min-height floor so they
     can't fire in the two-column range, where more swatches fit again.

     Every threshold is derived arithmetically; design/trimGeometry.ts is the
     executable form of all three ladders, and trimGeometry.test.ts parses this
     whole style block back out — swatch sizes and gaps as well as the thresholds
     and the ranks each rule hides — and asserts the module still produces
     exactly these values.

     PORTRAIT — the palette is a full-width row of 55px swatches with 8px gaps
     inside 10px side padding, so N of them fit at width ≥ 63·N + 12 (the
     gradient swatch takes one of those slots). */
  @media (orientation: portrait) and (max-width: 1019.98px) {
    .color-swatch[data-trim-rank='0'] {
      display: none;
    }
  }
  @media (orientation: portrait) and (max-width: 956.98px) {
    .color-swatch[data-trim-rank='1'] {
      display: none;
    }
  }
  @media (orientation: portrait) and (max-width: 893.98px) {
    .color-swatch[data-trim-rank='2'] {
      display: none;
    }
  }
  @media (orientation: portrait) and (max-width: 830.98px) {
    .color-swatch[data-trim-rank='3'] {
      display: none;
    }
  }
  @media (orientation: portrait) and (max-width: 767.98px) {
    .color-swatch[data-trim-rank='4'] {
      display: none;
    }
  }
  @media (orientation: portrait) and (max-width: 704.98px) {
    .color-swatch[data-trim-rank='5'] {
      display: none;
    }
  }
  @media (orientation: portrait) and (max-width: 641.98px) {
    .color-swatch[data-trim-rank='6'] {
      display: none;
    }
  }
  @media (orientation: portrait) and (max-width: 578.98px) {
    .color-swatch[data-trim-rank='7'] {
      display: none;
    }
  }
  @media (orientation: portrait) and (max-width: 515.98px) {
    .color-swatch[data-trim-rank='8'] {
      display: none;
    }
  }
  @media (orientation: portrait) and (max-width: 452.98px) {
    .color-swatch[data-trim-rank='9'] {
      display: none;
    }
  }
  @media (orientation: portrait) and (max-width: 389.98px) {
    .color-swatch[data-trim-rank='10'] {
      display: none;
    }
  }
  @media (orientation: portrait) and (max-width: 326.98px) {
    .color-swatch[data-trim-rank='11'] {
      display: none;
    }
  }
  @media (orientation: portrait) and (max-width: 263.98px) {
    .color-swatch[data-trim-rank='12'] {
      display: none;
    }
  }
  @media (orientation: portrait) and (max-width: 200.98px) {
    .color-swatch[data-trim-rank='13'] {
      display: none;
    }
  }
  @media (orientation: portrait) and (max-width: 137.98px) {
    .color-swatch[data-trim-rank='14'] {
      display: none;
    }
  }

  /* LANDSCAPE, single column (1 bar) — 60px swatches, 12px gaps, 12px side
     padding: N fit at height ≥ 72·N + 12. Floored at the layout switch. */
  @media (orientation: landscape) and (min-height: 444px) and (max-height: 1163.98px) {
    .color-swatch[data-trim-rank='0'] {
      display: none;
    }
  }
  @media (orientation: landscape) and (min-height: 444px) and (max-height: 1091.98px) {
    .color-swatch[data-trim-rank='1'] {
      display: none;
    }
  }
  @media (orientation: landscape) and (min-height: 444px) and (max-height: 1019.98px) {
    .color-swatch[data-trim-rank='2'] {
      display: none;
    }
  }
  @media (orientation: landscape) and (min-height: 444px) and (max-height: 947.98px) {
    .color-swatch[data-trim-rank='3'] {
      display: none;
    }
  }
  @media (orientation: landscape) and (min-height: 444px) and (max-height: 875.98px) {
    .color-swatch[data-trim-rank='4'] {
      display: none;
    }
  }
  @media (orientation: landscape) and (min-height: 444px) and (max-height: 803.98px) {
    .color-swatch[data-trim-rank='5'] {
      display: none;
    }
  }
  @media (orientation: landscape) and (min-height: 444px) and (max-height: 731.98px) {
    .color-swatch[data-trim-rank='6'] {
      display: none;
    }
  }
  @media (orientation: landscape) and (min-height: 444px) and (max-height: 659.98px) {
    .color-swatch[data-trim-rank='7'] {
      display: none;
    }
  }
  @media (orientation: landscape) and (min-height: 444px) and (max-height: 587.98px) {
    .color-swatch[data-trim-rank='8'] {
      display: none;
    }
  }
  @media (orientation: landscape) and (min-height: 444px) and (max-height: 515.98px) {
    .color-swatch[data-trim-rank='9'] {
      display: none;
    }
  }

  /* LANDSCAPE, two columns (2 bar) — the fallback below that floor, where full
     rows of two fit and swatches leave in pairs. n rows fit at height ≥ 72·n +
     12, and the first rule is the switch itself: the grid holds fewer swatches
     than the single column above it did, so that step drops several at once. */
  @media (orientation: landscape) and (max-height: 443.98px) {
    .color-swatch[data-trim-rank='0'],
    .color-swatch[data-trim-rank='1'],
    .color-swatch[data-trim-rank='2'],
    .color-swatch[data-trim-rank='3'],
    .color-swatch[data-trim-rank='4'],
    .color-swatch[data-trim-rank='5'] {
      display: none;
    }
  }
  @media (orientation: landscape) and (max-height: 371.98px) {
    .color-swatch[data-trim-rank='6'],
    .color-swatch[data-trim-rank='7'] {
      display: none;
    }
  }
  @media (orientation: landscape) and (max-height: 299.98px) {
    .color-swatch[data-trim-rank='8'],
    .color-swatch[data-trim-rank='9'] {
      display: none;
    }
  }
  @media (orientation: landscape) and (max-height: 227.98px) {
    .color-swatch[data-trim-rank='10'],
    .color-swatch[data-trim-rank='11'] {
      display: none;
    }
  }
  @media (orientation: landscape) and (max-height: 155.98px) {
    .color-swatch[data-trim-rank='12'],
    .color-swatch[data-trim-rank='13'] {
      display: none;
    }
  }
  @media (orientation: landscape) and (max-height: 83.98px) {
    .color-swatch[data-trim-rank='14'] {
      display: none;
    }
  }
</style>
