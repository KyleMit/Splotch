<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { backOut, cubicIn } from 'svelte/easing';
  import Icon from './Icon.svelte';
  import SplotchyIcon from './SplotchyIcon.svelte';
  import { canvasState, SETTLED_IN_STROKES } from '$lib/state/canvas.svelte';
  import { install, promptInstall, dismissInstall } from '$lib/state/install.svelte';

  // Wait until the child has actually drawn a little, so the prompt feels earned
  // and never competes with the very first finger-on-screen moment.
  const STROKES_BEFORE_PROMPT = SETTLED_IN_STROKES;

  // The banner sits above the corner controls (actions toggle, Parent Help), so
  // it must not linger: once the child has kept drawing past it, clear it and
  // hand off to the Parent Center setup guide with a short parting message.
  const STROKES_BEFORE_AUTO_CLEAR = 5;
  const PARTING_MESSAGE_MS = 4000;

  // iOS / Android manual flows have no one-tap API, so the button expands an
  // inline how-to instead of firing a dialog.
  let showHint = $state(false);
  let busy = $state(false);
  let parting = $state(false);
  let shownAtStroke: number | null = null;
  let exitIntoParentButton = false;

  const visible = $derived(
    !install.installed &&
      !install.dismissed &&
      install.mode !== 'none' &&
      canvasState.strokeCount >= STROKES_BEFORE_PROMPT
  );

  $effect(() => {
    if (!visible || parting) return;
    shownAtStroke ??= canvasState.strokeCount;
    // A parent mid-interaction (reading the expanded hint, native dialog up)
    // outranks the countdown — only auto-clear an ignored banner.
    if (showHint || busy) return;
    if (canvasState.strokeCount < shownAtStroke + STROKES_BEFORE_AUTO_CLEAR) return;
    parting = true;
    dismissInstall();
    setTimeout(() => {
      exitIntoParentButton = true;
      parting = false;
    }, PARTING_MESSAGE_MS);
  });

  // Auto-clear exit: shrink the pill into the Parent Help button so the parting
  // message's "it lives in the Parent Center" lands visually too. Manual
  // dismiss / completed install keep the plain fly-down.
  function bannerExit(node: HTMLElement) {
    if (!exitIntoParentButton) return fly(node, { y: 120, duration: 300 });
    const target = document.getElementById('parentHelpButton')?.getBoundingClientRect();
    const from = node.getBoundingClientRect();
    const dx = target ? target.left + target.width / 2 - (from.left + from.width / 2) : 0;
    const dy = target ? target.top + target.height / 2 - (from.top + from.height / 2) : 120;
    return {
      duration: 550,
      easing: cubicIn,
      css: (t: number, u: number) =>
        // The resting position already carries translateX(-50%) — restate it so
        // the transition's transform doesn't clobber the centering.
        `transform: translateX(calc(-50% + ${u * dx}px)) translateY(${u * dy}px) scale(${t}); opacity: ${t}`,
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
  <div class="install-banner" in:fly={{ y: 120, duration: 420, easing: backOut }} out:bannerExit>
    {#if parting}
      <div class="install-parting" in:fade={{ duration: 200 }}>
        <span class="install-mascot" aria-hidden="true">
          <SplotchyIcon class="install-mascot-icon" />
        </span>
        <p>
          No rush — these steps are always in the
          <Icon name="parent" class="install-inline-icon" aria-hidden="true" />
          <strong>Parent Center</strong>.
        </p>
      </div>
    {:else}
      <div class="install-main">
        <span class="install-mascot" aria-hidden="true">
          <SplotchyIcon class="install-mascot-icon" />
        </span>
        <div class="install-copy">
          <strong>Add Splotch to your home screen</strong>
          <span class="install-sub">Opens full-screen, just like a real app</span>
        </div>
        <button class="install-cta" onclick={onPrimary} disabled={busy} type="button">
          {#if install.mode === 'oneTap'}
            <Icon name="install-homescreen" class="install-cta-icon" />
            Install
          {:else}
            How?
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
        <div class="install-hint" transition:fade={{ duration: 160 }}>
          {#if install.mode === 'ios'}
            <p>
              Tap <Icon name="share-ios" class="install-inline-icon" aria-label="Share" /> Share at the
              bottom of the screen, then choose
              <Icon name="add-homescreen" class="install-inline-icon" aria-hidden="true" />
              <strong>"Add to Home Screen"</strong>. If you don't see it, tap
              <Icon name="chevron-down" class="install-inline-icon" aria-hidden="true" />
              <strong>"View More"</strong> first.
            </p>
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
    position: fixed;
    left: 50%;
    bottom: calc(16px + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    /* Above the corner controls (actions toggle 901, Parent Help 900): on phones
       the banner overlaps them, and the auto-clear keeps that takeover short. */
    z-index: 950;
    width: min(92vw, 420px);
    box-sizing: border-box;
    padding: 14px 16px;
    background: var(--surface);
    border: 2px solid var(--brand, #ab71e1);
    border-radius: var(--radius-xl);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
    font-family: inherit;
  }

  .install-dismiss {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    padding: 0;
    border: 2px solid var(--border-warm);
    border-radius: 50%;
    background: var(--surface);
    color: var(--text-muted);
    font-size: var(--font-size-2xl);
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
      background: var(--surface-warm-hover);
      border-color: var(--border-warm-strong);
    }
  }

  .install-main {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .install-parting {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .install-parting p {
    margin: 0;
    color: var(--text-mid);
    font-size: var(--font-size-md);
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
  }

  .install-copy strong {
    color: var(--text-strong);
    font-size: 15px;
    font-weight: 700;
  }

  .install-sub {
    color: var(--text-muted);
    font-size: var(--font-size-xs);
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
    border-top: 1px solid var(--border-warm);
  }

  .install-hint p {
    margin: 0;
    color: var(--text-mid);
    font-size: var(--font-size-md);
    line-height: 1.6;
  }

  :global(.install-inline-icon) {
    display: inline-flex;
    width: 18px;
    height: 18px;
    vertical-align: -4px;
    margin: 0 1px;
  }

  /* The banner sits outside any .modal-shell, so re-ink its monochrome inline
     icons for the themed surface here (same rule as app.css's modal version). */
  .install-banner :global(:where([data-icon]:not(.icon-color):not(.icon-tinted)) svg) {
    fill: var(--icon-ink);
  }
</style>
