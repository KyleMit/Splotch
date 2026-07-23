<script lang="ts">
  import Icon from './Icon.svelte';
  import { STROKE_SIZES } from '$lib/state/strokeWidth.svelte';
  import type { CommonIconName } from './iconTypes';
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
    activeSize: number;
    erasing: boolean;
    menuColor: string;
    whiteStroke: boolean;
    darkStroke: boolean;
    onpick: (size: number) => void;
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
      <Icon
        name={`${erasing ? 'eraser-size' : 'size'}-${size}` as CommonIconName}
        class="action-icon"
      />
    </button>
  {/each}
</div>

<style>
  /* Landscape base rule (portrait overrides below): the action panel hugs the
     bottom with little height to spare, so the flyout pops up as a horizontal
     row — one button tall — instead of a vertical column that would run off the
     top of a short landscape screen. Absolutely positioned against the parent's
     position:relative .flyout-wrapper (a Svelte component adds no wrapper DOM,
     so this menu is a direct child of it). */
  .flyout-menu {
    position: absolute;
    left: 0;
    bottom: calc(100% + 8px);
    display: flex;
    flex-direction: row;
    gap: 6px;
    padding: 6px;
    background: var(--float-surface);
    border: none;
    border-radius: 16px;
    box-shadow: var(--float-shadow-flyout);
    z-index: 901;
  }

  @media (orientation: portrait) {
    .flyout-menu {
      left: calc(100% + 8px);
      bottom: 0;
      flex-direction: row;
    }
  }

  /* On phone-width portrait screens the horizontal flyout runs under the
     bottom-right Parent Center button (and, when narrower, off the right edge):
     stack the options vertically so it runs up alongside the other action
     buttons and clears the parent button. The row layout stays for tablet-width
     portrait, where there's room to the right of the palette. */
  @media (orientation: portrait) and (max-width: 540px) {
    .flyout-menu {
      flex-direction: column;
    }
  }

  .flyout-menu[hidden] {
    display: none;
  }

  /* Eraser mode renders the hole previews at the eraser's true pixel sizes: the
     button padding drops and the icon viewport is pinned at 56px (the unscaled
     60px button minus its 2px borders), so the icons' 56-unit viewBox maps 1:1
     to CSS px — the level-5 hole is exactly the 44px the eraser actually wipes.
     Pinning (not 100%) keeps that mapping when the touch target shrinks or grows
     — the portrait 55px buttons and the Parent Center's --action-btn-scale
     (70–130%) must never rescale the holes. */
  .stroke-width-menu.eraser-mode .flyout-option {
    padding: 0;
  }

  .stroke-width-menu.eraser-mode .flyout-option :global(.action-icon) {
    width: 56px;
    height: 56px;
    flex-shrink: 0;
  }

  .flyout-option {
    width: calc(60px * var(--action-btn-scale, 1));
    height: calc(60px * var(--action-btn-scale, 1));
    background: var(--float-surface);
    border: 2px solid var(--float-border);
    border-radius: 14px;
    cursor: pointer;
    /* Inherit the menu's color so the line icons (currentColor) pick up the
       active pen/eraser color — buttons don't inherit color by default. */
    color: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: calc(7px * var(--action-btn-scale, 1));
    /* Interaction feedback only — the width/height track --action-btn-scale and
       must snap when the parent drags the Button Size slider (issue #317). */
    transition:
      background-color var(--duration-fast) ease,
      border-color var(--duration-fast) ease,
      box-shadow var(--duration-fast) ease,
      transform var(--duration-fast) ease;
    touch-action: manipulation;
  }

  @media (hover: hover) {
    .flyout-option:hover {
      border-color: var(--brand);
      background: var(--brand-wash);
    }
  }

  .flyout-option:active {
    transform: scale(0.92);
  }

  .flyout-option.active {
    border-color: var(--brand);
    background: var(--brand-wash);
    box-shadow: 0 0 0 2px rgba(171, 113, 225, 0.35);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 35%, transparent);
  }

  /* The selected size reads from the button's purple ring/fill; its line keeps
     the current color (currentColor), so only tint non-color icons here. */
  .flyout-option.active :global(.action-icon:not(.icon-color) svg) {
    fill: var(--brand);
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
