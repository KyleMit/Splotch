<script lang="ts">
  import Icon from './Icon.svelte';
  import { parentCenter, buttonCenter, PARENT_HELP_BUTTON_ID } from '$lib/state/ui.svelte';

  let buttonEl: HTMLButtonElement;

  function openModal() {
    if (!buttonEl) return;
    parentCenter.show(buttonCenter(buttonEl));
  }
</script>

<button
  class="parent-help-button corner-button"
  id={PARENT_HELP_BUTTON_ID}
  aria-label="Parent Center"
  bind:this={buttonEl}
  onclick={openModal}
>
  <Icon name="parent" class="corner-button-icon" aria-label="Parent Center" role="img" />
</button>

<style>
  .parent-help-button {
    position: fixed;
    bottom: calc(8px + env(safe-area-inset-bottom));
    right: calc(8px + env(safe-area-inset-right));
    width: 48px;
    height: 48px;
    color: #999;
    z-index: var(--z-corner-button);
  }
</style>
