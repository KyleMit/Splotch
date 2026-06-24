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

{@render children()}
