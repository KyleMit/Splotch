<script module lang="ts">
  import chevronLeft from '$lib/icons/deferred/chevron-left.svg?raw';
  import external from '$lib/icons/deferred/external.svg?raw';

  // The eager web error entry needs these glyphs without registering every lazy icon.
  export const PAGE_ICON_MARKUP = { 'chevron-left': chevronLeft, external };
</script>

<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  let {
    name,
    class: className,
    ...rest
  }: HTMLAttributes<HTMLSpanElement> & { name: keyof typeof PAGE_ICON_MARKUP } = $props();
</script>

<!-- eslint-disable svelte/no-at-html-tags -- markup is a first-party SVG imported as a build-time string -->
<span class={className} {...rest} data-icon={name}>{@html PAGE_ICON_MARKUP[name]}</span>

<style>
  span {
    display: inline-flex;
    line-height: 0;
  }
  span :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
