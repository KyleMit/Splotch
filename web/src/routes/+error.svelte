<script lang="ts">
  // Rendered by SvelteKit when a load function or navigation throws. Render-time
  // component crashes are caught separately by the <svelte:boundary> in +layout.
  // page.error.message is deliberately ignored — each screen owns the user-facing
  // copy. Its value is the error() body for expected 4xx throws and handleError's
  // returned message for unexpected failures.
  import { page } from '$app/state';
  import ErrorScreen from '$lib/components/ErrorScreen.svelte';
  import NotFoundPage from '$notFoundPage';
</script>

{#if page.status === 404}
  <NotFoundPage />
{:else}
  <ErrorScreen />
{/if}
