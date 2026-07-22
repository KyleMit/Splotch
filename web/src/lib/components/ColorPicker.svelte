<script lang="ts">
  import { ui, closeColorPicker } from '$lib/state/ui.svelte';
  import { pickCustomColor, colors } from '$lib/state/colors.svelte';
  import { releaseAllPointers } from '$lib/drawing/engine';
  import { modalDialog } from '$lib/actions/modalDialog.svelte';
  import { scribbleGuard } from '$lib/actions/scribbleGuard';
  import { PORTRAIT_ROWS, LANDSCAPE_ROWS } from '$lib/hexPickerLayout';

  // Both grid arrangements are rendered; CSS media queries pick one per
  // orientation and progressively trim it (see the trim ladders in the style
  // block). Everything is static markup + CSS — like ColorPalette's trim
  // rules, the layout is correct on the prerendered first paint with no JS
  // measurement or resize flash. Landscape first: E2E helpers grab the first
  // `.hexagon`, and the Playwright default viewport is landscape.
  const GRIDS = [
    { name: 'landscape', rows: LANDSCAPE_ROWS },
    { name: 'portrait', rows: PORTRAIT_ROWS },
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

  function handleHexClick(e: MouseEvent, hex: string) {
    if (e.detail === 0) selectColor(hex);
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
    {#each GRIDS as grid (grid.name)}
      <div class="grid {grid.name}">
        {#each grid.rows as row, r (row.key)}
          <div class="row r{r + 1}">
            {#each row.colors as hex, c (hex)}
              <button
                class="hexagon c{c + 1}"
                class:hover={hoveredHex === hex}
                class:border={hex === '#ffffff'}
                class:border-dim={hex === '#1A1F24'}
                class:selected={colors.customColor.toLowerCase() === hex.toLowerCase()}
                style="--color: {hex};"
                data-color={hex}
                aria-label={hex}
                onclick={(e) => handleHexClick(e, hex)}
              ></button>
            {/each}
          </div>
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
    background: var(--surface);
    border: none;
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-pop);
    width: fit-content;
    max-width: 90vw;
    max-height: 90vh;
    overflow: hidden;
    padding: 0;
    touch-action: none;
  }

  .picker {
    display: inline-flex;
    padding: 16px;
    margin-top: 15px;
  }

  .grid {
    display: flex;
    flex-direction: column;
  }

  .row {
    display: flex;
    margin-top: -15px;
  }

  .row:not(:first-child) {
    margin-top: -18px;
  }

  /* ── Responsive trimming (ADR-0048) ──────────────────────────────────────
     Two grids are rendered — portrait (families as rows) and landscape (the
     transpose: families as columns, shade levels as rows) — and orientation
     picks one, so the SHORT viewport axis always trims shade levels and the
     long axis trims families. All trim rules below are positional (r2/c2 =
     2nd row/column from the light/red end) and shared by both grids: the
     drop order r2,r4,r6,r8,r3,r7(,c5) keeps an even spread across whichever
     ramp that axis holds — shades stay light→dark, families stay a rainbow —
     and never drops r1/c1/r9/c9, the endpoints. */
  @media (orientation: landscape) {
    .grid.portrait {
      display: none;
    }
  }
  @media (orientation: portrait) {
    .grid.landscape {
      display: none;
    }
  }

  /* HEIGHT — r rows fit while 90vh ≥ 51·r + 50 (69px first row + 51px row
     pitch + 32px padding; measured 509px at 9 rows), so the ladder steps at
     ≈ (51r + 50) / 0.9 with a few px of buffer. Hidden rows still count for
     :nth-child, so the base even-row rule can't drive the honeycomb offset;
     instead every step restates which rows carry the 31px offset so it
     alternates by VISIBLE position — that's what keeps a trimmed grid
     interlocking instead of jagged. */
  .r2,
  .r4,
  .r6,
  .r8 {
    margin-left: 31px;
  }

  @media (max-height: 564.98px) {
    /* 8 rows: 1,3,4,5,6,7,8,9 */
    .r2 {
      display: none;
    }
    .r3,
    .r5,
    .r7,
    .r9 {
      margin-left: 31px;
    }
    .r4,
    .r6,
    .r8 {
      margin-left: 0;
    }
  }
  @media (max-height: 508.98px) {
    /* 7 rows: 1,3,5,6,7,8,9 */
    .r4 {
      display: none;
    }
    .r3,
    .r6,
    .r8 {
      margin-left: 31px;
    }
    .r5,
    .r7,
    .r9 {
      margin-left: 0;
    }
  }
  @media (max-height: 452.98px) {
    /* 6 rows: 1,3,5,7,8,9 */
    .r6 {
      display: none;
    }
    .r3,
    .r7,
    .r9 {
      margin-left: 31px;
    }
    .r5,
    .r8 {
      margin-left: 0;
    }
  }
  @media (max-height: 395.98px) {
    /* 5 rows: 1,3,5,7,9 */
    .r8 {
      display: none;
    }
    .r3,
    .r7 {
      margin-left: 31px;
    }
    .r5,
    .r9 {
      margin-left: 0;
    }
  }
  @media (max-height: 338.98px) {
    /* 4 rows: 1,5,7,9 */
    .r3 {
      display: none;
    }
    .r5,
    .r9 {
      margin-left: 31px;
    }
    .r7 {
      margin-left: 0;
    }
  }
  @media (max-height: 282.98px) {
    /* 3 rows: 1,5,9 — the floor */
    .r7 {
      display: none;
    }
    .r5 {
      margin-left: 31px;
    }
    .r9 {
      margin-left: 0;
    }
  }

  /* WIDTH — c columns fit while 90vw ≥ 60·c + 63 (60px column pitch + 31px
     row offset + 32px padding; measured 603px at 9 columns), stepping at
     ≈ (60c + 63) / 0.9 + buffer. Every row loses the same positions, so
     column trims never need offset bookkeeping. Floor: 2 columns (c1 + c9). */
  @media (max-width: 674.98px) {
    .c2 {
      display: none;
    }
  }
  @media (max-width: 609.98px) {
    .c4 {
      display: none;
    }
  }
  @media (max-width: 544.98px) {
    .c6 {
      display: none;
    }
  }
  @media (max-width: 474.98px) {
    .c8 {
      display: none;
    }
  }
  @media (max-width: 409.98px) {
    .c3 {
      display: none;
    }
  }
  @media (max-width: 339.98px) {
    .c7 {
      display: none;
    }
  }
  @media (max-width: 274.98px) {
    .c5 {
      display: none;
    }
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
    background-color: var(--icon-ink);
  }

  .hexagon.hover::after {
    inset: 2px;
    filter: brightness(1.2);
  }

  @media (hover: hover) {
    .hexagon:hover {
      z-index: 1;
      background-color: var(--icon-ink);
    }

    .hexagon:hover::after {
      inset: 2px;
      filter: brightness(1.2);
    }
  }

  /* Outlines for the swatches that blend into the picker surface: white in
     light mode (ink ring via --icon-ink), near-black #1A1F24 in dark mode
     (constant dim grey ring — deliberately quieter than --icon-ink, just
     enough to find the swatch without spotlighting it; against light mode's
     white surface the same grey reads as part of the black swatch). */
  .hexagon.border {
    background-color: var(--icon-ink);
  }

  .hexagon.border-dim {
    background-color: #4d4d5b;
  }

  .hexagon.border::after,
  .hexagon.border-dim::after {
    inset: 2px;
  }

  .hexagon.selected {
    z-index: 1;
    /* rgba fallback precedes the color-mix (docs/COMPATIBILITY.md): pre-color-mix
       engines keep a neutral dark ring instead of losing the selection indicator
       entirely (the base .hexagon background is transparent). */
    background-color: rgba(0, 0, 0, 0.2);
    background-color: color-mix(in srgb, var(--color, #007bff), black 20%);
  }

  .hexagon.selected::after {
    inset: 3px;
  }
</style>
