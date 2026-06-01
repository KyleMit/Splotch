<script>
  import { onMount } from 'svelte';
  import {
    PALETTE_COLORS,
    CUSTOM_SWATCH,
    colors,
    selectPaletteColor,
    selectCustomSwatch
  } from '$lib/state/colors.svelte.js';
  import { releaseAllPointers, focusCanvas } from '$lib/drawing/engine.js';
  import { openColorPicker } from '$lib/state/ui.svelte.js';
  import { toolState, selectPen } from '$lib/state/tool.svelte.js';
  import Icon from './Icon.svelte';

  let paletteEl;
  let swatchEls = $state({});

  // Track the most recent click so we can fire the confirmation ring animation
  // only on the actual selection (not on every reactivity change).
  let ringAnimateKey = $state(null);

  // Compute a ring color ~10% darker than the swatch — or lighter for very dark
  // swatches like black — so the selection ring contrasts with the swatch fill.
  function getRingColor(color) {
    let hex = color.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);

    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const shift = luminance < 0.2
      ? (v) => Math.min(255, Math.round(v + 38))
      : (v) => Math.max(0, Math.round(v * 0.9));

    const toHex = (v) => v.toString(16).padStart(2, '0');
    return `#${toHex(shift(r))}${toHex(shift(g))}${toHex(shift(b))}`;
  }

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

  // Visible-buttons calc — hide swatches that don't fit in the available space.
  // The 1-vs-2 column choice itself is handled by CSS media queries (see the
  // <style> block) so it's correct on the prerendered first paint; JS here only
  // decides how many swatches to show.
  let portrait = $state(false);
  let visibleCount = $state(PALETTE_COLORS.length + 1);

  function updateLayout() {
    if (!paletteEl) return;
    const isPortrait = window.matchMedia('(orientation: portrait)').matches;
    portrait = isPortrait;
    const rect = paletteEl.getBoundingClientRect();

    if (isPortrait) {
      const padding = 10;
      const gap = 8;
      const buttonSize = 55;
      const availableWidth = rect.width - padding * 2;
      const gradientWidth = buttonSize + gap;
      const availableWithoutGradient = availableWidth - gradientWidth;

      let currentWidth = 0;
      let count = 0;
      for (let i = 0; i < PALETTE_COLORS.length; i++) {
        const btnWidth = buttonSize + (i > 0 ? gap : 0);
        if (currentWidth + btnWidth <= availableWithoutGradient) {
          currentWidth += btnWidth;
          count++;
        } else break;
      }
      visibleCount = count + 1; // +1 for gradient
    } else {
      const padding = 12;
      const gap = 12;
      const buttonSize = 60;
      const availableHeight = rect.height - padding * 2;
      const total = PALETTE_COLORS.length + 1;
      const heightFor1Col = buttonSize * total + gap * (total - 1);

      if (heightFor1Col <= availableHeight) {
        // Single column (matches the CSS min-height media query) — all fit.
        visibleCount = total;
      } else {
        // Two columns — show only as many full rows of 2 as fit.
        const numRows = Math.floor((availableHeight + gap) / (buttonSize + gap));
        visibleCount = Math.min(numRows * 2, total);
      }
    }
  }

  onMount(() => {
    updateLayout();
    // A ResizeObserver recomputes the moment the palette gets its real measured
    // size — its callback is delivered between layout and paint, so the layout
    // lands before the first paint instead of snapping in ~100ms later (the
    // flash-of-unstyled 2-row → 1-row jump). It also covers window resizes,
    // since the palette resizes along with the window.
    const ro = new ResizeObserver(() => updateLayout());
    ro.observe(paletteEl);
    window.addEventListener('orientationchange', updateLayout);
    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', updateLayout);
    };
  });

  // Count visible from the END so the gradient swatch is always shown.
  function isVisible(index, total) {
    return index >= total - visibleCount;
  }

  const totalSwatches = PALETTE_COLORS.length + 1;
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="color-palette"
  bind:this={paletteEl}
  onpointerdown={handlePaletteDown}
  onpointerup={handlePaletteUp}
>
  {#each PALETTE_COLORS as { hex, label }, i (hex)}
    <button
      class="color-swatch"
      class:active={!toolState.eraser && colors.activeSwatch === hex}
      class:ring-animate={ringAnimateKey?.startsWith(hex + ':')}
      data-color={hex}
      style="background-color: {hex}; {!toolState.eraser && colors.activeSwatch === hex ? `box-shadow: ${ringShadow(hex)}; --ring-color: ${getRingColor(hex)};` : ''}"
      style:display={isVisible(i, totalSwatches) ? 'block' : 'none'}
      aria-label={label}
      onpointerup={(e) => handleSwatchUp(e, hex)}
      onpointerdown={(e) => { releaseAllPointers(); e.preventDefault(); e.stopPropagation(); }}
      onpointercancel={(e) => { releaseAllPointers(); e.stopPropagation(); }}
      bind:this={swatchEls[hex]}
    ></button>
  {/each}

  <button
    class="color-swatch gradient-swatch"
    class:active={!toolState.eraser && colors.activeSwatch === CUSTOM_SWATCH}
    data-color="custom"
    aria-label="Custom Color"
    style={!toolState.eraser && colors.activeSwatch === CUSTOM_SWATCH && colors.customColorSelected ? `box-shadow: ${gradientRingShadow(colors.customColor)};` : ''}
    style:display={isVisible(totalSwatches - 1, totalSwatches) ? 'block' : 'none'}
    onpointerup={handleCustomUp}
    onpointerdown={(e) => { releaseAllPointers(); e.preventDefault(); e.stopPropagation(); }}
    onpointercancel={(e) => { releaseAllPointers(); e.stopPropagation(); }}
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

  /* Centered absolutely (not via flex) so it survives the inline display:block/
     none the layout toggles on each swatch. The SVG keeps its aspect ratio. */
  .gradient-swatch :global(.palette-icon) {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 104%;
    height: 104%;
    pointer-events: none;
  }

  /* Tall enough in landscape to stack all swatches in a single column. Done in
     CSS (not JS) so the prerendered first paint already has the right column
     count — otherwise the default 2-column grid paints and visibly snaps to one
     column once JS measures. Breakpoint mirrors updateLayout()'s heightFor1Col:
     8 swatches × 60px + 7 gaps × 12px + 24px padding = 588px. */
  @media (orientation: landscape) and (min-height: 588px) {
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
</style>
