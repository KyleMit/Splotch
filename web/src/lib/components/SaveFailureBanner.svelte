<script lang="ts">
  import { fly } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import Icon from './Icon.svelte';
  import Button from './design/Button.svelte';
  import {
    saveFailureState,
    retryUnsavedPictures,
    dismissSaveFailure,
  } from '$lib/state/saveFailure.svelte';
  import { aiGenerationState } from '$lib/state/aiGeneration.svelte';
  import { settingsState } from '$lib/state/settings.svelte';
  import { requireParentalGate } from '$lib/state/parentalGate.svelte';
  import { buttonCenter } from '$lib/state/modal.svelte';
  import { visibleActionButtonCount } from '$lib/actionButtonLayout';
  import { getPlatform } from '$lib/platform';
  import { saveFailureCopy } from '$lib/drawing/saveFailureCopy';
  import '$lib/components/deferredIcons';

  const BANNER_FLY_Y = 120;
  const BANNER_ENTER_MS = 420;
  const BANNER_EXIT_MS = 300;

  const platform = getPlatform();
  const outcome = $derived(saveFailureState.outcome);
  const pictureCount = $derived(saveFailureState.pictureCount);
  const copy = $derived(outcome && saveFailureCopy(outcome, pictureCount, platform));
  // Only a native save can be refused for a permission, so only native has a Settings page to offer.
  const offerSettings = $derived(__IS_CAPACITOR__ && outcome === 'denied' && platform !== 'web');
  // The drawer and a minimized generation own the dock the way they do for the install banner.
  const controlsOpen = $derived(settingsState.drawerOpen && visibleActionButtonCount() > 0);
  const visible = $derived(outcome !== null && !aiGenerationState.minimized);

  async function openAppSettings() {
    if (!__IS_CAPACITOR__) return;
    try {
      const { AppSettings } = await import('$lib/plugins/appSettings');
      await AppSettings.open();
    } catch (err) {
      console.error('Opening app settings failed:', err);
    }
  }

  // Settings is outside the app, so it sits behind the same gate as every other way out (ADR-0094).
  function onOpenSettings(event: MouseEvent & { currentTarget: HTMLElement }) {
    requireParentalGate(
      'externalLinks',
      () => void openAppSettings(),
      buttonCenter(event.currentTarget)
    );
  }
</script>

{#if visible && copy}
  <div
    class="save-failure-banner"
    role="status"
    hidden={controlsOpen}
    in:fly={{ y: BANNER_FLY_Y, duration: BANNER_ENTER_MS, easing: backOut }}
    out:fly={{ y: BANNER_FLY_Y, duration: BANNER_EXIT_MS }}
  >
    <div class="save-failure-main">
      <span class="save-failure-mascot" aria-hidden="true">
        <Icon name="dottie-hiccup" class="save-failure-mascot-icon" />
      </span>
      <div class="save-failure-copy">
        <strong>{copy.heading}</strong>
        <span class="save-failure-detail">{copy.detail}</span>
      </div>
      <button
        class="save-failure-dismiss"
        aria-label="Dismiss"
        onclick={() => dismissSaveFailure()}
        type="button">×</button
      >
    </div>
    {#if offerSettings || pictureCount > 0}
      <div class="save-failure-actions">
        {#if offerSettings}
          <Button variant="brand" size="md" class="save-failure-action" onclick={onOpenSettings}>
            Open Settings
          </Button>
        {/if}
        {#if pictureCount > 0}
          <Button
            variant={offerSettings ? 'wash' : 'brand'}
            size="md"
            class="save-failure-action"
            busy={saveFailureState.retrying}
            onclick={() => void retryUnsavedPictures()}
          >
            {saveFailureState.retrying ? 'Saving…' : 'Try again'}
          </Button>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .save-failure-banner {
    position: relative;
    z-index: var(--z-banner);
    pointer-events: auto;
    width: 100%;
    max-width: 420px;
    min-width: 0;
    box-sizing: border-box;
    padding: var(--space-4);
    background: var(--surface);
    border: var(--border-width) solid var(--border-warm-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--float-shadow);
    font-family: inherit;
  }

  .save-failure-main {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
  }

  .save-failure-mascot {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
  }

  .save-failure-mascot :global(.save-failure-mascot-icon) {
    display: block;
    width: 100%;
    height: 100%;
  }

  .save-failure-copy {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    text-align: left;
    line-height: 1.3;
    text-wrap: pretty;
  }

  .save-failure-copy strong {
    color: var(--text-strong);
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-bold);
  }

  .save-failure-detail {
    color: var(--text-soft);
    font-size: var(--font-size-sm);
  }

  .save-failure-dismiss {
    flex-shrink: 0;
    width: 44px;
    height: 44px;
    margin: calc(-1 * var(--space-1)) calc(-1 * var(--space-1)) 0 0;
    padding: 0;
    border: var(--border-width) solid var(--border-warm-strong);
    border-radius: 50%;
    background: var(--surface-2);
    color: var(--text);
    font-size: var(--font-size-xl);
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    touch-action: manipulation;
    transition:
      background var(--duration-base) ease,
      transform var(--duration-fast) ease;
  }

  .save-failure-dismiss:active {
    transform: scale(0.92);
  }

  @media (hover: hover) {
    .save-failure-dismiss:hover {
      background: var(--surface-hover);
    }
  }

  .save-failure-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }

  .save-failure-actions :global(.save-failure-action) {
    min-height: 44px;
  }
</style>
