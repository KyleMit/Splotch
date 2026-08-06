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

  /* The eraser's toggle in Settings hides its Brush Menu entry. The root seed
     owns first paint; the hydrated panel owns live changes. */
  :global(html[data-off-eraser] .actions-panel:not([data-action-panel-live])) #eraserButton,
  :global(.actions-panel[data-action-panel-live][data-off-eraser]) #eraserButton {
    display: none;
  }
</style>
