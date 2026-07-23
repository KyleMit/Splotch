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

  .flyout-option {
    width: calc(60px * var(--action-btn-scale, 1));
    height: calc(60px * var(--action-btn-scale, 1));
    background: var(--float-surface);
    border: 2px solid var(--float-border);
    border-radius: 14px;
    cursor: pointer;
    /* Inherit the menu's color so the line icons (currentColor) pick up the
       active pen color — buttons don't inherit color by default. */
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

  /* The selected brush reads from the button's purple ring/fill; its ink parts
     keep the current color (currentColor), so only tint non-color icons here. */
  .flyout-option.active :global(.action-icon:not(.icon-color) svg) {
    fill: var(--brand);
  }

  /* The eraser's Parent Center toggle hides its Brush Menu entry (the eraser
     lives in the flyout, not the top-level row). */
  :global(html[data-off-eraser]) #eraserButton {
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
