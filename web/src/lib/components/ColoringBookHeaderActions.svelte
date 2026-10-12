<script lang="ts">
  import { coloringBookModal } from '$lib/state/ui.svelte';
  import type { ColoringPage, ResponsiveColoringImage } from '$lib/state/books';
  import ActivePageChip from './ActivePageChip.svelte';

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
