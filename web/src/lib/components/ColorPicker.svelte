<script lang="ts">
  import { ui, closeColorPicker } from '$lib/state/ui.svelte';
  import { pickCustomColor, colors } from '$lib/state/colors.svelte';
  import { releaseAllPointers } from '$lib/drawing/engine';
  import { modalDialog } from '$lib/actions/modalDialog.svelte';
  import { scribbleGuard } from '$lib/actions/scribbleGuard';

  // Static palette grid. The original kept it in HTML; here it's a data-driven
  // {#each} so the template stays declarative and rows can be lazily hidden via
  // media queries on row class.
  const ROWS = [
    {
      name: 'reds',
      colors: [
        '#FFB3C1',
        '#FF8FA3',
        '#FF6B6B',
        '#EE5A6F',
        '#E63946',
        '#D62828',
        '#C1121F',
        '#9D0208',
        '#6A040F',
      ],
    },
    {
      name: 'oranges',
      colors: [
        '#FFAC81',
        '#FFA07A',
        '#FF9E00',
        '#FF8C42',
        '#FB8500',
        '#F77F00',
        '#E85D3B',
        '#D36135',
        '#C34A36',
      ],
    },
    {
      name: 'yellows',
      colors: [
        '#FFEA00',
        '#FFE66D',
        '#FFD60A',
        '#FFC300',
        '#FFB703',
        '#FFAA00',
        '#F9C74F',
        '#F9B44A',
        '#F9844A',
      ],
    },
    {
      name: 'greens',
      colors: [
        '#AED581',
        '#73E2A7',
        '#8FD694',
        '#52B788',
        '#2ECC71',
        '#10B981',
        '#00B894',
        '#2D6A4F',
        '#1B5E3F',
      ],
    },
    {
      name: 'blues',
      colors: [
        '#90CAF9',
        '#4CC9F0',
        '#64B5F6',
        '#42A5F5',
        '#2196F3',
        '#0096C7',
        '#0077B6',
        '#023E8A',
        '#03045E',
      ],
    },
    {
      name: 'purples',
      colors: [
        '#E0AAFF',
        '#D8A7FF',
        '#C77DFF',
        '#B565D8',
        '#9D4EDD',
        '#9B59B6',
        '#8E44AD',
        '#7209B7',
        '#5A189A',
      ],
    },
    {
      name: 'pinks',
      colors: [
        '#FFB3D9',
        '#FF8AC7',
        '#F06292',
        '#FF4081',
        '#FF006E',
        '#E91E63',
        '#D81B60',
        '#C2185B',
        '#AD1457',
      ],
    },
    {
      name: 'browns',
      colors: [
        '#BCAAA4',
        '#A1887F',
        '#8D6E63',
        '#795548',
        '#6D4C41',
        '#5D4037',
        '#4E342E',
        '#3E2723',
        '#2C1810',
      ],
    },
    {
      name: 'greys',
      colors: [
        '#ffffff',
        '#90A4AE',
        '#78909C',
        '#607D8B',
        '#546E7A',
        '#455A64',
        '#37474F',
        '#263238',
        '#1A1F24',
      ],
    },
  ];

  let pickerEl: HTMLDivElement;
  let hoveredHex = $state<string | null>(null);
  let isTrackingDrag = false;
  let hexCenters: { color: string; cx: number; cy: number }[] | null = null;

  function selectColor(hex: string) {
    pickCustomColor(hex);
    releaseAllPointers();
    closeColorPicker();
    hoveredHex = null;
    isTrackingDrag = false;
  }

  function handlePickerDown(e: PointerEvent) {
    const hex = (e.target as HTMLElement).closest('.hexagon') as HTMLElement | null;
    if (!hex) return;
    isTrackingDrag = true;
    hoveredHex = hex.dataset.color ?? null;
    hexCenters = snapshotHexCenters();
    // Capture so the terminating pointerup always reaches handlePickerUp, even
    // when the drag wanders off the picker. Without capture that up is lost
    // (pen/mouse get no implicit capture), leaving isTrackingDrag/hoveredHex
    // stale — and a later tap in a hexagon gap would commit the old color.
    try {
      pickerEl.setPointerCapture(e.pointerId);
    } catch {}
    e.preventDefault();
    e.stopPropagation();
  }

  // A pointed Apple Pencil tip often lands in the clip-path gap between
  // hexagons, where an element hit-test sees only the picker background. Snap
  // to the nearest hexagon center within this radius (px) so gap hits still
  // resolve — for the hover highlight while dragging and the committed color
  // alike. Nearest-center also covers direct hits (a hexagon's farthest edge
  // point is ~35px from its center), so no DOM hit-test is needed. Centers
  // are snapshotted once per drag: per-move rect reads after each hover-class
  // flip forced a reflow per hexagon per pointer event.
  const HEX_SNAP_RADIUS = 40;

  function snapshotHexCenters() {
    const centers: { color: string; cx: number; cy: number }[] = [];
    for (const hex of pickerEl.querySelectorAll<HTMLElement>('.hexagon')) {
      const color = hex.dataset.color;
      if (!color) continue;
      const rect = hex.getBoundingClientRect();
      if (rect.width === 0) continue;
      centers.push({ color, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 });
    }
    return centers;
  }

  function findHexagonInPicker(x: number, y: number): string | null {
    hexCenters ??= snapshotHexCenters();
    let nearest: string | null = null;
    let nearestDistance = HEX_SNAP_RADIUS;
    for (const { color, cx, cy } of hexCenters) {
      const distance = Math.hypot(x - cx, y - cy);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = color;
      }
    }
    return nearest;
  }

  function handlePickerMove(e: PointerEvent) {
    if (!isTrackingDrag) return;
    hoveredHex = findHexagonInPicker(e.clientX, e.clientY);
    e.preventDefault();
    e.stopPropagation();
  }

  function handlePickerUp(e: PointerEvent) {
    if (!isTrackingDrag) return;
    isTrackingDrag = false;
    // Even when the up-point is beyond the snap radius, a swatch still
    // highlighted from this gesture is what the user sees — commit it.
    const color = findHexagonInPicker(e.clientX, e.clientY) ?? hoveredHex;
    if (color) {
      selectColor(color);
    }
    e.preventDefault();
    e.stopPropagation();
  }
</script>

<svelte:window onresize={() => (hexCenters = null)} />

<!-- scribbleGuard covers the hexagons AND the backdrop (backdrop events target
     the <dialog> itself): a pen tap that picks a color or dismisses the picker
     must not arm Scribble against the stroke that follows. Selection is
     pointerup-driven and backdrop dismissal is pointerdown-driven, so
     suppressing the stylus click synthesis costs nothing here. -->
<dialog
  id="color-picker"
  class="color-picker modal-dialog modal-fly-in"
  use:scribbleGuard
  use:modalDialog={() => ({
    open: ui.colorPickerOpen,
    origin: ui.colorPickerOrigin,
    onRequestClose: closeColorPicker,
    onClose: () => {
      hoveredHex = null;
      isTrackingDrag = false;
    },
  })}
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="picker"
    bind:this={pickerEl}
    onpointerdown={handlePickerDown}
    onpointermove={handlePickerMove}
    onpointerup={handlePickerUp}
    onpointercancel={() => {
      isTrackingDrag = false;
      hoveredHex = null;
    }}
    onpointerleave={() => {
      if (!isTrackingDrag) hoveredHex = null;
    }}
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

<style>
  .color-picker {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    margin: 0;
    background: white;
    border: none;
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    width: fit-content;
    max-width: 90vw;
    max-height: 90vh;
    overflow: hidden;
    padding: 0;
    touch-action: none;
  }

  .picker {
    display: inline-flex;
    flex-direction: column;
    padding: 16px;
    margin-top: 15px;
  }

  .row {
    display: flex;
    margin-top: -15px;
  }

  /* row pitch: 69px hex - 15px overlap = 54px; padding = 32px
     9 rows = 533px | 8 = 479px | 7 = 425px | 6 = 371px | 5 = 317px
     threshold = ceil(picker_height / 0.9) + ~7px buffer */
  @media (max-height: 600px) {
    .greys {
      display: none;
    }
  }
  @media (max-height: 540px) {
    .browns {
      display: none;
    }
  }
  @media (max-height: 480px) {
    .reds {
      display: none;
    }
  }
  @media (max-height: 420px) {
    .oranges {
      display: none;
    }
  }
  @media (max-height: 360px) {
    .pinks {
      display: none;
    }
  }
  @media (max-height: 300px) {
    .yellows {
      display: none;
    }
  }

  /* col pitch: 66px per hex; picker width = 66N + 59px (offset + padding)
     9=653 8=587 7=521 6=455 5=389 4=323 3=257 2=191
     threshold = ceil(picker_width / 0.9) + ~7px buffer
     removal order: 2nd, 4th, 6th, 8th, 3rd, 5th, 7th */
  @media (max-width: 730px) {
    .row .hexagon:nth-child(2) {
      display: none;
    }
  }
  @media (max-width: 660px) {
    .row .hexagon:nth-child(4) {
      display: none;
    }
  }
  @media (max-width: 590px) {
    .row .hexagon:nth-child(6) {
      display: none;
    }
  }
  @media (max-width: 520px) {
    .row .hexagon:nth-child(8) {
      display: none;
    }
  }
  @media (max-width: 440px) {
    .row .hexagon:nth-child(3) {
      display: none;
    }
  }
  @media (max-width: 370px) {
    .row .hexagon:nth-child(5) {
      display: none;
    }
  }
  @media (max-width: 290px) {
    .row .hexagon:nth-child(7) {
      display: none;
    }
  }

  .row:nth-child(even) {
    margin-left: 31px;
  }

  .row:not(:first-child) {
    margin-top: -18px;
  }

  .hexagon {
    position: relative;
    width: 60px;
    height: 69px; /* For a regular hexagon, height = width * 1.15 */
    flex-shrink: 0;
    clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
    padding: 0;
    border: none;
    background: transparent;
    font: inherit;
    color: inherit;
    cursor: pointer;
    touch-action: none;
  }

  .hexagon::after {
    content: '';
    position: absolute;
    inset: 0;
    background-color: var(--color, #007bff);
    clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
    transition:
      inset 0.1s ease,
      filter 0.1s ease;
  }

  /* The .hover class is JS-driven (hoveredHex) so it works on the touch/pen drag
     path; the :hover pseudo is guarded behind a real pointer because touch
     browsers apply :hover on tap and leave the last-tapped swatch stuck enlarged. */
  .hexagon.hover {
    z-index: 1;
    background-color: black;
  }

  .hexagon.hover::after {
    inset: 2px;
    filter: brightness(1.2);
  }

  @media (hover: hover) {
    .hexagon:hover {
      z-index: 1;
      background-color: black;
    }

    .hexagon:hover::after {
      inset: 2px;
      filter: brightness(1.2);
    }
  }

  .hexagon.border {
    background-color: black;
  }

  .hexagon.border::after {
    inset: 2px;
  }

  .hexagon.selected {
    z-index: 1;
    background-color: color-mix(in srgb, var(--color, #007bff), black 20%);
  }

  .hexagon.selected::after {
    inset: 3px;
  }
</style>
