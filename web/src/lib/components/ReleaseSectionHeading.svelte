<script lang="ts">
  import Icon from './Icon.svelte';
  import { RELEASE_SECTION_ICONS, type ReleaseSection } from '$lib/releaseSections';

  let { title, level }: { title: ReleaseSection; level: 3 | 4 | 5 } = $props();
  const icon = $derived(RELEASE_SECTION_ICONS[title]);
</script>

<svelte:element this={`h${level}`} class="release-section-heading">
  <Icon name={icon} class="release-section-icon" aria-hidden="true" />
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
