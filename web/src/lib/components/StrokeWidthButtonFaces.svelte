<script lang="ts">
  import Icon from './Icon.svelte';

  let { erasing }: { erasing: boolean } = $props();
</script>

<!-- The eraser face stays a reactive branch: the eraser is never persisted
     (lib/state/tool.svelte.ts), so `erasing` is false through SSR and first
     paint alike and only flips on a live interaction, which Svelte re-renders
     normally. The magic face can't work that way — the brush *is* persisted and
     seeded onto <html> pre-paint, so a reload while holding it renders the ink
     face on the server and wants the rainbow one on the client, and {@html}
     is not reconciled during hydration (.claude/rules/svelte.md). Both ink
     faces therefore stay in the DOM with CSS picking, as the Brush Button
     does. -->
{#if erasing}
  <Icon name="line-weight-eraser" class="action-icon" />
{:else}
  <span class="stroke-width-button-faces">
    <Icon name="line-weight-brush" class="action-icon" />
    <Icon name="line-weight-magic" class="action-icon" />
  </span>
{/if}

<style>
  .stroke-width-button-faces {
    display: contents;
  }

  .stroke-width-button-faces :global(.action-icon[data-icon='line-weight-magic']) {
    display: none;
  }

  :global(html[data-brush='magic'])
    :global(.actions-panel:not([data-action-panel-live]))
    .stroke-width-button-faces
    :global(.action-icon[data-icon='line-weight-brush']),
  :global(.actions-panel[data-action-panel-live][data-brush='magic'])
    .stroke-width-button-faces
    :global(.action-icon[data-icon='line-weight-brush']) {
    display: none;
  }

  :global(html[data-brush='magic'])
    :global(.actions-panel:not([data-action-panel-live]))
    .stroke-width-button-faces
    :global(.action-icon[data-icon='line-weight-magic']),
  :global(.actions-panel[data-action-panel-live][data-brush='magic'])
    .stroke-width-button-faces
    :global(.action-icon[data-icon='line-weight-magic']) {
    display: inline-flex;
  }
</style>
