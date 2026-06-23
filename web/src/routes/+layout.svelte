<script lang="ts">
  // Import the package's CSS entry explicitly: the bare specifier resolves to
  // index.css via the package's exports map, but only a path ending in `.css`
  // matches Vite's ambient `*.css` module type (so svelte-check stays happy).
  import '@fontsource-variable/quicksand/index.css';
  import '../app.css';

  interface Props {
    children: import('svelte').Snippet;
  }
  let { children }: Props = $props();
</script>

{@render children()}
