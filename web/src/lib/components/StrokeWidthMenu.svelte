<script lang="ts">
  import Icon from './Icon.svelte';
  import {
    STROKE_SIZES,
    SIZE_ICON,
    ERASER_SIZE_ICON,
    type StrokeSize,
  } from '$lib/state/strokeWidth.svelte';
  import { scribbleTap } from '$lib/actions/scribbleGuard';

  // Presentational Stroke Width popover: the parent (ActionsPanel) owns the
  // trigger, the open/close coordination, and the outside-click handling. It
  // passes the active tool's current size and the erasing/keyline flags; this
  // renders the size entries and reports a pick back through onpick.
  let {
    open,
    activeSize,
    erasing,
    menuColor,
    whiteStroke,
    darkStroke,
    onpick,
  }: {
    open: boolean;
    activeSize: StrokeSize;
    erasing: boolean;
    menuColor: string;
    whiteStroke: boolean;
    darkStroke: boolean;
    onpick: (size: StrokeSize) => void;
  } = $props();
</script>

<div
  class="flyout-menu stroke-width-menu"
  class:white-stroke={whiteStroke}
  class:dark-stroke={darkStroke}
  class:eraser-mode={erasing}
  hidden={!open}
  style:color={menuColor}
>
  <!-- The previews change shape with the tool, not just color (a pink pen would
       otherwise look identical to the eraser): the pen shows ink strokes; the
       eraser shows dashed "holes in the paper" at its true effective size
       (ERASER_SIZE_MULTIPLIER × the pen's width), filled with --paper so the
       hole shows the canvas through the flyout. -->
  {#each STROKE_SIZES as size (size)}
    <button
      class="flyout-option"
      class:active={activeSize === size}
      aria-label={erasing ? `Eraser size ${size}` : `Size ${size}`}
      aria-pressed={activeSize === size}
      use:scribbleTap={() => onpick(size)}
    >
      <Icon name={erasing ? ERASER_SIZE_ICON[size] : SIZE_ICON[size]} class="action-icon" />
    </button>
  {/each}
</div>

<style>
  /* The .flyout-menu / .flyout-option chrome is shared with BrushMenu and lives
     in app.css; only the stroke-width-specific rules stay here. */

  /* Eraser mode renders the hole previews at the eraser's true pixel sizes: the
     button padding drops and the icon viewport is pinned at 56px (the unscaled
     60px button minus its 2px borders), so the icons' 56-unit viewBox maps 1:1
     to CSS px — the level-5 hole is exactly the 44px the eraser actually wipes.
     Pinning (not 100%) keeps that mapping when the touch target shrinks or grows
     — the portrait 55px buttons and the --action-btn-scale set in Settings
     (70–130%) must never rescale the holes. */
  .stroke-width-menu.eraser-mode .flyout-option {
    padding: 0;
  }

  .stroke-width-menu.eraser-mode .flyout-option :global(.action-icon) {
    width: 56px;
    height: 56px;
    flex-shrink: 0;
  }

  /* White brush color is invisible on the white buttons, so ring the tinted
     shape with a solid black edge while white is active. The size menu holds a
     single currentColor path, so plain `path` suffices. paint-order draws the
     stroke behind the white fill and non-scaling-stroke pins it to 2 screen px.
     The #000 keyline is a deliberate one-off — black reads against every pen
     color and both papers. */
  .stroke-width-menu.white-stroke :global(svg path) {
    stroke: #000;
    stroke-width: 2px;
    paint-order: stroke;
    vector-effect: non-scaling-stroke;
  }

  /* The dark-mode mirror: ring near-black ink with a light keyline so it reads
     on the dark cards. Same paint-order trick; the keyline token is transparent
     in light mode, so this rule is inert there. */
  .stroke-width-menu.dark-stroke :global(svg path) {
    stroke: var(--dark-ink-keyline);
    stroke-width: 2px;
    paint-order: stroke;
    vector-effect: non-scaling-stroke;
  }
</style>
