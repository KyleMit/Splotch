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
    selectPaletteColor(hex);
    ringAnimateKey = hex + ':' + Date.now();
    releaseAllPointers();
    focusCanvas();
    e.preventDefault();
    e.stopPropagation();
  }

  function handleCustomUp(e) {
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
  let palette1Col = $state(false);
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
        palette1Col = true;
        visibleCount = total;
      } else {
        palette1Col = false;
        const numRows = Math.floor((availableHeight + gap) / (buttonSize + gap));
        visibleCount = Math.min(numRows * 2, total);
      }
    }
  }

  onMount(() => {
    updateLayout();
    setTimeout(updateLayout, 100);
    window.addEventListener('resize', updateLayout);
    window.addEventListener('orientationchange', updateLayout);
    return () => {
      window.removeEventListener('resize', updateLayout);
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
  class:landscape-1col={!portrait && palette1Col}
  bind:this={paletteEl}
  onpointerdown={handlePaletteDown}
  onpointerup={handlePaletteUp}
  style={!portrait && !palette1Col ? 'grid-template-columns: repeat(2, 1fr);' : (!portrait && palette1Col ? 'grid-template-columns: 1fr;' : '')}
>
  {#each PALETTE_COLORS as { hex, label }, i (hex)}
    <button
      class="color-swatch"
      class:active={colors.activeSwatch === hex}
      class:ring-animate={ringAnimateKey?.startsWith(hex + ':')}
      data-color={hex}
      style="background-color: {hex}; {colors.activeSwatch === hex ? `box-shadow: ${ringShadow(hex)}; --ring-color: ${getRingColor(hex)};` : ''}"
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
    class:active={colors.activeSwatch === CUSTOM_SWATCH}
    data-color="custom"
    aria-label="Custom Color"
    style={colors.activeSwatch === CUSTOM_SWATCH && colors.customColorSelected ? `box-shadow: ${gradientRingShadow(colors.customColor)};` : ''}
    style:display={isVisible(totalSwatches - 1, totalSwatches) ? 'block' : 'none'}
    onpointerup={handleCustomUp}
    onpointerdown={(e) => { releaseAllPointers(); e.preventDefault(); e.stopPropagation(); }}
    onpointercancel={(e) => { releaseAllPointers(); e.stopPropagation(); }}
    bind:this={swatchEls[CUSTOM_SWATCH]}
  ></button>
</div>
