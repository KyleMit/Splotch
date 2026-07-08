<script lang="ts">
  import Icon from './Icon.svelte';
  import { ui, closeParentCenter } from '$lib/state/ui.svelte';
  import SettingsToggles from './parent/SettingsToggles.svelte';
  import AiKeyManager from './parent/AiKeyManager.svelte';
  import SetupInstructions from './parent/SetupInstructions.svelte';
  import AboutTab from './parent/AboutTab.svelte';
  import TabPager from './TabPager.svelte';
  import TabPagerTab from './TabPagerTab.svelte';
  import { modalDialog } from '$lib/actions/modalDialog.svelte';
</script>

<dialog
  class="parent-help-modal modal-dialog modal-fly-in modal-shell"
  class:resizing={ui.resizingActionButtons}
  id="parentHelpModal"
  use:modalDialog={() => ({
    open: ui.parentCenterOpen,
    origin: ui.parentCenterOrigin,
    onRequestClose: closeParentCenter,
  })}
>
  <div class="parent-help-content">
    <button
      class="parent-help-close modal-close-btn"
      aria-label="Close"
      onclick={closeParentCenter}
    >
      <Icon name="close" class="modal-close-icon" />
    </button>
    <h2>Parent Center</h2>

    <TabPager initialTab="settings" resetKey={ui.parentCenterOpen} ariaLabel="Parent Center panels">
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
  .parent-help-modal {
    max-width: 500px;
    width: 90%;
    max-height: 80vh;
    overflow: hidden;
  }

  /* While the parent drags the Button Size slider, the modal melts away to just
     that slider so the action buttons resize in full view behind it. The slider
     keeps its on-screen position (it stays under the finger); everything else in
     the card — heading, tabs, other settings — is hidden, and the card surface
     and backdrop go transparent so the canvas and buttons show through. The
     slider still occupies its normal slot in the (now invisible) layout, so no
     repositioning gymnastics are needed. */
  .parent-help-modal.resizing {
    background: transparent;
    box-shadow: none;
  }

  .parent-help-modal.resizing::backdrop {
    background: transparent;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .parent-help-modal.resizing .parent-help-content {
    visibility: hidden;
  }

  .parent-help-modal.resizing :global(.button-size-setting) {
    visibility: visible;
    background: var(--surface);
    border-radius: 16px;
    /* A tight, even lift that hugs the rounded card — not the heavy, downward
       shadow that bled into a rectangular band below the control. */
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.16);
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
    color: var(--text-strong);
    font-weight: 600;
  }

  /* Shared setting-card tokens for the tab bodies. The tabs only ever render
     inside this modal, so scoping the :global reach to .parent-help-content
     keeps these rules in one place instead of copied into each tab component. */
  .parent-help-content :global(.setting-group) {
    margin-bottom: 24px;
  }

  .parent-help-content :global(.setting-group:last-child) {
    margin-bottom: 0;
  }

  .parent-help-content :global(.setting) {
    padding: 12px 16px;
    background: var(--surface-2);
    border-radius: 8px;
  }

  @media (max-width: 480px) {
    .parent-help-content {
      padding: 24px 20px;
    }
  }
</style>
