<script lang="ts">
  import { onMount } from 'svelte';
  // Import the package's CSS entry explicitly: the bare specifier resolves to
  // index.css via the package's exports map, but only a path ending in `.css`
  // matches Vite's ambient `*.css` module type (so svelte-check stays happy).
  import '@fontsource-variable/quicksand/index.css';
  // The latin subset's hashed asset URL. `?url` resolves to the *same* built
  // file index.css's @font-face references, so preloading it and later using it
  // is one fetch, not two. Only the latin subset is preloaded — the latin-ext
  // and vietnamese @font-face subsets never match the app's text, so they're
  // never fetched at all.
  import quicksandLatinUrl from '@fontsource-variable/quicksand/files/quicksand-latin-wght-normal.woff2?url';
  // Generated design tokens (gen:tokens, ADR-0071) load before app.css so the
  // global styles can reference them.
  import '../tokens.css';
  import '../app.css';

  interface Props {
    children: import('svelte').Snippet;
  }
  let { children }: Props = $props();

  // @font-face only fetches a font when text using it is first painted. The
  // drawing screen has no visible text, so without a hint Quicksand wouldn't
  // download until a text-bearing dialog (Parent Center, AI prompts) first
  // opens — flashing the system fallback for a beat, and (measured) not landing
  // until ~3.9s. The <svelte:head> preload below makes the browser discover and
  // fetch it during the initial HTML parse instead. The warm-up here then just
  // *activates* the already-fetched face (resolving from the preload cache), so
  // the preloaded bytes count as used — no "preloaded but not used" warning —
  // and the font is guaranteed ready before the first dialog paints.
  onMount(() => {
    if ('fonts' in document) {
      document.fonts.load('1em "Quicksand Variable"').catch(() => {});
    }
  });
</script>

<svelte:head>
  <link
    rel="preload"
    href={quicksandLatinUrl}
    as="font"
    type="font/woff2"
    crossorigin="anonymous"
  />
</svelte:head>

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
