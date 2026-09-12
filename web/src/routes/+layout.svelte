<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { ERROR_LOG_PREFIX } from '$lib/errorLog';
  import { warmDisplayFont } from '$lib/fonts';
  // Import the package's CSS entry explicitly: the bare specifier resolves to
  // index.css via the package's exports map, but only a path ending in `.css`
  // matches Vite's ambient `*.css` module type (so svelte-check stays happy).
  import '@fontsource-variable/quicksand/index.css';
  // Generated design tokens (gen:tokens, ADR-0071) load before app.css so the
  // global styles can reference them.
  import '../tokens.css';
  import '../app.css';

  interface Props {
    children: Snippet;
  }
  let { children }: Props = $props();

  onMount(warmDisplayFont);
</script>

<svelte:boundary onerror={(error) => console.error(ERROR_LOG_PREFIX.render, error)}>
  {@render children()}

  {#snippet failed(_error, reset)}
    <!-- Lazy so ErrorScreen's styles stay out of the root layout's critical CSS
         (this snippet only renders when the boundary catches a crash). -->
    {#await import('$lib/components/ErrorScreen.svelte') then { default: ErrorScreen }}
      <ErrorScreen onRestart={reset} />
    {/await}
  {/snippet}
</svelte:boundary>
