<script lang="ts">
  import { coloringBookModal } from '$lib/state/ui.svelte';
  import type { ColoringPage, ResponsiveColoringImage } from '$lib/state/books';
  import ActivePageChip from './ActivePageChip.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    activePage: ColoringPage | null;
    activePagePreview: ResponsiveColoringImage | null;
    hoverArmed: boolean;
    onclear: () => void;
  }

  let { activePage, activePagePreview, hoverArmed, onclear }: Props = $props();
</script>

{#if coloringBookModal.open && activePage && activePagePreview}
  <ActivePageChip page={activePage} preview={activePagePreview} {hoverArmed} {onclear} />
{/if}
<button
  class="coloring-book-close modal-close-btn"
  aria-label="Close"
  onclick={coloringBookModal.hide}
>
  <Icon name="close" class="modal-close-icon" />
</button>

<style>
  .coloring-book-close {
    /* The chip and close disc share this header row, so this modal opts out of
       the global close button's absolute corner positioning. */
    position: static;
    flex: 0 0 var(--modal-close-size);
    transition: opacity var(--duration-base) ease;
    z-index: 1;
  }
</style>
