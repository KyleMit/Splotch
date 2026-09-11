<script lang="ts">
  import Icon from './Icon.svelte';
  import { scribbleTap } from '$lib/actions/scribbleGuard';
  import {
    COLOR_MENU_SWATCH_PX,
    COLOR_MENU_GAP_PX,
    COLOR_MENU_PADDING_PX,
    landscapeMenuColors,
    needsInkOutline,
  } from '$lib/landscapeToolbar';
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
  let availableSpace = $state<DOMRectReadOnly>();
  const visibleColors = $derived(landscapeMenuColors(availableSpace?.width ?? 0));
</script>

<!-- Measure the available space independently of the trimmed menu so it can grow again. -->
<div class="color-menu-space" aria-hidden="true" bind:contentRect={availableSpace}></div>
<div
  class="flyout-menu color-menu"
  aria-label="Colors"
  role="group"
  style:--color-swatch-size={`${COLOR_MENU_SWATCH_PX}px`}
  style:--color-menu-gap={`${COLOR_MENU_GAP_PX}px`}
  style:--color-menu-padding={`${COLOR_MENU_PADDING_PX}px`}
>
  {#each visibleColors as { hex, label } (hex)}
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
  .color-menu-space {
    position: absolute;
    height: 0;
    visibility: hidden;
    pointer-events: none;
    width: calc(
      100vw - var(--safe-area-left) - var(--safe-area-right) - var(--action-btn-size) - 24px
    );
  }
  .color-menu {
    padding: var(--color-menu-padding);
    gap: var(--color-menu-gap);
  }
  .color-option {
    width: var(--color-swatch-size);
    height: var(--color-swatch-size);
    flex: 0 0 auto;
    border: 0;
    border-radius: var(--radius-pill);
    cursor: pointer;
    touch-action: manipulation;
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
    width: var(--color-swatch-size);
    height: var(--color-swatch-size);
  }
</style>
