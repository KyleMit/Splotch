<script lang="ts">
  import Button from '$lib/components/design/Button.svelte';
  import Disclosure from '$lib/components/design/Disclosure.svelte';
  import StatusMessage from '$lib/components/design/StatusMessage.svelte';

  const buttonVariants = ['brand', 'wash', 'danger', 'ghost'] as const;
  const buttonSizes = ['md', 'sm'] as const;
  const statusMessageStatuses = ['success', 'error'] as const;
</script>

<section>
  <h2>Button</h2>
  <p><code>lib/components/design/Button.svelte</code></p>
  {#each buttonSizes as size (size)}
    <div class="button-row">
      {#each buttonVariants as variant (variant)}
        <Button {variant} {size}>{variant} {size}</Button>
      {/each}
      <Button variant="brand" {size} disabled>disabled</Button>
    </div>
  {/each}
</section>

<section>
  <h2>Status message</h2>
  <p><code>lib/components/design/StatusMessage.svelte</code></p>
  {#each statusMessageStatuses as status (status)}
    <StatusMessage {status}
      >The {status} wash, as a form shows it after a submit resolves.</StatusMessage
    >
  {/each}
</section>

<section>
  <h2>Disclosure</h2>
  <p><code>lib/components/design/Disclosure.svelte</code></p>
  <Disclosure class="disclosure-demo">
    {#snippet summary()}What does the primitive own?{/snippet}
    <p class="disclosure-demo-body">
      The bordered shell, the hidden native marker, and the <code>›</code> chevron that rotates on
      open. Padding, type, color, and background stay with the call site, through the forwarded
      <code>class</code>.
    </p>
  </Disclosure>
</section>

<style>
  section {
    margin-top: var(--space-8);
  }

  section > p {
    max-width: 60ch;
    margin: var(--space-2) 0 var(--space-3);
    font-size: var(--font-size-md);
  }

  h2 {
    color: var(--text-strong);
    font-size: var(--font-size-xl);
    margin-bottom: var(--space-2);
  }

  code {
    font-size: var(--font-size-xs);
    color: var(--brand-text);
  }

  section :global(.disclosure-demo summary) {
    padding: var(--space-3);
    font-size: var(--font-size-md);
    font-weight: 600;
    color: var(--brand-text);
    background: var(--surface-2);
  }

  .disclosure-demo-body {
    margin: 0;
    padding: 0 var(--space-3) var(--space-3);
    font-size: var(--font-size-sm);
    line-height: 1.5;
    color: var(--text-mid);
  }

  .button-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }
</style>
