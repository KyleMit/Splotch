<script lang="ts">
  import { onMount } from 'svelte';
  // Import the package's CSS entry explicitly: the bare specifier resolves to
  // index.css via the package's exports map, but only a path ending in `.css`
  // matches Vite's ambient `*.css` module type (so svelte-check stays happy).
  import '@fontsource-variable/quicksand/index.css';
  import '../app.css';

  interface Props {
    children: import('svelte').Snippet;
  }
  let { children }: Props = $props();

  // @font-face only fetches a font when text using it is first painted. The
  // drawing screen has no visible text, so Quicksand wouldn't download until a
  // text-bearing dialog (Parent Center, AI prompts) first opens — flashing the
  // system fallback for a beat. Warm it in the background at boot so it's ready.
  onMount(() => {
    if ('fonts' in document) {
      document.fonts.load('1em "Quicksand Variable"').catch(() => {});
    }
  });
</script>

<svelte:boundary onerror={(error) => console.error('[render error]', error)}>
  {@render children()}

  {#snippet failed(_error, reset)}
    <!-- Lazy so ErrorScreen's styles stay out of the root layout's critical CSS
         (this snippet only renders when the boundary catches a crash). -->
    {#await import('$lib/components/ErrorScreen.svelte') then { default: ErrorScreen }}
      <ErrorScreen onRestart={reset} />
    {/await}
  {/snippet}
</svelte:boundary>
