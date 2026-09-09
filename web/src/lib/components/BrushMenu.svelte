<script lang="ts">
  import { isStrokeActive } from '$lib/drawing/engine';
  import Icon from './Icon.svelte';
  import {
    toolState,
    BRUSH_OPTIONS,
    type BrushType,
    type OptionalBrushType,
  } from '$lib/state/tool.svelte';
  import { scribbleTap } from '$lib/actions/scribbleGuard';

  // Presentational Brush Menu popover: the parent (ActionsPanel) owns the
  // trigger, the open/close coordination, and the outside-click handling; this
  // renders the four brush entries and reports a pick back through onpick.
  let {
    open,
    activeColor,
    inkWhite,
    inkDark,
    enabledOptionalBrushes,
    onpick,
  }: {
    open: boolean;
    activeColor: string;
    inkWhite: boolean;
    inkDark: boolean;
    enabledOptionalBrushes: OptionalBrushType[];
    onpick: (brush: BrushType) => void;
  } = $props();

  const visibleBrushes = $derived(
    BRUSH_OPTIONS.filter(
      (option) => option.brush === 'pen' || enabledOptionalBrushes.includes(option.brush)
    )
  );
</script>

<!-- The pen and crayon icons draw their ink parts in currentColor, so the menu
     carries the active color the way the stroke-width control does (the
     magic/eraser icons ignore it — no currentColor). -->
{#if open}
  <div
    class="flyout-menu brush-menu"
    class:white-stroke={inkWhite}
    class:dark-stroke={inkDark}
    class:motionless={isStrokeActive()}
    style:color={activeColor}
  >
    {#each visibleBrushes as opt, index (opt.brush)}
      <button
        class="flyout-option"
        style:--i={index}
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
{/if}

<style>
  /* The .flyout-menu / .flyout-option chrome is shared with StrokeWidthMenu and
     lives in app.css; only the brush-specific rules stay here. */

  :global(html[data-off-crayon] .actions-panel:not([data-action-panel-live])) #crayonBrushButton,
  :global(.actions-panel[data-action-panel-live][data-off-crayon]) #crayonBrushButton,
  :global(html[data-off-magic] .actions-panel:not([data-action-panel-live])) #magicBrushButton,
  :global(.actions-panel[data-action-panel-live][data-off-magic]) #magicBrushButton,
  :global(html[data-off-eraser] .actions-panel:not([data-action-panel-live])) #eraserButton,
  :global(.actions-panel[data-action-panel-live][data-off-eraser]) #eraserButton {
    display: none;
  }
</style>
