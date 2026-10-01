<script lang="ts">
  import ErrorScreen from '../ErrorScreen.svelte';
  const page = import('./NotFoundPage.svelte');
</script>

{#await page}
  <ErrorScreen />
{:then module}
  {@const NotFoundPage = module.default}
  <NotFoundPage />
{:catch}
  <ErrorScreen />
{/await}
