<script lang="ts">
  import Icon from './Icon.svelte';
  import { RELEASE_SECTION_ICONS } from '$lib/releaseSections';

  let { title, level }: { title: string; level: 2 | 3 } = $props();
  const icon = $derived(
    Object.entries(RELEASE_SECTION_ICONS).find(([section]) => section === title)?.[1]
  );
</script>

<svelte:element this={level === 2 ? 'h2' : 'h3'} class="release-section-heading">
  {#if icon}
    <Icon name={icon} class="release-section-icon" aria-hidden="true" />
  {/if}
  <span>{title}</span>
</svelte:element>

<style>
  .release-section-heading {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .release-section-heading :global(.release-section-icon) {
    width: var(--space-6);
    height: var(--space-6);
    flex-shrink: 0;
    color: var(--brand-text);
  }
</style>
