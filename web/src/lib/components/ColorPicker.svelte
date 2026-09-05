<script lang="ts">
  import { colorPickerModal } from '$lib/state/ui.svelte';
  import { pickCustomColor, colors, isWhite } from '$lib/state/colors.svelte';
  import { releaseAllPointers } from '$lib/drawing/engine';
  import { modalDialog } from '$lib/actions/modalDialog.svelte';
  import { scribbleGuard } from '$lib/actions/scribbleGuard';
  import { HEX_GRID_GEOMETRY } from '$lib/design/trimGeometry';
  import { PORTRAIT_ROWS, LANDSCAPE_ROWS, PICKER_DIM_BORDER } from '$lib/hexPickerLayout';

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

  interface HexCenter {
    color: string;
    cx: number;
    cy: number;
  }

  let pickerEl: HTMLDivElement;
  let hoveredHex = $state<string | null>(null);
  let isTrackingDrag = false;
  let hexCenters: HexCenter[] | null = null;

  function selectColor(hex: string) {
    pickCustomColor(hex);
    releaseAllPointers();
    colorPickerModal.hide();
    hoveredHex = null;
    isTrackingDrag = false;
  }

  function handlePickerDown(e: PointerEvent) {
    // Re-snapshotted per gesture rather than lazily: the picker can reopen from a
    // new origin, and a snapshot kept across that would snap to stale centers.
    hexCenters = snapshotHexCenters();
    const direct = e.target instanceof Element ? e.target.closest('.hexagon') : null;
    const color =
      (direct instanceof HTMLElement ? direct.dataset.color : undefined) ??
      findHexagonInPicker(e.clientX, e.clientY);
    if (!color) return;
    isTrackingDrag = true;
    hoveredHex = color;
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
  // to the nearest hexagon center within a radius of half the hexagon height
  // plus this slop, so gap hits still resolve — for the pointerdown that starts
  // the gesture (a tap in a gap otherwise selects nothing at all), the hover
  // highlight while dragging, and the committed color alike. The slop bridges
  // the gaps, and reaching half the height means nearest-center also covers
  // direct hits without a DOM hit-test — which the drag path has no way to run
  // anyway, since pointer capture retargets every move to the picker. Centers
  // are snapshotted once per drag: per-move rect reads after each hover-class
  // flip forced a reflow per hexagon per pointer event.
  const HEX_SNAP_GAP_SLOP_PX = 5.5;

  // Measured from the live grid rather than fixed at the base geometry: roomy
  // viewports scale the honeycomb up (see --hex-scale), and a radius pinned to
  // an unscaled hexagon stops reaching a scaled one's ends. Untracked on
  // purpose — a snapshot input, nothing renders from it.
  let hexSnapRadiusPx = HEX_GRID_GEOMETRY.firstRowPx / 2 + HEX_SNAP_GAP_SLOP_PX;

  function snapshotHexCenters() {
    const centers: HexCenter[] = [];
    for (const hex of pickerEl.querySelectorAll<HTMLElement>('.hexagon')) {
      const color = hex.dataset.color;
      if (!color) continue;
      const rect = hex.getBoundingClientRect();
      if (rect.width === 0) continue;
      if (centers.length === 0) hexSnapRadiusPx = rect.height / 2 + HEX_SNAP_GAP_SLOP_PX;
      centers.push({ color, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 });
    }
    return centers;
  }

  function findHexagonInPicker(x: number, y: number): string | null {
    hexCenters ??= snapshotHexCenters();
    let nearest: string | null = null;
    let nearestDistance = hexSnapRadiusPx;
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
    open: colorPickerModal.open,
    origin: colorPickerModal.origin,
    onRequestClose: colorPickerModal.hide,
    onClose: () => {
      hoveredHex = null;
      isTrackingDrag = false;
    },
    retirement: 'compositor',
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
                class:border={isWhite(hex)}
                class:border-dim={hex === PICKER_DIM_BORDER}
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
    will-change: transform;
  }

  .picker {
    display: inline-flex;
    padding: var(--space-4);
    margin-top: var(--hex-first-row-overlap);
    /* One factor over the whole honeycomb — hexagon, indent and both overlaps —
       so a scaled grid stays interlocked instead of drifting apart. The values
       below are the geometry design/trimGeometry.ts derives every trim step
       from, so they are the values at scale 1 and only the roomy step past the
       ladders may raise it. */
    --hex-scale: 1;
    --hex-offset: calc(31px * var(--hex-scale));
    --hex-first-row-overlap: calc(15px * var(--hex-scale));
    --hex-row-overlap: calc(18px * var(--hex-scale));
    --hex-clip: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
  }

  /* ── Roomy viewports: large tablets, and desktop windows alike ────────────
     A 13-inch iPad shows the untrimmed grid in a card that leaves most of the
     screen to backdrop, so the room goes into the swatches rather than around
     them — same count, bigger targets for small fingers. Both axes on purpose,
     and only above the large-tablet floor: every trim rung below is a
     max-width/max-height in the 675px-and-under range, so nothing here can
     reach one and the ladders stay derived from the scale-1 geometry.
     Classifying by viewport rather than by pointer is what the app already does
     (`isTabletViewport()`), so a roomy desktop window takes this step too.
     1000px is LARGE_TABLET_MIN_SIDE_PX, which a CSS media query cannot import —
     the agreement with it, and with the other roomy dialogs' matching steps, is
     held by dialogTabletScaling.test.ts. The factor is the fit at the corner of
     that floor: a 1000px-wide window caps the grid at 90vw, which the widest
     row reaches at 1.52. */
  @media (min-width: 1000px) and (min-height: 1000px) {
    .picker {
      --hex-scale: 1.3;
    }
  }

  .grid {
    display: flex;
    flex-direction: column;
  }

  .row {
    display: flex;
    margin-top: calc(-1 * var(--hex-first-row-overlap));
  }

  .row:not(:first-child) {
    margin-top: calc(-1 * var(--hex-row-overlap));
  }

  /* ── Responsive trimming (ADR-0048) ──────────────────────────────────────
     Two grids are rendered — portrait (families as rows) and landscape (the
     transpose: families as columns, shade levels as rows) — and orientation
     picks one, so the SHORT viewport axis always trims shade levels and the
     long axis trims families. All trim rules below are positional (r2/c2 =
     2nd row/column from the light/red end) and shared by both grids: the
     drop order r2,r4,r6,r8,r3,r7(,c5) keeps an even spread across whichever
     ramp that axis holds — shades stay light→dark, families stay a rainbow —
     and never drops r1/c1/r9/c9, the endpoints. Both ladders below are derived
     arithmetically; design/trimGeometry.ts is their executable form — geometry,
     formulas and step tables, the two hand-tightened steps included — and
     trimGeometry.test.ts parses this whole style block back out and asserts the
     module still produces exactly the values written here. */
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
     (51r + 50) / 0.9 rounded up to the whole pixel, no slack — except the
     9-row step, tightened 1px below that minimum (HEX_GRID_ROW_RULE and its
     one exception in HEX_GRID_ROW_LADDER). Hidden rows still count for
     :nth-child, so the base even-row rule can't drive the honeycomb offset;
     instead every step restates which rows carry the 31px offset so it
     alternates by VISIBLE position — that's what keeps a trimmed grid
     interlocking instead of jagged. */
  .r2,
  .r4,
  .r6,
  .r8 {
    margin-left: var(--hex-offset);
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
      margin-left: var(--hex-offset);
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
      margin-left: var(--hex-offset);
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
      margin-left: var(--hex-offset);
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
      margin-left: var(--hex-offset);
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
      margin-left: var(--hex-offset);
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
      margin-left: var(--hex-offset);
    }
    .r9 {
      margin-left: 0;
    }
  }

  /* WIDTH — c columns fit while 90vw ≥ 60·c + 63 (60px column pitch + 31px
     row offset + 32px padding; measured 603px at 9 columns), stepping at
     (60c + 63) / 0.9 rounded up to the next 5px and then one 5px step further
     — except the 4-column step, which stops at that first multiple of 5
     (HEX_GRID_COLUMN_RULE and its one exception in HEX_GRID_COLUMN_LADDER).
     Every row loses the same positions, so column trims never need offset
     bookkeeping. Floor: 2 columns (c1 + c9). */
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
    --hex-hover-scale: 0.94;

    position: relative;
    width: calc(60px * var(--hex-scale));
    height: calc(69px * var(--hex-scale)); /* For a regular hexagon, height = width * 1.15 */
    flex-shrink: 0;
    clip-path: var(--hex-clip);
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
    background-color: var(--color);
    clip-path: var(--hex-clip);
    transform-origin: center;
    transition:
      transform 0.1s ease,
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
    transform: scale(var(--hex-hover-scale));
    filter: brightness(1.2);
  }

  @media (hover: hover) {
    .hexagon:hover {
      z-index: 1;
      background-color: var(--icon-ink);
    }

    .hexagon:hover::after {
      transform: scale(var(--hex-hover-scale));
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
    background-color: color-mix(in srgb, var(--color), black 20%);
  }

  .hexagon.selected::after {
    inset: 3px;
  }

  /* The inset-based hover rule was overridden by these states, so their ring
     widths stay fixed while the brightness feedback remains active. */
  .hexagon.hover:is(.border, .border-dim, .selected)::after {
    transform: none;
  }

  @media (hover: hover) {
    .hexagon:hover:is(.border, .border-dim, .selected)::after {
      transform: none;
    }
  }
</style>
