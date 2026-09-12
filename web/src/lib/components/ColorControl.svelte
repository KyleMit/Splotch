<script lang="ts">
  import Icon from './Icon.svelte';
  import { settings } from '$lib/state/settings.svelte';
  import { visibleActionButtonCount } from '$lib/actionButtonLayout';
  import { PHONE_LANDSCAPE_QUERY } from '$lib/breakpoints';
  import ColorMenu from './ColorMenu.svelte';
  import { colorFoldGesture } from '$lib/actions/colorFoldGesture';
  import {
    colors,
    isWhite,
    selectPaletteColor,
    selectCustomSwatch,
    isDarkInk,
  } from '$lib/state/colors.svelte';
  import { selectInkBrush } from '$lib/state/tool.svelte';
  import { releaseAllPointers } from '$lib/drawing/engine';
  import { colorPickerModal } from '$lib/state/ui.svelte';
  import { buttonCenter } from '$lib/state/modal.svelte';

  let {
    open,
    onOpenChange,
    onfold,
    wrapperEl = $bindable(),
    triggerEl = $bindable(),
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onfold: () => void;
    wrapperEl?: HTMLDivElement;
    triggerEl?: HTMLButtonElement;
  } = $props();

  function fold(folded: boolean) {
    if (
      !matchMedia(PHONE_LANDSCAPE_QUERY).matches ||
      !settings.advancedControlsEnabled ||
      visibleActionButtonCount() === 0
    )
      return;
    if (settings.drawerOpen === folded) onfold();
  }

  function toggle() {
    releaseAllPointers();
    triggerEl?.focus();
    onOpenChange(!open);
  }

  function pick(hex: string, paint: string) {
    selectInkBrush();
    selectPaletteColor(hex, paint);
    releaseAllPointers();
    onOpenChange(false);
  }

  function custom() {
    selectInkBrush();
    selectCustomSwatch();
    onOpenChange(false);
    colorPickerModal.show(triggerEl ? buttonCenter(triggerEl) : null);
    releaseAllPointers();
  }
</script>

<div class="flyout-wrapper color-wrapper" bind:this={wrapperEl}>
  <button
    id="colorButton"
    class="action-button color-button"
    class:ink-outlined={isDarkInk(colors.activeColor)}
    class:white-stroke={isWhite(colors.activeColor)}
    style:color={colors.activeColor}
    aria-label="Colors"
    aria-expanded={open}
    bind:this={triggerEl}
    use:colorFoldGesture={{ tap: toggle, fold }}
  >
    <Icon name="ink-splotch" class="color-icon" />
  </button>
  {#if open}
    <ColorMenu onpick={pick} oncustom={custom} />
  {/if}
</div>
