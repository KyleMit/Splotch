<script>
  import { ui, closeColorPicker } from '$lib/state/ui.svelte.js';
  import { pickCustomColor, colors } from '$lib/state/colors.svelte.js';
  import { releaseAllPointers, focusCanvas } from '$lib/drawing/engine.js';

  // Static palette grid. The original kept it in HTML; here it's a data-driven
  // {#each} so the template stays declarative and rows can be lazily hidden via
  // media queries on row class.
  const ROWS = [
    { name: 'reds', colors: ['#FFB3C1', '#FF8FA3', '#FF6B6B', '#EE5A6F', '#E63946', '#D62828', '#C1121F', '#9D0208', '#6A040F'] },
    { name: 'oranges', colors: ['#FFAC81', '#FFA07A', '#FF9E00', '#FF8C42', '#FB8500', '#F77F00', '#E85D3B', '#D36135', '#C34A36'] },
    { name: 'yellows', colors: ['#FFEA00', '#FFE66D', '#FFD60A', '#FFC300', '#FFB703', '#FFAA00', '#F9C74F', '#F9B44A', '#F9844A'] },
    { name: 'greens', colors: ['#AED581', '#73E2A7', '#8FD694', '#52B788', '#2ECC71', '#10B981', '#00B894', '#2D6A4F', '#1B5E3F'] },
    { name: 'blues', colors: ['#90CAF9', '#4CC9F0', '#64B5F6', '#42A5F5', '#2196F3', '#0096C7', '#0077B6', '#023E8A', '#03045E'] },
    { name: 'purples', colors: ['#E0AAFF', '#D8A7FF', '#C77DFF', '#B565D8', '#9D4EDD', '#9B59B6', '#8E44AD', '#7209B7', '#5A189A'] },
    { name: 'pinks', colors: ['#FFB3D9', '#FF8AC7', '#F06292', '#FF4081', '#FF006E', '#E91E63', '#D81B60', '#C2185B', '#AD1457'] },
    { name: 'browns', colors: ['#BCAAA4', '#A1887F', '#8D6E63', '#795548', '#6D4C41', '#5D4037', '#4E342E', '#3E2723', '#2C1810'] },
    { name: 'greys', colors: ['#ffffff', '#90A4AE', '#78909C', '#607D8B', '#546E7A', '#455A64', '#37474F', '#263238', '#1A1F24'] }
  ];

  let dialogEl;
  let pickerEl;
  let hoveredHex = $state(null);
  let isTrackingDrag = false;

  // Open/close the dialog in response to ui.colorPickerOpen.
  $effect(() => {
    if (!dialogEl) return;
    if (ui.colorPickerOpen) {
      if (!dialogEl.open) {
        if (ui.colorPickerOrigin) {
          const { x, y } = ui.colorPickerOrigin;
          dialogEl.style.setProperty('--origin-x', `${x - window.innerWidth / 2}px`);
          dialogEl.style.setProperty('--origin-y', `${y - window.innerHeight / 2}px`);
        }
        dialogEl.showModal();
      }
    } else {
      if (dialogEl.open) dialogEl.close();
    }
  });

  function selectColor(hex) {
    pickCustomColor(hex);
    releaseAllPointers();
    focusCanvas();
    closeColorPicker();
    hoveredHex = null;
    isTrackingDrag = false;
  }

  function handlePickerDown(e) {
    const hex = e.target.closest('.hexagon');
    if (!hex) return;
    isTrackingDrag = true;
    hoveredHex = hex.dataset.color;
    e.preventDefault();
    e.stopPropagation();
  }

  function handlePickerMove(e) {
    if (!isTrackingDrag) return;
    const element = document.elementFromPoint(e.clientX, e.clientY);
    const hex = element?.closest?.('.hexagon');
    if (hex && pickerEl.contains(hex)) {
      hoveredHex = hex.dataset.color;
    } else {
      hoveredHex = null;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  function handlePickerUp(e) {
    if (!isTrackingDrag) return;
    isTrackingDrag = false;
    const element = document.elementFromPoint(e.clientX, e.clientY);
    const hex = element?.closest?.('.hexagon');
    if (hex && pickerEl.contains(hex)) {
      selectColor(hex.dataset.color);
    } else {
      hoveredHex = null;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  function isPointInsideDialog(x, y) {
    const rect = dialogEl.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  // Block-out zone around the gradient swatch so toddler mis-taps don't dismiss.
  function isPointInGradientBlockZone(x, y) {
    const gradientSwatch = document.querySelector('.gradient-swatch');
    if (!gradientSwatch) return false;
    const rect = gradientSwatch.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const padding = 20;
    const swatchCx = (rect.left + rect.right) / 2;
    const swatchCy = (rect.top + rect.bottom) / 2;
    const left = swatchCx < vw / 2 ? 0 : rect.left - padding;
    const right = swatchCx < vw / 2 ? rect.right + padding : vw;
    const top = swatchCy < vh / 2 ? 0 : rect.top - padding;
    const bottom = swatchCy < vh / 2 ? rect.bottom + padding : vh;
    return x >= left && x <= right && y >= top && y <= bottom;
  }

  function handleDialogDown(e) {
    if (!isPointInsideDialog(e.clientX, e.clientY)) {
      if (isPointInGradientBlockZone(e.clientX, e.clientY)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      closeColorPicker();
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function handleDialogClose() {
    hoveredHex = null;
    isTrackingDrag = false;
    // Sync rune in case dialog was closed via Esc.
    if (ui.colorPickerOpen) closeColorPicker();
  }
</script>

<dialog
  id="color-picker"
  class="color-picker"
  bind:this={dialogEl}
  onpointerdown={handleDialogDown}
  onclose={handleDialogClose}
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="picker"
    bind:this={pickerEl}
    onpointerdown={handlePickerDown}
    onpointermove={handlePickerMove}
    onpointerup={handlePickerUp}
    onpointercancel={() => { isTrackingDrag = false; hoveredHex = null; }}
    onpointerleave={() => { if (!isTrackingDrag) hoveredHex = null; }}
  >
    {#each ROWS as row (row.name)}
      <div class="row {row.name}">
        {#each row.colors as hex (hex)}
          <button
            class="hexagon"
            class:hover={hoveredHex === hex}
            class:border={hex === '#ffffff'}
            class:selected={colors.customColor.toLowerCase() === hex.toLowerCase()}
            style="--color: {hex};"
            data-color={hex}
            aria-label={hex}
          ></button>
        {/each}
      </div>
    {/each}
  </div>
</dialog>
