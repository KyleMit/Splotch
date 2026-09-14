<script lang="ts">
  import { browser } from '$app/environment';

  // Throws only in the browser: the server renders the page whole, with the
  // title below, and hydration then crashes into the root layout's
  // <svelte:boundary>. That is the one error path +error.svelte never sees,
  // so tests/error-screen.spec.ts drives it through this harness to prove the
  // error screen replaces the crashed route's title.
  if (browser) throw new Error('dev crash harness');
</script>

<svelte:head>
  <title>Crash harness · Splotch dev</title>
</svelte:head>

<p>This page crashes on hydration.</p>
