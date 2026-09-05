<script lang="ts">
  import BrushButtonFaces from './BrushButtonFaces.svelte';
  import BrushMenu from './BrushMenu.svelte';
  import { scribbleTap } from '$lib/actions/scribbleGuard';
  import { enabledOptionalBrushes } from '$lib/state/settings.svelte';
  import { BRUSH_OPTIONS, selectBrush, toolState, type BrushType } from '$lib/state/tool.svelte';

  let {
    open,
    activeColor,
    inkWhite,
    inkDark,
    wrapperEl = $bindable(),
    triggerEl = $bindable(),
    onOpenChange,
    onTriggerClick,
  }: {
    open: boolean;
    activeColor: string;
    inkWhite: boolean;
    inkDark: boolean;
    wrapperEl?: HTMLDivElement;
    triggerEl?: HTMLButtonElement;
    onOpenChange: (open: boolean) => void;
    onTriggerClick: (event: MouseEvent & { currentTarget: HTMLButtonElement }) => void;
  } = $props();

  const optionalBrushes = $derived(enabledOptionalBrushes());
  const singleOptionalBrush = $derived(optionalBrushes.length === 1 ? optionalBrushes[0] : null);
  const singleOptionalBrushLabel = $derived(
    BRUSH_OPTIONS.find((option) => option.brush === singleOptionalBrush)?.label
  );

  $effect(() => {
    if (optionalBrushes.length < 2 && open) onOpenChange(false);
  });

  function handleTrigger() {
    if (singleOptionalBrush) {
      selectBrush(toolState.brush === singleOptionalBrush ? 'pen' : singleOptionalBrush);
      onOpenChange(false);
      return;
    }
    onOpenChange(!open);
  }

  function handlePick(brush: BrushType) {
    selectBrush(brush);
    onOpenChange(false);
  }
</script>

<div class="flyout-wrapper brush-wrapper" bind:this={wrapperEl}>
  <button
    class="action-button"
    class:active={singleOptionalBrush && toolState.brush === singleOptionalBrush}
    class:white-stroke={inkWhite}
    class:dark-stroke={inkDark}
    id="brushButton"
    aria-label={singleOptionalBrushLabel ?? 'Brushes'}
    aria-expanded={optionalBrushes.length > 1 ? open : undefined}
    aria-pressed={singleOptionalBrush ? toolState.brush === singleOptionalBrush : undefined}
    use:scribbleTap={handleTrigger}
    onclick={onTriggerClick}
    bind:this={triggerEl}
    style:color={activeColor}
  >
    <BrushButtonFaces />
  </button>
  <BrushMenu
    {open}
    {activeColor}
    {inkWhite}
    {inkDark}
    enabledOptionalBrushes={optionalBrushes}
    onpick={handlePick}
  />
</div>

<style>
  /* BrushMenu positions absolutely against this wrapper. This duplicate belongs
     here because ActionsPanel's scoped styles cannot reach child component DOM. */
  .flyout-wrapper {
    position: relative;
  }

  .action-button {
    /* The trigger scales on press; pre-promotion prevents the first pressed
       frame from paying layer creation inside the interaction budget. */
    will-change: transform;
  }

  :global(
      html[data-off-crayon][data-off-magic][data-off-eraser]
        .actions-panel:not([data-action-panel-live])
    )
    .brush-wrapper,
  :global(.actions-panel[data-action-panel-live][data-off-crayon][data-off-magic][data-off-eraser])
    .brush-wrapper {
    display: none;
  }
</style>
