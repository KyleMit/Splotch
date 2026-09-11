<script lang="ts">
  import Icon from './Icon.svelte';
  import { scribbleTap } from '$lib/actions/scribbleGuard';
  import { LANDSCAPE_COLORS, needsInkOutline } from '$lib/landscapeToolbar';
  import { colors, themedSwatchColor } from '$lib/state/colors.svelte';
  import { resolvedTheme } from '$lib/state/appearance.svelte';
  import { toolState } from '$lib/state/tool.svelte';

  let {
    onpick,
    oncustom,
  }: {
    onpick: (hex: string, paint: string) => void;
    oncustom: () => void;
  } = $props();
  const dark = $derived(resolvedTheme() === 'dark');
</script>

<div class="flyout-menu color-menu" aria-label="Colors" role="group">
  {#each LANDSCAPE_COLORS as { hex, label } (hex)}
    {@const paint = themedSwatchColor(hex, dark)}
    <button
      class="color-option"
      class:outlined={needsInkOutline(paint)}
      style:background={paint}
      aria-label={paint === hex ? label : 'White'}
      aria-pressed={toolState.brush !== 'eraser' && colors.activeSwatch === hex}
      use:scribbleTap={() => onpick(hex, paint)}
    ></button>
  {/each}
  <button class="color-option more-colors" aria-label="Custom Color" use:scribbleTap={oncustom}>
    <Icon name="more-colors" />
  </button>
</div>

<style>
  .color-menu {
    max-width: calc(
      100vw - var(--safe-area-left) - var(--safe-area-right) - var(--action-btn-size) - 24px
    );
    overflow-x: auto;
    overscroll-behavior: contain;
    touch-action: pan-x;
    padding: 6px;
    gap: 6px;
  }
  .color-option {
    width: 56px;
    height: 56px;
    flex: 0 0 auto;
    border: 0;
    border-radius: var(--radius-pill);
    cursor: pointer;
    touch-action: pan-x;
  }
  .color-option.outlined {
    box-shadow: 0 0 0 2px var(--dark-ink-keyline);
  }
  .color-option[aria-pressed='true'] {
    outline: 3px solid var(--text-strong);
    outline-offset: 3px;
  }
  .more-colors {
    background: transparent;
    display: grid;
    place-items: center;
  }
  .more-colors :global(span) {
    width: 56px;
    height: 56px;
  }
</style>
