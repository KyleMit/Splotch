<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '../Icon.svelte';
  import { runSingleFlightActivation } from '$lib/actions/pressFeedback';

  interface Props {
    children?: Snippet;
    actions?: Snippet;
    onback?: (event: MouseEvent & { currentTarget: HTMLButtonElement }) => void;
    onclose: () => void;
    closeLabel?: string;
    closeClass?: string;
    closeFeedback?: boolean;
  }

  let {
    children,
    actions,
    onback,
    onclose,
    closeLabel = 'Close',
    closeClass = '',
    closeFeedback = false,
  }: Props = $props();

  function close(event: MouseEvent & { currentTarget: HTMLButtonElement }) {
    if (closeFeedback) void runSingleFlightActivation(event.currentTarget, onclose);
    else onclose();
  }
</script>

{#snippet control(
  icon: 'chevron-left' | 'close',
  label: string,
  onclick: (event: MouseEvent & { currentTarget: HTMLButtonElement }) => void
)}
  <button
    type="button"
    class="dialog-header-control {icon === 'close'
      ? `modal-close-btn ${closeClass}`
      : 'dialog-back'}"
    aria-label={label}
    {onclick}
  >
    <Icon name={icon} class="modal-close-icon" />
  </button>
{/snippet}

<header class="dialog-header" class:floating={!children}>
  {#if onback}{@render control('chevron-left', 'Back', onback)}{/if}
  {#if children}<div class="heading">{@render children()}</div>{/if}
  {@render actions?.()}
  {@render control('close', closeLabel, close)}
</header>

<style>
  .dialog-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    min-width: 0;
    flex-shrink: 0;
  }

  .heading {
    flex: 1;
    min-width: 0;
  }

  .dialog-header-control {
    position: static;
    flex: 0 0 var(--modal-close-size);
  }

  .floating {
    display: contents;
  }

  .floating .dialog-header-control {
    position: absolute;
  }
</style>
