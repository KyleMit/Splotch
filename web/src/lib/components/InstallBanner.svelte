<script lang="ts">
  import { onMount } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { backOut, cubicIn } from 'svelte/easing';
  import Icon from './Icon.svelte';
  import SplotchyIcon from './SplotchyIcon.svelte';
  import { canvasState, SETTLED_IN_STROKES } from '$lib/state/canvas.svelte';
  import {
    install,
    promptInstall,
    dismissInstall,
    armInstallAutoClear,
    disarmInstallAutoClear,
    autoDismissInstallIfDue,
    installPromptStage,
  } from '$lib/state/install.svelte';
  import { SETTINGS_BUTTON_ID } from '$lib/state/ui.svelte';
  import { aiResult } from '$lib/state/aiGeneration.svelte';
  import { layout } from '$lib/state/layout.svelte';
  import { settings } from '$lib/state/settings.svelte';

  // Continued drawing hands the install guide off to Settings with a short parting message.
  const PARTING_MESSAGE_MS = 4000;

  // Shared motion vocabulary for the banner's enter/exit transitions.
  const BANNER_FLY_Y = 120;
  const BANNER_ENTER_MS = 420;
  const BANNER_EXIT_MS = 300;
  const BANNER_SHRINK_EXIT_MS = 550;
  const PARTING_FADE_MS = 200;
  const HINT_FADE_MS = 160;
  const PORTRAIT_PHONE_MAX_WIDTH_PX = 599;

  const INSTALL_PROMPT_COPY = {
    initial: {
      heading: 'Add Splotch to your home screen',
      detail: 'Opens full-screen, just like a real app',
    },
    returning: {
      heading: 'Welcome back! Add Splotch to your home screen',
      detail: 'Opens full-screen, just like a real app',
    },
    final: {
      heading: 'One last reminder — install Splotch',
      detail: "We won't ask again — it's always in Settings",
    },
  } as const;

  // iOS / Android manual flows have no one-tap API, so the button expands an
  // inline how-to instead of firing a dialog.
  let showHint = $state(false);
  let busy = $state(false);
  let parting = $state(false);
  let exitIntoSettingsButton = $state(false);
  // Intentionally untracked: only read/written from the effect and the
  // onMount teardown below.
  let partingTimer: ReturnType<typeof setTimeout> | undefined;

  // Wait until the child has actually drawn a little, so the prompt feels earned
  // and never competes with the very first finger-on-screen moment. It also
  // stands down while a generation waits in the corner: both live in the same
  // place, and of the two only the chip is the way back to a picture already
  // paid for (ADR-0116). An install prompt is re-offerable after sustained use,
  // and Settings carries the same action.
  const shareLocation = $derived(
    layout.viewportWidth > 0 &&
      layout.viewportWidth <= PORTRAIT_PHONE_MAX_WIDTH_PX &&
      layout.orientation === 'portrait'
      ? 'at the bottom of the screen'
      : 'in the Safari toolbar'
  );
  const controlsOpen = $derived(settings.advancedControlsEnabled && settings.drawerOpen);
  const promptStage = $derived(installPromptStage());
  const promptCopy = $derived(INSTALL_PROMPT_COPY[promptStage ?? 'initial']);
  const visible = $derived(
    !install.installed &&
      promptStage !== null &&
      install.mode !== 'none' &&
      !aiResult.minimized &&
      canvasState.strokeCount >= SETTLED_IN_STROKES
  );

  $effect(() => {
    if (!visible || controlsOpen) {
      disarmInstallAutoClear();
      return;
    }
    if (parting) return;
    armInstallAutoClear();
    // A parent mid-interaction (reading the expanded hint, native dialog up)
    // outranks the countdown — only auto-clear an ignored banner.
    if (showHint || busy) return;
    if (!autoDismissInstallIfDue()) return;
    parting = true;
    partingTimer = setTimeout(() => {
      exitIntoSettingsButton = true;
      parting = false;
    }, PARTING_MESSAGE_MS);
  });

  onMount(() => () => {
    if (partingTimer) clearTimeout(partingTimer);
  });

  // Auto-clear exit: shrink the pill into the Settings Button so the parting
  // message's "it lives in Settings" lands visually too. Manual
  // dismiss / completed install keep the plain fly-down.
  function bannerExit(node: HTMLElement) {
    if (!exitIntoSettingsButton) return fly(node, { y: BANNER_FLY_Y, duration: BANNER_EXIT_MS });
    const target = document.getElementById(SETTINGS_BUTTON_ID)?.getBoundingClientRect();
    const from = node.getBoundingClientRect();
    const dx = target ? target.left + target.width / 2 - (from.left + from.width / 2) : 0;
    const dy = target
      ? target.top + target.height / 2 - (from.top + from.height / 2)
      : BANNER_FLY_Y;
    return {
      duration: BANNER_SHRINK_EXIT_MS,
      easing: cubicIn,
      css: (t: number, u: number) =>
        `transform: translate(${u * dx}px, ${u * dy}px) scale(${t}); opacity: ${t}`,
    };
  }

  async function onPrimary() {
    if (install.mode === 'oneTap') {
      busy = true;
      try {
        // If the live prompt has gone stale, promptInstall() drops mode to the
        // manual hint; expand the steps so the tap isn't a silent no-op.
        if ((await promptInstall()) === 'unavailable') showHint = true;
      } finally {
        busy = false;
      }
      return;
    }
    showHint = !showHint;
  }
</script>

{#if visible || parting}
  <div
    class="install-banner"
    hidden={controlsOpen}
    in:fly={{ y: BANNER_FLY_Y, duration: BANNER_ENTER_MS, easing: backOut }}
    out:bannerExit
  >
    {#if parting}
      <div class="install-parting" in:fade={{ duration: PARTING_FADE_MS }}>
        <span class="install-mascot" aria-hidden="true">
          <SplotchyIcon class="install-mascot-icon" />
        </span>
        <p>
          No rush — these steps are always in
          <Icon name="settings" class="install-inline-icon" aria-hidden="true" />
          <strong>Settings</strong>.
        </p>
      </div>
    {:else}
      <div class="install-main">
        <span class="install-mascot" aria-hidden="true">
          <SplotchyIcon class="install-mascot-icon" />
        </span>
        <div class="install-copy">
          <strong>{promptCopy.heading}</strong>
          <span class="install-sub">{promptCopy.detail}</span>
        </div>
        <button
          class="install-cta"
          class:expanded={showHint}
          aria-expanded={install.mode === 'oneTap' ? undefined : showHint}
          aria-controls={install.mode === 'oneTap' ? undefined : 'install-hint'}
          onclick={onPrimary}
          disabled={busy}
          type="button"
        >
          {#if install.mode === 'oneTap'}
            <Icon name="install-homescreen" class="install-cta-icon" />
            Install
          {:else}
            {showHint ? 'Hide' : 'How?'}
            <Icon name="chevron-down" class="install-cta-icon install-chevron" aria-hidden="true" />
          {/if}
        </button>
        <button
          class="install-dismiss"
          aria-label="Not now"
          onclick={() => dismissInstall()}
          type="button">×</button
        >
      </div>

      {#if showHint && install.mode !== 'oneTap'}
        <div id="install-hint" class="install-hint" transition:fade={{ duration: HINT_FADE_MS }}>
          {#if install.mode === 'ios'}
            <ol role="list">
              <li>
                <span class="step-number" aria-hidden="true">1</span>
                <span
                  >Tap <span class="hint-term"
                    ><Icon name="share-ios" class="install-inline-icon" aria-hidden="true" /> Share</span
                  >
                  {shareLocation}.</span
                >
              </li>
              <li>
                <span class="step-number" aria-hidden="true">2</span>
                <span
                  >Choose <span class="hint-term"
                    ><Icon name="add-homescreen" class="install-inline-icon" aria-hidden="true" /> Add
                    to Home Screen</span
                  >.</span
                >
              </li>
              <li>
                <span class="step-number" aria-hidden="true">3</span>
                <span
                  >Don't see it? Tap <span class="hint-term"
                    ><Icon name="chevron-down" class="install-inline-icon" aria-hidden="true" /> View
                    More</span
                  > first.</span
                >
              </li>
            </ol>
          {:else}
            <p>
              Open the <strong>⋮</strong> menu, then tap
              <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.
            </p>
          {/if}
        </div>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .install-banner {
    position: relative;
    z-index: var(--z-banner);
    pointer-events: auto;
    width: 100%;
    max-width: 420px;
    min-width: 0;
    box-sizing: border-box;
    padding: var(--space-4);
    background: var(--surface);
    border: var(--border-width) solid var(--brand);
    border-radius: var(--radius-lg);
    box-shadow: var(--float-shadow);
    font-family: inherit;
  }

  .install-dismiss {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
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
      border-color var(--duration-base) ease,
      background var(--duration-base) ease,
      transform var(--duration-fast) ease;
  }

  .install-dismiss:active {
    transform: scale(0.92);
  }

  @media (hover: hover) {
    .install-dismiss:hover {
      color: var(--text);
      background: var(--surface-hover);
      border-color: var(--border-warm-strong);
    }
  }

  .install-main {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .install-parting {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .install-parting p {
    margin: 0;
    color: var(--text-soft);
    font-size: var(--font-size-sm);
    line-height: 1.5;
    text-align: left;
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
    gap: var(--space-1);
    text-wrap: pretty;
  }

  .install-copy strong {
    color: var(--text-strong);
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-bold);
  }

  .install-sub {
    color: var(--text-soft);
    font-size: var(--font-size-sm);
  }

  .install-cta {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    height: 40px;
    padding: 0 var(--space-3) 0 var(--space-4);
    border: none;
    border-radius: var(--radius-pill);
    /* --brand-solid, not --brand: this fill carries a bold 16px label, below
       WCAG's large-text threshold, and --brand is only 3.4:1 under white. */
    background: var(--brand-solid);
    color: var(--on-brand);
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-bold);
    cursor: pointer;
    touch-action: manipulation;
    transition:
      transform var(--duration-fast) var(--ease-glide),
      background var(--duration-fast) var(--ease-glide);
  }

  @media (hover: hover) {
    .install-cta:hover {
      background: var(--brand-solid-hover);
    }
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
    margin-top: var(--space-3);
    padding-top: var(--space-3);
    border-top: var(--border-width) solid var(--border-warm);
    color: var(--text-soft);
    font-size: var(--font-size-sm);
    line-height: 1.5;
  }

  :global(.install-inline-icon) {
    display: inline-flex;
    width: 1em;
    height: 1em;
    vertical-align: -0.125em;
  }

  /* The banner sits outside any .modal-shell, so re-ink its monochrome inline
     icons for the themed surface here (same rule as app.css's modal version). */
  .install-banner :global(:where([data-icon]:not(.icon-color):not(.icon-tinted)) svg) {
    fill: var(--icon-ink);
  }
  .install-hint p {
    margin: 0;
  }
  .install-hint ol {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--text);
  }
  .install-hint li {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
  }
  .step-number {
    flex: 0 0 20px;
    height: 20px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-pill);
    background: var(--brand-wash);
    color: var(--brand-text);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
  }
  .hint-term {
    white-space: nowrap;
    font-weight: var(--font-weight-bold);
    color: var(--text-strong);
  }
  :global(.install-chevron) {
    transition: transform var(--duration-base) var(--ease-glide);
  }
  .install-cta.expanded :global(.install-chevron) {
    transform: rotate(180deg);
  }
  @media (max-width: 599px) and (orientation: portrait) {
    .install-main {
      flex-wrap: wrap;
    }
    .install-cta {
      order: 1;
      flex-basis: 100%;
      height: 44px;
      justify-content: center;
      margin-top: var(--space-1);
    }
  }
</style>
