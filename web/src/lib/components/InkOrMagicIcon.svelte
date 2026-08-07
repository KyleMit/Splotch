<script lang="ts">
  import Icon from './Icon.svelte';
  import type { CommonIconName } from './iconTypes';

  // An icon with two faces: the ink one, and the one the magic brush wears.
  //
  // This can't be `<Icon name={magic ? a : b}>`. Icon.svelte renders its SVG
  // through {@html}, which hydration does not reconcile, and the magic brush is
  // persisted and seeded onto <html> pre-paint — so on a reload while holding
  // it the server renders the ink face and the client's first value is the
  // magic one, the exact mismatch {@html} will not repair. Both faces therefore
  // stay in the DOM and CSS picks, as BrushButtonFaces does for the Brush
  // Button. The eraser needs none of this: it is deliberately never persisted
  // (lib/state/tool.svelte.ts), so it can only appear through a live
  // interaction after hydration and a plain reactive branch is safe.
  let {
    ink,
    magic,
    class: className,
  }: { ink: CommonIconName; magic: CommonIconName; class?: string } = $props();
</script>

<span class="ink-or-magic-icon">
  <Icon name={ink} class={className} data-face="ink" />
  <Icon name={magic} class={className} data-face="magic" />
</span>

<style>
  .ink-or-magic-icon {
    display: contents;
  }

  .ink-or-magic-icon :global([data-face='magic']) {
    display: none;
  }

  /* Two selectors per face because the seed moves: app.html stamps [data-brush]
     on <html> before first paint, and the panel republishes it on itself once
     hydrated (data-action-panel-live). Same pairing as BrushButtonFaces. */
  :global(html[data-brush='magic'])
    :global(.actions-panel:not([data-action-panel-live]))
    .ink-or-magic-icon
    :global([data-face='ink']),
  :global(.actions-panel[data-action-panel-live][data-brush='magic'])
    .ink-or-magic-icon
    :global([data-face='ink']) {
    display: none;
  }

  :global(html[data-brush='magic'])
    :global(.actions-panel:not([data-action-panel-live]))
    .ink-or-magic-icon
    :global([data-face='magic']),
  :global(.actions-panel[data-action-panel-live][data-brush='magic'])
    .ink-or-magic-icon
    :global([data-face='magic']) {
    display: inline-flex;
  }
</style>
