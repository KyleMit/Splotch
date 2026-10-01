<script lang="ts">
  import { DRAWING_ROUTE } from '$lib/boot/appSurfaceRoute';
  import ErrorScreen from '../ErrorScreen.svelte';
  const page = import('./NotFoundPage.svelte');
</script>

<!-- The pending entry cannot import the full page without undoing its lazy
     bundle boundary. NativeNotFoundPage.ssr.test.ts guards the shared title. -->
<svelte:head>
  {#await page}
    <title>Page not found · Splotch</title>
    <meta name="robots" content="noindex" />
  {:then}
    <!-- The loaded page owns its head. -->
  {:catch}
    <!-- Head awaits also need a catch to avoid rethrowing the import rejection. -->
  {/await}
</svelte:head>

{#await page}
  <main class="not-found-loading">
    <h1>Page not found</h1>
    <a href={DRAWING_ROUTE}>Start drawing</a>
  </main>
{:then module}
  {@const NotFoundPage = module.default}
  <NotFoundPage />
{:catch}
  <ErrorScreen />
{/await}

<style>
  .not-found-loading {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-6);
    padding: var(--space-6);
    background: var(--app-bg);
    color: var(--text-strong);
  }

  h1 {
    margin: 0;
    font-size: var(--font-size-xl);
  }

  a {
    padding: var(--space-3) var(--space-4);
    color: var(--brand-text);
  }
</style>
