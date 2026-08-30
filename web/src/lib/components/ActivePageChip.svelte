<script lang="ts">
  import Icon from './Icon.svelte';
  import {
    COLORING_IMAGE_SIZES,
    type ColoringPage,
    type ResponsiveColoringImage,
  } from '$lib/state/books';

  interface Props {
    page: ColoringPage;
    preview: ResponsiveColoringImage;
    hoverArmed: boolean;
    onclear: () => void;
  }

  let { page, preview, hoverArmed, onclear }: Props = $props();
</script>

<button
  class="active-page-chip"
  class:hover-armed={hoverArmed}
  type="button"
  aria-label="Clear active coloring page: {page.name}"
  onclick={onclear}
>
  <img
    class="active-page-thumbnail"
    src={preview.src}
    srcset={__IS_CAPACITOR__ ? undefined : preview.srcset}
    sizes={__IS_CAPACITOR__ ? undefined : COLORING_IMAGE_SIZES.activePageChip}
    alt=""
  />
  <span class="active-page-name">{page.name}</span>
  <span class="active-page-clear" aria-hidden="true">
    <Icon name="close" class="active-page-clear-icon" />
  </span>
</button>

<style>
  /* The raw dimensions are control sizing: the pill keeps the platform's 44px
     touch-target floor while the thumbnail and clear mark stay visibly nested. */
  .active-page-chip {
    --active-page-thumbnail-size: 36px;
    --active-page-clear-size: 28px;
    height: var(--modal-close-size);
    flex: 0 0 auto;
    overflow: hidden;
    padding: var(--space-1);
    background: var(--surface-2);
    border: var(--border-width) solid var(--border-warm);
    border-radius: var(--radius-pill);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    touch-action: manipulation;
    transition:
      border-color var(--duration-base) ease,
      background var(--duration-base) ease;
  }

  .active-page-chip:active {
    transform: scale(0.92);
  }

  .active-page-thumbnail {
    width: var(--active-page-thumbnail-size);
    height: var(--active-page-thumbnail-size);
    flex: 0 0 var(--active-page-thumbnail-size);
    display: block;
    object-fit: contain;
    pointer-events: none;
  }

  .active-page-name {
    max-width: 12ch;
    overflow: hidden;
    color: var(--text);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .active-page-clear {
    width: var(--active-page-clear-size);
    height: var(--active-page-clear-size);
    flex: 0 0 var(--active-page-clear-size);
    padding: var(--space-1);
    border-radius: 50%;
    background: var(--danger-wash);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  :global(.active-page-clear-icon) {
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  :global(.active-page-clear-icon svg) {
    fill: var(--danger-text);
  }

  @media (hover: hover) {
    .active-page-chip.hover-armed:hover {
      background: var(--brand-wash);
      border-color: var(--brand);
    }
  }

  @media (max-width: 360px) {
    .active-page-name {
      display: none;
    }
  }
</style>
