<!--
  Stands in for the Parent Center controls in the wide shell, where every section
  is scrolled past rather than opened: without it a child could reach the
  protections themselves just by scrolling (ADR-0094 puts the gate at the
  operation boundary, and reaching these controls is that boundary).
-->
<script lang="ts">
  import Button from '../design/Button.svelte';

  interface Props {
    onUnlock: (trigger: HTMLElement) => void;
  }

  let { onUnlock }: Props = $props();
</script>

<div class="setting-group">
  <div class="setting parent-center-lock">
    <p>
      Parent Center decides when Splotch asks for a grown-up check, so it waits behind one itself.
    </p>
    <Button variant="brand" onclick={(event) => onUnlock(event.currentTarget)}>
      Unlock these settings
    </Button>
  </div>
</div>

<style>
  .parent-center-lock {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
  }

  .parent-center-lock p {
    margin: 0;
    color: var(--text-soft);
    font-size: var(--font-size-sm);
    line-height: 1.5;
  }
</style>
