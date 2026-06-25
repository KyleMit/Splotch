<script lang="ts">
  import Icon from './Icon.svelte';
  import { ui, openParentCenter, closeParentCenter, buttonCenter } from '$lib/state/ui.svelte';
  import SettingsToggles from './parent/SettingsToggles.svelte';
  import AiKeyManager from './parent/AiKeyManager.svelte';
  import SetupInstructions from './parent/SetupInstructions.svelte';
  import AboutTab from './parent/AboutTab.svelte';
  import TabPager from './TabPager.svelte';
  import TabPagerTab from './TabPagerTab.svelte';
  import { modalDialog } from '$lib/actions/modalDialog.svelte';

  let buttonEl: HTMLButtonElement;

  function openModal() {
    if (!buttonEl) return;
    openParentCenter(buttonCenter(buttonEl));
  }
</script>

<button
  class="parent-help-button"
  id="parentHelpButton"
  aria-label="Parent Center"
  bind:this={buttonEl}
  onclick={openModal}
>
  <Icon name="parent" class="parent-help-icon" aria-label="Parent Center" role="img" />
</button>

<dialog
  class="parent-help-modal modal-dialog modal-fly-in modal-shell"
  id="parentHelpModal"
  use:modalDialog={() => ({
    open: ui.parentCenterOpen,
    origin: ui.parentCenterOrigin,
    onRequestClose: closeParentCenter
  })}
>
  <div class="parent-help-content">
    <button class="parent-help-close modal-close-btn" aria-label="Close" onclick={closeParentCenter}>×</button>
    <h2>Parent Center</h2>

    <TabPager
      initialTab="settings"
      resetKey={ui.parentCenterOpen}
      ariaLabel="Parent Center panels"
    >
      {#snippet tabs()}
        <TabPagerTab id="settings" label="Settings" icon="settings" />
        <TabPagerTab id="ai" label="AI" icon="wand-stars" />
        <TabPagerTab id="install" label="Setup" icon="pin" />
        <TabPagerTab id="about" label="About" icon="splotchy" />
      {/snippet}

      {#snippet children(tabId)}
        {#if tabId === 'settings'}
          <SettingsToggles />
        {:else if tabId === 'ai'}
          <AiKeyManager open={ui.parentCenterOpen} />
        {:else if tabId === 'install'}
          <SetupInstructions open={ui.parentCenterOpen} />
        {:else if tabId === 'about'}
          <AboutTab />
        {/if}
      {/snippet}
    </TabPager>
  </div>
</dialog>

<style>
  /* Trigger button (floats in the bottom-right corner) */
  .parent-help-button {
    position: fixed;
    bottom: calc(8px + env(safe-area-inset-bottom));
    right: calc(8px + env(safe-area-inset-right));
    width: 48px;
    height: 48px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: #999;
    opacity: 0.4;
    transition: opacity 0.2s ease;
    z-index: 900;
    padding: 8px;
    touch-action: manipulation;
  }

  .parent-help-button:hover {
    opacity: 0.7;
  }

  .parent-help-button:active {
    opacity: 1;
  }

  :global(.parent-help-icon) {
    width: 100%;
    height: 100%;
    filter: invert(60%) grayscale(100%);
  }

  .parent-help-button:hover :global(.parent-help-icon) {
    filter: invert(40%) grayscale(100%);
  }

  .parent-help-button:active :global(.parent-help-icon) {
    filter: invert(0%) grayscale(100%);
  }

  /* Modal dialog */
  .parent-help-modal {
    max-width: 500px;
    width: 90%;
    max-height: 80vh;
    overflow: hidden;
  }

  .parent-help-content {
    padding: 32px;
    position: relative;
    max-height: 80vh;
    overflow-y: auto;
  }

  .parent-help-content h2 {
    margin: 0 0 20px 0;
    font-size: 24px;
    color: #333;
    font-weight: 600;
  }

  @media (max-width: 480px) {
    .parent-help-content {
      padding: 24px 20px;
    }
  }

  .parent-help-close {
    padding: 0;
    font-size: 32px;
    line-height: 32px;
    color: #999;
    transition: color 0.2s ease;
  }

  .parent-help-close:hover {
    color: #666;
  }
</style>
