<script lang="ts">
  import Icon from './Icon.svelte';
  import { scribbleTap } from '$lib/actions/scribbleGuard';
  import {
    COLOR_MENU_SWATCH_PX,
    COLOR_MENU_GAP_PX,
    COLOR_MENU_PADDING_PX,
    landscapeMenuColors,
  } from '$lib/landscapeToolbar';
  import { colors, isDarkInk, themedSwatchColor } from '$lib/state/colors.svelte';
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
  let availableWidth = $state(0);
  const visibleColors = $derived(landscapeMenuColors(availableWidth));

  // Keep fractional widths without adding Svelte's generic size bindings to startup.
  function measureSpace(node: HTMLElement) {
    const observer = new ResizeObserver(([entry]) => {
      availableWidth = entry.contentRect.width;
    });
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }
</script>

<!-- Measure the available space independently of the trimmed menu so it can grow again. -->
<div class="color-menu-space" aria-hidden="true" use:measureSpace></div>
<div
  class="flyout-menu color-menu"
  aria-label="Colors"
  role="group"
  style={`--swatch:${COLOR_MENU_SWATCH_PX}px;--gap:${COLOR_MENU_GAP_PX}px;--padding:${COLOR_MENU_PADDING_PX}px`}
>
  {#each visibleColors as { hex, label } (hex)}
    {@const paint = themedSwatchColor(hex, dark)}
    <button
      class="color-option"
      class:outlined={isDarkInk(paint)}
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
    width: calc(
      100vw - var(--safe-area-left) - var(--safe-area-right) - var(--action-btn-size) - 24px
    );
  }
  .color-menu {
    padding: var(--padding);
    gap: var(--gap);
  }
  .color-option {
    width: var(--swatch);
    height: var(--swatch);
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
    width: var(--swatch);
    height: var(--swatch);
  }
</style>
