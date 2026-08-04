<script lang="ts">
  import Icon from './Icon.svelte';
  import { settingsModal, buttonCenter, SETTINGS_BUTTON_ID } from '$lib/state/ui.svelte';
  import { requireParentalGate } from '$lib/state/parentalGate.svelte';

  let buttonEl: HTMLButtonElement;

  // Settings is a grown-ups area, so the tap runs through the parental gate;
  // both the gate and Settings fly in from the gear.
  function openModal() {
    if (!buttonEl) return;
    const origin = buttonCenter(buttonEl);
    requireParentalGate(() => settingsModal.show(origin), origin);
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
    bottom: calc(var(--space-2) + env(safe-area-inset-bottom));
    right: calc(var(--space-2) + env(safe-area-inset-right));
    color: #999;
    z-index: var(--z-corner-button);
  }
</style>
