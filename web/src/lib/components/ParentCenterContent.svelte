<script lang="ts">
  import { ui } from '$lib/state/ui.svelte';
  import SettingsToggles from './parent/SettingsToggles.svelte';
  import AiKeyManager from './parent/AiKeyManager.svelte';
  import SetupInstructions from './parent/SetupInstructions.svelte';
  import AboutTab from './parent/AboutTab.svelte';
  import TabPager from './TabPager.svelte';
  import TabPagerTab from './TabPagerTab.svelte';
</script>

<div class="parent-help-content">
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

<style>
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

  /* Shared setting-card tokens for the tab bodies. The tabs only ever render
     inside this content card, so scoping the :global reach to
     .parent-help-content keeps these rules in one place instead of copied into
     each tab component. */
  .parent-help-content :global(.setting-group) {
    margin-bottom: 24px;
  }

  .parent-help-content :global(.setting-group:last-child) {
    margin-bottom: 0;
  }

  .parent-help-content :global(.setting) {
    padding: 12px 16px;
    background: #f8f8f8;
    border-radius: 8px;
  }

  @media (max-width: 480px) {
    .parent-help-content {
      padding: 24px 20px;
    }
  }
</style>
