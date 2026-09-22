<script lang="ts">
  import DialogHeader from './design/DialogHeader.svelte';
  import Icon from './Icon.svelte';
  import ParentalGateKeypad from './ParentalGateKeypad.svelte';
  import ParentalGateManageFooter from './ParentalGateManageFooter.svelte';
  import ParentalGateProblem from './ParentalGateProblem.svelte';
  import SplotchyIcon from './SplotchyIcon.svelte';
  import { modalDialog } from '$lib/actions/modalDialog.svelte';
  import { stampMotionAtStart } from '$lib/platform/reducedMotion';
  import type { Origin } from '$lib/state/modal.svelte';
  import '$lib/components/deferredIcons';
  import {
    parentalGateState,
    dismissGate,
    notifyGateClosed,
    pressGateDigit,
    pressGateBackspace,
    submitGateAnswer,
    redirectGateToParentCenter,
    GATE_CHECK_KEY,
    GATE_SHAKE_MS,
  } from '$lib/state/parentalGate.svelte';

  interface Props {
    manageDestination?: (origin: Origin | null) => void;
  }

  let { manageDestination }: Props = $props();

  // Parent Center is where these checks are managed, so a challenge standing in
  // front of it is already at that destination: it names it in the subtitle and
  // drops the footer that would otherwise offer the trip the parent is on.
  const managingPolicies = $derived(parentalGateState.feature === 'parentCenter');

  // The keypad, for the focus handoff below.
  let keypadEl = $state<HTMLDivElement>();

  // Retargeting unmounts the footer this was activated from, and a removed
  // element hands focus back to <body> — outside the dialog, where the keydown
  // handler above never sees another digit, leaving a keyboard user stranded on
  // a card that looks ready for one. So focus moves onto the keypad first, while
  // the element that owns it is still there to give it up.
  function manageGatePolicies() {
    keypadEl?.querySelector('button')?.focus();
    redirectGateToParentCenter(manageDestination);
  }

  // Enter checks the answer from anywhere on the card except the close and
  // footer buttons, whose own activation it must not hijack. On a keypad key it
  // replaces that key's click, which would otherwise type one digit too many.
  //
  // The dialog opens with focus on its close button, so an answer typed from
  // there hands focus to the check key: the Enter that follows checks it rather
  // than clicking close and discarding it.
  function handleKeydown(event: KeyboardEvent) {
    if (event.key >= '0' && event.key <= '9') {
      pressGateDigit(Number(event.key));
      if (!isAnswerTarget(event.target)) focusCheckKey();
    } else if (event.key === 'Backspace') pressGateBackspace();
    else if (event.key === 'Enter' && isAnswerTarget(event.target)) {
      event.preventDefault();
      submitGateAnswer();
    }
  }

  function isAnswerTarget(target: EventTarget | null) {
    return !(target instanceof HTMLButtonElement) || !!keypadEl?.contains(target);
  }

  function focusCheckKey() {
    keypadEl?.querySelector<HTMLButtonElement>(`[data-key="${GATE_CHECK_KEY}"]`)?.focus();
  }
</script>

<dialog
  class="parental-gate modal-dialog modal-fly-in modal-shell"
  id="parentalGate"
  aria-labelledby="parentalGateTitle"
  use:modalDialog={() => ({
    open: parentalGateState.open,
    origin: parentalGateState.origin,
    onRequestClose: dismissGate,
    // A solved gate hands off to its destination only once this dialog has
    // actually closed, so the destination's own modal is not opened over a
    // dialog on its way out (see notifyGateClosed).
    onClose: notifyGateClosed,
    // A correct answer is committed: dismissing during the success hold would
    // silently drop the captured destination, so backdrop taps and Esc are
    // blocked until the handoff runs.
    allowDismiss: () => !parentalGateState.unlocked,
  })}
  onkeydown={handleKeydown}
>
  <div
    class="gate-content"
    class:shaking={parentalGateState.shaking}
    style:--gate-shake-duration={`${GATE_SHAKE_MS}ms`}
  >
    {#if parentalGateState.unlocked}
      <div class="gate-success" role="status" use:stampMotionAtStart>
        <span class="gate-success-badge">
          <Icon name="check" class="gate-success-icon" />
        </span>
        <h2 class="gate-success-title" id="parentalGateTitle">Unlocked!</h2>
        <p class="gate-success-sub">You're all set.</p>
      </div>
    {:else}
      <DialogHeader onclose={dismissGate} />
      <div class="gate-main">
        <header class="gate-header">
          <SplotchyIcon class="gate-mascot" />
          <div class="gate-heading">
            <h2 class="gate-title" id="parentalGateTitle">Grown-Ups Only</h2>
            <p class="gate-subtitle">
              {managingPolicies
                ? 'Solve the problem to manage grown-up checks'
                : 'Solve the problem to continue'}
            </p>
          </div>
        </header>
        <ParentalGateProblem />
        <ParentalGateKeypad bind:element={keypadEl} />
        {#if !managingPolicies}
          <ParentalGateManageFooter onManage={manageGatePolicies} />
        {/if}
      </div>
    {/if}
  </div>
</dialog>

<style>
  .parental-gate {
    width: calc(100vw - 2 * var(--modal-gutter));
    max-width: 336px;
    border-radius: var(--radius-lg);
  }

  .gate-content {
    padding: var(--space-6) var(--space-6) var(--space-5);
  }

  /* --gate-shake-duration is stamped by the markup from GATE_SHAKE_MS, the
     same constant that clears the shaking flag — one source of truth. */
  .gate-content.shaking {
    animation: gateShakeSoft var(--gate-shake-duration) ease-in-out;
  }

  @keyframes gateShakeSoft {
    15%,
    85% {
      transform: translateX(-1px);
    }
    30%,
    70% {
      transform: translateX(3px);
    }
    50% {
      transform: translateX(-3px);
    }
  }

  /* ── Header ─────────────────────────────────────────────────────────────── */
  .gate-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    margin-bottom: var(--space-3);
    text-align: center;
  }

  :global(.gate-mascot) {
    width: 54px;
    height: 54px;
  }

  .gate-heading {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .gate-title {
    margin: 0;
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-bold);
    color: var(--text-strong);
  }

  .gate-subtitle {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--text-soft);
  }

  /* ── Success state ──────────────────────────────────────────────────────── */
  .gate-success {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 300px;
    padding: var(--space-6);
    text-align: center;
    animation: gatePopIn var(--duration-slow) linear;
  }

  .gate-success-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 72px;
    height: 72px;
    border-radius: 50%;
    background: var(--success-wash);
  }

  :global(.gate-success-icon) {
    width: 40px;
    height: 40px;
  }

  :global(.gate-success-icon svg) {
    fill: var(--success-text);
  }

  .gate-success-title {
    margin: 0;
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-bold);
    color: var(--text-strong);
  }

  .gate-success-sub {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--text-soft);
    line-height: 1.4;
  }

  @keyframes gatePopIn {
    0% {
      transform: scale(0.3);
      opacity: 0;
      animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
    }
    70% {
      transform: scale(1.08);
      animation-timing-function: cubic-bezier(0.33, 1, 0.68, 1);
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  /* ── Landscape / short screens (mirrors SettingsModal's compact breakpoint)
     A stacked card is taller than a landscape phone, and the keypad's bottom
     row holds the check key: scrolling down to it would push the equation and
     its feedback out of view on every answer. So the keypad stands beside the
     problem, and everything a parent taps and reads shares one screen. */
  @media (orientation: landscape) and (max-height: 599px) {
    .parental-gate {
      max-width: 560px;
    }

    .gate-content {
      padding: var(--space-4) 22px;
    }

    .gate-main {
      display: grid;
      grid-template-rows: auto 1fr auto;
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        'header header'
        'problem keypad'
        'footer keypad';
      align-items: center;
      column-gap: var(--space-5);
      width: 100%;
    }

    .gate-main > :global(.gate-problem) {
      grid-area: problem;
    }

    .gate-main > :global(.gate-keypad) {
      grid-area: keypad;
    }

    .gate-main > :global(.gate-manage) {
      grid-area: footer;
      align-self: end;
    }

    .gate-header {
      grid-area: header;
      flex-direction: row;
      justify-content: center;
      gap: var(--space-2);
      text-align: left;
    }

    :global(.gate-mascot) {
      width: 42px;
      height: 42px;
    }

    .gate-title {
      font-size: var(--font-size-lg);
    }

    .gate-subtitle {
      font-size: var(--font-size-xs);
    }

    .gate-success {
      width: 100%;
      min-height: 240px;
    }
  }

  /* ── Roomy viewports: tablets, and desktop windows alike ─────────────────
     A gate that stays phone-sized on a tablet reads as incidental rather than
     as the boundary it is, so the card, the equation and the keypad take one
     step up once both axes clear the tablet-class floor. Classifying by
     viewport rather than by pointer is what the app already does
     (`isTabletViewport()`), so a roomy desktop window takes this step too.
     Both axes on purpose: a landscape phone is wide but short, and keeps the
     compact treatment above. 600px is TABLET_MIN_SIDE_PX, which a CSS media
     query cannot import — the agreement with it, and with AiImagePrompt's
     matching steps, is held by dialogTabletScaling.test.ts.

     The splats and keys grow only as far as the type ramp can follow: the
     digits inside them are capped at --font-size-xl (ADR-0098 removed the step
     above it), so sizes past roughly 60px would leave the numerals stranded in
     their targets. Geometry is tuned to hold the phone card's ~0.39 glyph-to-
     target ratio rather than to fill the available room. */
  @media (min-width: 600px) and (min-height: 600px) {
    .parental-gate {
      max-width: 420px;
    }

    .gate-content {
      padding: var(--space-6) var(--space-7);
    }

    :global(.gate-mascot) {
      width: 64px;
      height: 64px;
    }

    .gate-subtitle {
      font-size: var(--font-size-md);
    }

    .gate-success {
      min-height: 340px;
    }
  }

  /* ── Large tablets ───────────────────────────────────────────────────────
     A 13-inch iPad carries one more step (LARGE_TABLET_MIN_SIDE_PX). The scale
     stops here: past this the card starts reading as a page rather than as a
     focused, dismissible gate. The card and its surrounding space carry most
     of this step — the splats and keys move only as far as the capped digits
     inside them can follow. */
  @media (min-width: 1000px) and (min-height: 1000px) {
    .parental-gate {
      max-width: 480px;
    }

    .gate-content {
      padding: var(--space-7) var(--space-8);
    }

    :global(.gate-mascot) {
      width: 76px;
      height: 76px;
    }

    .gate-success {
      min-height: 380px;
    }
  }

  /* ── Reduced motion: fades instead of shake/pop (polaroid pattern). The
        card's own fly-in is calmed by app.css's shared .modal-fly-in rule. ── */
  :global(:root[data-reduce-motion]) .gate-content.shaking {
    animation: none;
  }
  .gate-success:global([data-start-reduced-motion]) {
    animation: gateFadeIn var(--duration-base) ease;
  }

  @keyframes gateFadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
