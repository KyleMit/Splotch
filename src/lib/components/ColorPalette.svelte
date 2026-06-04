<script>
  import {
    PALETTE_COLORS,
    TRIM_ORDER,
    CUSTOM_SWATCH,
    colors,
    selectPaletteColor,
    selectCustomSwatch
  } from '$lib/state/colors.svelte.js';
  import { releaseAllPointers, focusCanvas } from '$lib/drawing/engine.js';
  import { openColorPicker } from '$lib/state/ui.svelte.js';
  import { toolState, selectPen } from '$lib/state/tool.svelte.js';
  import { getRingColor } from '$lib/colorRing.js';
  import Icon from './Icon.svelte';

  let swatchEls = $state({});

  // Track the most recent click so we can fire the confirmation ring animation
  // only on the actual selection (not on every reactivity change).
  let ringAnimateKey = $state(null);

  function ringShadow(color) {
    const ringColor = getRingColor(color);
    return `0 0 0 0.5px white, 0 0 0 4.5px ${ringColor}, 0 4px 8px rgba(0, 0, 0, 0.2)`;
  }

  function gradientRingShadow(color) {
    return `0 0 0 0.5px white, 0 0 0 4.5px ${color}, 0 4px 8px rgba(0, 0, 0, 0.2)`;
  }

  function handleSwatchUp(e, hex) {
    selectPen();
    selectPaletteColor(hex);
    ringAnimateKey = hex + ':' + Date.now();
    releaseAllPointers();
    focusCanvas();
    e.preventDefault();
    e.stopPropagation();
  }

  function handleCustomUp(e) {
    selectPen();
    selectCustomSwatch();
    if (swatchEls[CUSTOM_SWATCH]) {
      const rect = swatchEls[CUSTOM_SWATCH].getBoundingClientRect();
      openColorPicker({
        x: (rect.left + rect.right) / 2,
        y: (rect.top + rect.bottom) / 2
      });
    } else {
      openColorPicker(null);
    }
    releaseAllPointers();
    focusCanvas();
    e.preventDefault();
    e.stopPropagation();
  }

  function handlePaletteDown(e) {
    releaseAllPointers();
    e.preventDefault();
    e.stopPropagation();
  }

  function handlePaletteUp(e) {
    e.stopPropagation();
  }

  function handleSwatchCancel(e) {
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
  onpointerdown={handlePaletteDown}
  onpointerup={handlePaletteUp}
>
  {#each PALETTE_COLORS as { hex, label, bonus } (hex)}
    <button
      class="color-swatch"
      class:bonus
      class:active={!toolState.eraser && colors.activeSwatch === hex}
      class:ring-animate={ringAnimateKey?.startsWith(hex + ':')}
      data-color={hex}
      data-trim-rank={trimRank.get(hex)}
      style="background-color: {hex}; {!toolState.eraser && colors.activeSwatch === hex ? `box-shadow: ${ringShadow(hex)}; --ring-color: ${getRingColor(hex)};` : ''}"
      aria-label={label}
      onpointerup={(e) => handleSwatchUp(e, hex)}
      onpointerdown={handlePaletteDown}
      onpointercancel={handleSwatchCancel}
      bind:this={swatchEls[hex]}
    ></button>
  {/each}

  <button
    class="color-swatch gradient-swatch"
    class:active={!toolState.eraser && colors.activeSwatch === CUSTOM_SWATCH}
    data-color="custom"
    aria-label="Custom Color"
    style={!toolState.eraser && colors.activeSwatch === CUSTOM_SWATCH && colors.customColorSelected ? `box-shadow: ${gradientRingShadow(colors.customColor)};` : ''}
    onpointerup={handleCustomUp}
    onpointerdown={handlePaletteDown}
    onpointercancel={handleSwatchCancel}
    bind:this={swatchEls[CUSTOM_SWATCH]}
  ><Icon name="palette" class="palette-icon" aria-hidden="true" /></button>
</div>

<style>
  .color-palette {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    justify-items: center;
    align-content: center;
    gap: 12px;
    padding: 12px;
    background: white;
    box-shadow: 2px 0 10px rgba(0, 0, 0, 0.1);
    z-index: 1002; /* Above clear-accept-zone (1001) */
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
    transition: all 0.2s ease;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    touch-action: manipulation; /* Prevent iOS gesture delays */
  }

  /* Bonus colors are extras: hidden everywhere by default, revealed only on a
     tall landscape by the min-height rules in the trim section below. */
  .color-swatch.bonus {
    display: none;
  }

  .color-swatch:active {
    transform: scale(0.9);
  }

  .color-swatch.active {
    border-color: white;
    /* Selection Ring is set dynamically via JavaScript to match swatch color */
  }

  /* Selection-confirmation flourish: a ring that expands from the center
     out to the resting selection-ring position. Skipped on the gradient
     swatch (which has its own ::after content). */
  .color-swatch:not(.gradient-swatch)::before {
    content: '';
    position: absolute;
    inset: -4.5px;
    border-radius: 50%;
    border: 4.5px solid var(--ring-color, transparent);
    box-sizing: border-box;
    pointer-events: none;
    opacity: 0;
    transform: scale(0);
  }

  .color-swatch.ring-animate:not(.gradient-swatch)::before {
    animation: swatch-ring-expand 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
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

  /* The custom-color swatch is the artist's palette icon rather than a flat
     color. White fill keeps it reading as a swatch alongside the others. */
  .gradient-swatch {
    background: white !important;
    position: relative;
    border-color: white !important;
  }

  /* Centered absolutely (not via flex) so it survives the display:block/none
     toggling on each swatch. The SVG keeps its aspect ratio. */
  .gradient-swatch :global(.palette-icon) {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 104%;
    height: 104%;
    pointer-events: none;
  }

  /* Landscape prefers a single column (1 bar) and trims swatches one at a time,
     staying single-column as long as no more than two need to go. A single
     column holds N swatches when height ≥ 72·N + 12 (60px swatch + 12px gap,
     24px padding), so:
       • ≥ 588px → all 8 fit
       • ≥ 516px → 7 fit  (rank 0 trimmed)
       • ≥ 444px → 6 fit  (ranks 0–1 trimmed)
     Below 444px a 3rd swatch would have to go, so we fall back to the roomier
     2-column grid (the default layout) — which fits all 8 again, then trims in
     pairs. */
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
     Swatches drop off (and bonus ones appear) as the palette's room changes, in
     TRIM_ORDER priority. data-trim-rank 0–9 maps to that order: ranks 0–2 are the
     bonus colors (Brown, Teal, Pink — hidden by default, revealed only on a tall
     landscape) and ranks 3–9 are the core seven (shown by default, trimmed as
     space shrinks). Where rules cascade (portrait, and the 2-column landscape
     pass), each smaller breakpoint hides one more rank and a smaller viewport
     satisfies every larger max-* threshold at once; the single-column landscape
     rules use bounded min/max ranges instead, since a rank can become visible
     again when the layout switches to two columns. The gradient swatch has no
     trim rank, so it is never hidden.

     PORTRAIT — palette is a full-width row (55px swatches, 8px gaps, 10px side
     padding) plus the always-present gradient. k core swatches + gradient fit
     when width ≥ 63·(k+1) + 12. Bonus colors never appear here (default-hidden,
     and only landscape reveals them). */
  @media (orientation: portrait) and (max-width: 515.98px) { /* rank 3: Red    */
    .color-swatch[data-trim-rank='3'] { display: none; }
  }
  @media (orientation: portrait) and (max-width: 452.98px) { /* rank 4: Orange */
    .color-swatch[data-trim-rank='4'] { display: none; }
  }
  @media (orientation: portrait) and (max-width: 389.98px) { /* rank 5: Green  */
    .color-swatch[data-trim-rank='5'] { display: none; }
  }
  @media (orientation: portrait) and (max-width: 326.98px) { /* rank 6: Yellow */
    .color-swatch[data-trim-rank='6'] { display: none; }
  }
  @media (orientation: portrait) and (max-width: 263.98px) { /* rank 7: Blue   */
    .color-swatch[data-trim-rank='7'] { display: none; }
  }
  @media (orientation: portrait) and (max-width: 200.98px) { /* rank 8: Purple */
    .color-swatch[data-trim-rank='8'] { display: none; }
  }
  @media (orientation: portrait) and (max-width: 137.98px) { /* rank 9: Black  */
    .color-swatch[data-trim-rank='9'] { display: none; }
  }

  /* LANDSCAPE, bonus reveal (1 bar, tall) — bonus colors are default-hidden; show
     them one at a time as extra vertical room opens up. A single column holds N
     swatches at height ≥ 72·N + 12, and the core fills 8 slots at 588px, so the
     9th/10th/11th slots open at 660/732/804px. */
  @media (orientation: landscape) and (min-height: 660px) {
    .color-swatch.bonus[data-trim-rank='2'] { display: block; } /* Pink  */
  }
  @media (orientation: landscape) and (min-height: 732px) {
    .color-swatch.bonus[data-trim-rank='1'] { display: block; } /* Teal  */
  }
  @media (orientation: landscape) and (min-height: 804px) {
    .color-swatch.bonus[data-trim-rank='0'] { display: block; } /* Brown */
  }

  /* LANDSCAPE, single column (1 bar) — trim core swatches one at a time by
     priority. Bounded with min-height: 444px so these never fire in the 2-column
     range below (where Red/Orange are visible again at 300–444px). */
  @media (orientation: landscape) and (min-height: 444px) and (max-height: 587.98px) {
    .color-swatch[data-trim-rank='3'] { display: none; } /* Red:    < 588px → 7 fit */
  }
  @media (orientation: landscape) and (min-height: 444px) and (max-height: 515.98px) {
    .color-swatch[data-trim-rank='4'] { display: none; } /* Orange: < 516px → 6 fit */
  }

  /* LANDSCAPE, two columns (2 bar) — used below 444px tall, where the grid shows
     full rows of two and drops a pair at a time. All thresholds stay under 300px
     (= 4 rows × 72 + 12, where all 8 core first overflow two columns), so they
     never touch the single-column range above. n rows fit at height ≥ 72·n + 12.
     Bonus colors stay hidden here (default-hidden, never revealed below 660px). */
  @media (orientation: landscape) and (max-height: 299.98px) { /* 4→3 rows: Red, Orange */
    .color-swatch[data-trim-rank='3'],
    .color-swatch[data-trim-rank='4'] { display: none; }
  }
  @media (orientation: landscape) and (max-height: 227.98px) { /* 3→2 rows: Green, Yellow */
    .color-swatch[data-trim-rank='5'],
    .color-swatch[data-trim-rank='6'] { display: none; }
  }
  @media (orientation: landscape) and (max-height: 155.98px) { /* 2→1 rows: Blue, Purple */
    .color-swatch[data-trim-rank='7'],
    .color-swatch[data-trim-rank='8'] { display: none; }
  }
  @media (orientation: landscape) and (max-height: 83.98px) {  /* 1→0 rows: Black */
    .color-swatch[data-trim-rank='9'] { display: none; }
  }
</style>
