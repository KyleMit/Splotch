<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import Icon from './Icon.svelte';
  import { canvasState } from '$lib/state/canvas.svelte';
  import { install, promptInstall, dismissInstall } from '$lib/state/install.svelte';

  // Wait until the child has actually drawn a little, so the prompt feels earned
  // and never competes with the very first finger-on-screen moment.
  const STROKES_BEFORE_PROMPT = 3;

  // iOS / Android manual flows have no one-tap API, so the button expands an
  // inline how-to instead of firing a dialog.
  let showHint = $state(false);
  let busy = $state(false);

  const visible = $derived(
    !install.installed &&
      !install.dismissed &&
      install.mode !== 'none' &&
      canvasState.strokeCount >= STROKES_BEFORE_PROMPT
  );

  async function onPrimary() {
    if (install.mode === 'oneTap') {
      busy = true;
      // If the live prompt has gone stale, promptInstall() flips mode to the
      // manual hint; reflect that by expanding the steps instead.
      const outcome = await promptInstall();
      busy = false;
      if (outcome === 'unavailable') showHint = true;
      return;
    }
    showHint = !showHint;
  }
</script>

{#if visible}
  <div class="install-banner" transition:fly={{ y: 120, duration: 420, easing: backOut }}>
    <button
      class="install-dismiss"
      aria-label="Not now"
      onclick={() => dismissInstall()}
      type="button">×</button
    >

    <div class="install-main">
      <span class="install-mascot" aria-hidden="true">
        <Icon name="splotchy" class="install-mascot-icon" />
      </span>
      <div class="install-copy">
        <strong>Add Splotch to your home screen</strong>
        <span class="install-sub">Opens full-screen, just like a real app</span>
      </div>
      <button class="install-cta" onclick={onPrimary} disabled={busy} type="button">
        {#if install.mode === 'oneTap'}
          <Icon name="home" class="install-cta-icon" />
          Install
        {:else}
          How?
        {/if}
      </button>
    </div>

    {#if showHint && install.mode !== 'oneTap'}
      <div class="install-hint" transition:fade={{ duration: 160 }}>
        {#if install.mode === 'ios'}
          <p>
            Tap <Icon name="share-ios" class="install-inline-icon" aria-label="Share" /> Share at the
            bottom of the screen, then choose <strong>"Add to Home Screen"</strong>.
          </p>
        {:else}
          <p>
            Open the <strong>⋮</strong> menu, then tap
            <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.
          </p>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .install-banner {
    position: fixed;
    left: 50%;
    bottom: calc(16px + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    z-index: 850;
    width: min(92vw, 420px);
    box-sizing: border-box;
    padding: 14px 16px;
    background: #fffdf9;
    border: 2px solid var(--brand, #ab71e1);
    border-radius: 22px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
    font-family: inherit;
  }

  .install-dismiss {
    position: absolute;
    top: 4px;
    right: 8px;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    background: transparent;
    color: #b0a8a0;
    font-size: 22px;
    line-height: 28px;
    cursor: pointer;
    touch-action: manipulation;
  }

  .install-dismiss:hover {
    color: #777;
  }

  .install-main {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .install-mascot {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
  }

  :global(.install-mascot-icon) {
    width: 100%;
    height: 100%;
  }

  .install-copy {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    text-align: left;
    line-height: 1.25;
  }

  .install-copy strong {
    color: #3a3a3a;
    font-size: 15px;
    font-weight: 700;
  }

  .install-sub {
    color: #8a8178;
    font-size: 12px;
    margin-top: 2px;
  }

  .install-cta {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    border: none;
    border-radius: 14px;
    background: var(--brand, #ab71e1);
    color: #fff;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
    transition:
      transform 0.12s ease,
      filter 0.12s ease;
  }

  .install-cta:hover {
    filter: brightness(1.05);
  }

  .install-cta:active {
    transform: scale(0.96);
  }

  .install-cta:disabled {
    opacity: 0.6;
    cursor: default;
  }

  :global(.install-cta-icon) {
    width: 18px;
    height: 18px;
    filter: brightness(0) invert(1);
  }

  .install-hint {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid #efe9e0;
  }

  .install-hint p {
    margin: 0;
    color: #6a6258;
    font-size: 14px;
    line-height: 1.6;
  }

  :global(.install-inline-icon) {
    display: inline-flex;
    width: 18px;
    height: 18px;
    vertical-align: -4px;
    margin: 0 1px;
  }
</style>
