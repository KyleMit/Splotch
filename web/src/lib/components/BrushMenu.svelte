<script lang="ts">
  import Icon from './Icon.svelte';
  import { toolState, BRUSH_OPTIONS, type BrushType } from '$lib/state/tool.svelte';
  import { scribbleTap } from '$lib/actions/scribbleGuard';

  // Presentational Brush Menu popover: the parent (ActionsPanel) owns the
  // trigger, the open/close coordination, and the outside-click handling; this
  // renders the four brush entries and reports a pick back through onpick.
  let {
    open,
    activeColor,
    inkWhite,
    inkDark,
    onpick,
  }: {
    open: boolean;
    activeColor: string;
    inkWhite: boolean;
    inkDark: boolean;
    onpick: (brush: BrushType) => void;
  } = $props();
</script>

<!-- The pen and crayon icons draw their ink parts in currentColor, so the menu
     carries the active color the way the stroke-width control does (the
     magic/eraser icons ignore it — no currentColor). -->
<div
  class="flyout-menu brush-menu"
  class:white-stroke={inkWhite}
  class:dark-stroke={inkDark}
  hidden={!open}
  style:color={activeColor}
>
  {#each BRUSH_OPTIONS as opt (opt.brush)}
    <button
      class="flyout-option"
      class:active={toolState.brush === opt.brush}
      id={opt.id}
      aria-label={opt.label}
      aria-pressed={toolState.brush === opt.brush}
      use:scribbleTap={() => onpick(opt.brush)}
    >
      <Icon name={opt.icon} class="action-icon" />
    </button>
  {/each}
</div>

<style>
  /* The .flyout-menu / .flyout-option chrome is shared with StrokeWidthMenu and
     lives in app.css; only the brush-specific rules stay here. */

  /* The eraser's Parent Center toggle hides its Brush Menu entry. The root seed
     owns first paint; the hydrated panel owns live changes. */
  :global(html[data-off-eraser] .actions-panel:not([data-action-panel-live])) #eraserButton,
  :global(.actions-panel[data-action-panel-live][data-off-eraser]) #eraserButton {
    display: none;
  }

  /* White brush color is invisible on the white buttons, so ring the tinted
     shapes with a solid black edge while white is active. paint-order draws the
     stroke behind the white fill (so only an outer keyline shows), and
     non-scaling-stroke pins it to 2 screen px across the icons' very different
     viewBoxes. Only the currentColor paths are stroked, leaving each icon's
     fixed-palette parts (colored pencils, the crayon's wrapper, the magic/eraser
     entries) untouched. The #000 keyline is a deliberate one-off — black reads
     against every pen color and both papers. */
  .brush-menu.white-stroke :global(svg path[fill='currentColor']) {
    stroke: #000;
    stroke-width: 2px;
    paint-order: stroke;
    vector-effect: non-scaling-stroke;
  }

  /* The dark-mode mirror: ring near-black ink with a light keyline so it reads
     on the dark cards. Same paint-order trick; the keyline token is transparent
     in light mode, so this rule is inert there. */
  .brush-menu.dark-stroke :global(svg path[fill='currentColor']) {
    stroke: var(--dark-ink-keyline);
    stroke-width: 2px;
    paint-order: stroke;
    vector-effect: non-scaling-stroke;
  }
</style>
