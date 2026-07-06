<script lang="ts">
  import { ui, closeColorPicker } from '$lib/state/ui.svelte';
  import { pickCustomColor, colors } from '$lib/state/colors.svelte';
  import { releaseAllPointers } from '$lib/drawing/engine';
  import { modalDialog } from '$lib/actions/modalDialog.svelte';
  import { scribbleGuard } from '$lib/actions/scribbleGuard';
  import { buildPickerRows } from '$lib/hexPickerLayout';

  // The grid is computed from the viewport (see hexPickerLayout.ts): the
  // constrained axis trims shades while every hue family stays represented,
  // and only the rows/hexes that fit are rendered — so the honeycomb's
  // alternating offset stays intact at every size. SSR has no viewport; the
  // fallback renders the full grid, and the dialog only opens post-hydration.
  let viewportWidth = $state<number | undefined>();
  let viewportHeight = $state<number | undefined>();
  const rows = $derived(buildPickerRows(viewportWidth ?? 1280, viewportHeight ?? 800));

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

<svelte:window
  bind:innerWidth={viewportWidth}
  bind:innerHeight={viewportHeight}
  onresize={() => (hexCenters = null)}
/>

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
    {#each rows as row (row.key)}
      <div class="row">
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

  /* Which hexes exist at a given viewport size is decided in
     hexPickerLayout.ts, which mirrors the geometry below — keep them in sync. */
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
