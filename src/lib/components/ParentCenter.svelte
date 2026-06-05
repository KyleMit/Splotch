<script>
  import Icon from './Icon.svelte';
  import { ui, openParentCenter, closeParentCenter } from '$lib/state/ui.svelte';
  import SettingsToggles from './parent/SettingsToggles.svelte';
  import AiKeyManager from './parent/AiKeyManager.svelte';
  import SetupInstructions from './parent/SetupInstructions.svelte';
  import AboutTab from './parent/AboutTab.svelte';
  import { modalDialog } from '$lib/actions/modalDialog.svelte.js';

  let buttonEl;
  let activeTab = $state('settings');

  function openModal() {
    if (!buttonEl) return;
    const rect = buttonEl.getBoundingClientRect();
    openParentCenter({
      x: (rect.left + rect.right) / 2,
      y: (rect.top + rect.bottom) / 2
    });
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
  class="parent-help-modal modal-dialog modal-fly-in"
  id="parentHelpModal"
  use:modalDialog={() => ({
    open: ui.parentCenterOpen,
    origin: ui.parentCenterOrigin,
    onRequestClose: closeParentCenter,
    onOpen: () => (activeTab = 'settings')
  })}
>
  <div class="parent-help-content">
    <button class="parent-help-close" aria-label="Close" onclick={closeParentCenter}>×</button>
    <h2>Parent Center</h2>

    <div class="tab-buttons">
      <button class="tab-button" class:active={activeTab === 'settings'} onclick={() => (activeTab = 'settings')}>
        <Icon name="settings" class="tab-icon" />
        <span>Settings</span>
      </button>
      <button class="tab-button" class:active={activeTab === 'ai'} onclick={() => (activeTab = 'ai')}>
        <Icon name="wand-stars" class="tab-icon" />
        <span>AI</span>
      </button>
      <button class="tab-button" class:active={activeTab === 'install'} onclick={() => (activeTab = 'install')}>
        <Icon name="pin" class="tab-icon" />
        <span>Setup</span>
      </button>
      <button class="tab-button" class:active={activeTab === 'about'} onclick={() => (activeTab = 'about')}>
        <Icon name="splotchy" class="tab-icon" />
        <span>About</span>
      </button>
    </div>

    <div class="tab-content" class:active={activeTab === 'install'}>
      <SetupInstructions open={ui.parentCenterOpen} />
    </div>

    <div class="tab-content" class:active={activeTab === 'settings'}>
      <SettingsToggles />
    </div>

    <div class="tab-content" class:active={activeTab === 'ai'}>
      <AiKeyManager open={ui.parentCenterOpen} />
    </div>

    <div class="tab-content" class:active={activeTab === 'about'}>
      <AboutTab />
    </div>
  </div>
</dialog>

<style>
  /* Trigger button (floats in the bottom-right corner) */
  .parent-help-button {
    position: fixed;
    bottom: 8px;
    right: 8px;
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
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    margin: 0;
    background: white;
    border: none;
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    max-width: 500px;
    width: 90%;
    max-height: 80vh;
    overflow: hidden;
    padding: 0;
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

  /* Tab Buttons */
  .tab-buttons {
    display: flex;
    gap: 8px;
    margin-bottom: 24px;
    border-bottom: 2px solid #e0e0e0;
  }

  .tab-button {
    flex: 1;
    padding: 12px 16px;
    background: transparent;
    border: none;
    border-bottom: 3px solid transparent;
    color: #999;
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    margin-bottom: -2px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  :global(.tab-icon) {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    opacity: 0.7;
    transition: opacity 0.2s ease;
  }

  .tab-button.active :global(.tab-icon) {
    opacity: 1;
  }

  .tab-button:hover {
    color: #666;
    background: #f5f5f5;
  }

  .tab-button.active {
    color: var(--brand);
    border-bottom-color: var(--brand);
  }

  /* Tab Content */
  .tab-content {
    display: none;
  }

  .tab-content.active {
    display: block;
  }

  /* Four tabs get cramped on narrow portrait screens. First tighten the
     spacing; then, when that runs out, stack the icon over the label so each
     tab needs far less horizontal room. */
  @media (max-width: 480px) {
    .parent-help-content {
      padding: 24px 20px;
    }

    .tab-buttons {
      gap: 4px;
    }

    .tab-button {
      padding: 10px 8px;
      font-size: 14px;
      gap: 6px;
    }
  }

  @media (max-width: 380px) {
    .tab-button {
      flex-direction: column;
      gap: 4px;
      padding: 10px 4px;
      font-size: 12px;
    }
  }

  .parent-help-close {
    position: absolute;
    top: 16px;
    right: 16px;
    width: 32px;
    height: 32px;
    background: transparent;
    border: none;
    font-size: 32px;
    line-height: 32px;
    color: #999;
    cursor: pointer;
    padding: 0;
    transition: color 0.2s ease;
  }

  .parent-help-close:hover {
    color: #666;
  }
</style>
