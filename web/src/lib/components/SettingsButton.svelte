<script lang="ts">
  import Icon from './Icon.svelte';
  import { settingsModal, SETTINGS_BUTTON_ID } from '$lib/state/ui.svelte';
  import { buttonCenter } from '$lib/state/modal.svelte';

  let buttonEl: HTMLButtonElement;

  // Deliberately ungated: opening Settings is not a parental gate and must
  // never be treated as proof of adulthood (ADR-0094). Sensitive operations
  // inside gate themselves at their own boundary.
  function openModal() {
    if (!buttonEl) return;
    settingsModal.show(buttonCenter(buttonEl));
  }
</script>

<button
  class="settings-button corner-button"
  id={SETTINGS_BUTTON_ID}
  aria-label="Settings"
  bind:this={buttonEl}
  onclick={openModal}
>
  <Icon name="settings" class="corner-button-icon" aria-label="Settings" role="img" />
</button>

<style>
  .settings-button {
    position: fixed;
    bottom: calc(var(--space-2) + var(--safe-area-bottom));
    right: calc(var(--space-2) + var(--safe-area-right));
    z-index: var(--z-corner-button);
  }
</style>
