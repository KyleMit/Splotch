<script lang="ts">
  // Rendered by SvelteKit when a load function or navigation throws. Render-time
  // component crashes are caught separately by the <svelte:boundary> in +layout.
  // page.error.message is deliberately ignored — ErrorScreen owns the user-facing
  // copy. Its value is the error() body for expected 4xx throws and handleError's
  // returned message for unexpected failures.
  import ErrorScreen from '$lib/components/ErrorScreen.svelte';
</script>

<ErrorScreen />
