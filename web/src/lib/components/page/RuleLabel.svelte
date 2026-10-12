<script lang="ts">
  import RuleLabel from '$lib/components/design/RuleLabel.svelte';
  import type { ComponentProps } from 'svelte';

  let props: ComponentProps<typeof RuleLabel> = $props();
</script>

<div class="page-rule-label">
  <RuleLabel {...props} />
</div>

<style>
  /* The page adapter owns section spacing; the primitive also serves compact
     specimens. Low specificity preserves existing page-owned spacing overrides. */
  :where(.page-rule-label) :global(:where(.rule-label)) {
    padding-bottom: var(--space-5);
  }
</style>
