<script lang="ts">
  import Icon from '$lib/components/Icon.svelte';
  import '$lib/components/deferredIcons';
  import type { SECTIONS, SectionId } from './contents';

  let {
    section,
    copied,
    oncopy,
  }: {
    section: (typeof SECTIONS)[number];
    copied: boolean;
    oncopy: (event: MouseEvent, id: SectionId) => void;
  } = $props();
</script>

<div class="section-head">
  <h3>{section.label}</h3>
  <a
    class="section-anchor"
    class:copied
    href={`#${section.id}`}
    aria-label={`Copy link to “${section.label}”`}
    onclick={(event) => oncopy(event, section.id)}
  >
    <span class="section-anchor-blob" aria-hidden="true">
      {#if copied}<Icon
          name="check"
          style="width: var(--font-size-md); height: var(--font-size-md)"
        />{:else}#{/if}
    </span>
  </a>
</div>

<style>
  .section-head {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: 6px;
  }

  h3 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    color: var(--page-ink);
  }

  .section-anchor {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 44px;
    width: 44px;
    height: 44px;
    text-decoration: none;
  }

  .section-anchor-blob {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: var(--radius-blob-2);
    background: var(--brand-wash);
    color: var(--brand-text);
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-bold);
  }

  .copied .section-anchor-blob {
    background: var(--success-wash);
    color: var(--success-text);
  }

  .section-anchor-blob :global(svg) {
    fill: currentColor;
  }

  @media (hover: hover) {
    .section-anchor {
      opacity: 0;
      transition: opacity var(--duration-fast) var(--ease-glide);
    }

    .section-head:hover .section-anchor,
    .section-anchor:focus-visible,
    .section-anchor.copied {
      opacity: 1;
    }
  }

  @media (min-width: 921px) and (hover: hover) {
    .section-anchor {
      order: -1;
      margin-left: -56px;
    }
  }

  :global(:root[data-reduce-motion]) .section-anchor {
    transition: none;
  }
</style>
