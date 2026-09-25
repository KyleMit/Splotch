<script lang="ts">
  import Icon from './Icon.svelte';
  import InkOrMagicIcon from './InkOrMagicIcon.svelte';
  import StrokeWidthMenu from './StrokeWidthMenu.svelte';
  import { playPressRelease, pressRelease } from '$lib/actions/pressRelease';
  import { scribbleTap } from '$lib/actions/scribbleGuard';
  import { setStrokeSize, activeStrokeSize, type StrokeSize } from '$lib/state/strokeWidth.svelte';
  import { toolState } from '$lib/state/tool.svelte';

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

  const erasing = $derived(toolState.brush === 'eraser');

  // The stroke-size lines preview the ink you'll lay down, tinted via
  // currentColor. Only the pen uses it — the eraser previews are theme-driven
  // "holes in the paper" (--paper / --hole-stroke), never color-tinted, so
  // they stay distinct from every pen color (including pink).
  const strokeMenuColor = $derived(activeColor);

  // The stroke-weight control drops the keylines while erasing — its icons
  // carry the eraser's own coloring then. The Brush Button keeps them: its
  // pen/crayon faces and menu entries preview the ink color even while the
  // eraser is active, and the eraser/magic icons hold no currentColor paths,
  // so the keyline rules are inert on them.
  const whiteStroke = $derived(!erasing && inkWhite);
  const darkStroke = $derived(!erasing && inkDark);

  function handleTrigger() {
    onOpenChange(!open);
  }

  function handleStrokeSizeClick(size: StrokeSize) {
    setStrokeSize(size);
    onOpenChange(false);
    if (triggerEl) playPressRelease(triggerEl);
  }
</script>

<div class="flyout-wrapper stroke-width-wrapper" bind:this={wrapperEl}>
  <button
    class="action-button"
    class:white-stroke={whiteStroke}
    class:dark-stroke={darkStroke}
    id="strokeWidthButton"
    style:--i="1"
    aria-label="Stroke width"
    aria-expanded={open}
    use:scribbleTap={handleTrigger}
    onclick={onTriggerClick}
    bind:this={triggerEl}
    use:pressRelease
    style:color={activeColor}
  >
    {#if erasing}
      <Icon name="line-weight-eraser" class="action-icon" />
    {:else}
      <InkOrMagicIcon ink="line-weight-brush" magic="line-weight-magic" class="action-icon" />
    {/if}
  </button>
  <StrokeWidthMenu
    {open}
    activeSize={activeStrokeSize()}
    {erasing}
    menuColor={strokeMenuColor}
    {whiteStroke}
    {darkStroke}
    onpick={handleStrokeSizeClick}
  />
</div>

<style>
  /* StrokeWidthMenu positions absolutely against this wrapper. This duplicate
     belongs here because ActionsPanel's scoped styles cannot reach child
     component DOM. */
  .flyout-wrapper {
    position: relative;
  }

  :global(html[data-off-stroke] .actions-panel:not([data-action-panel-live])) .stroke-width-wrapper,
  :global(.actions-panel[data-action-panel-live][data-off-stroke]) .stroke-width-wrapper {
    display: none;
  }
</style>
