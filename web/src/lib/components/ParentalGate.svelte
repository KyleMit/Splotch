<script lang="ts">
  import Icon from './Icon.svelte';
  import SplotchyIcon from './SplotchyIcon.svelte';
  import { modalDialog } from '$lib/actions/modalDialog.svelte';
  import { paletteHex } from '$lib/palette';
  import { COLOR_FAMILIES } from '$lib/hexPickerLayout';
  import {
    gate,
    dismissGate,
    pressGateDigit,
    pressGateBackspace,
    GATE_SHAKE_MS,
  } from '$lib/state/parentalGate.svelte';

  // Operand splats wear crayon hues, not chrome tokens — they read as paint.
  // Both fills must hold ≥3:1 against the --on-brand digit (WCAG AA large
  // text, asserted in a11y.spec.ts): palette Purple passes at 3.40:1, but
  // palette Blue only reaches 2.67:1, so the second splat borrows the
  // picker's mid-blue (3.12:1) instead.
  const OPERAND_FILLS = [
    paletteHex('Purple'),
    COLOR_FAMILIES.find((family) => family.name === 'blues')!.shades[4],
  ];
  // Organic blob shapes; plain geometry, one per operand so the pair reads as
  // two hand-made daubs rather than stamped circles.
  const OPERAND_RADII = ['58% 42% 55% 45% / 45% 58% 42% 55%', '45% 55% 48% 52% / 55% 45% 58% 42%'];

  const KEYPAD_DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

  // One dab per answer digit, filled left-to-right as the adult types.
  const dabs = $derived(
    Array.from({ length: String(gate.x * gate.y).length }, (_, i) => gate.input[i] ?? '')
  );

  function handleKeydown(event: KeyboardEvent) {
    if (event.key >= '0' && event.key <= '9') pressGateDigit(Number(event.key));
    else if (event.key === 'Backspace') pressGateBackspace();
  }
</script>

<dialog
  class="parental-gate modal-dialog modal-fly-in modal-shell"
  id="parentalGate"
  aria-labelledby="parentalGateTitle"
  use:modalDialog={() => ({
    open: gate.open,
    origin: gate.origin,
    onRequestClose: dismissGate,
    // A correct answer is committed: dismissing during the success hold would
    // silently drop the captured destination, so backdrop taps and Esc are
    // blocked until the handoff runs.
    allowDismiss: () => !gate.unlocked,
  })}
  onkeydown={handleKeydown}
>
  <div
    class="gate-content"
    class:shaking={gate.shaking}
    style:--gate-shake-duration={`${GATE_SHAKE_MS}ms`}
  >
    {#if gate.unlocked}
      <div class="gate-success" role="status">
        <span class="gate-success-badge">
          <Icon name="check" class="gate-success-icon" />
        </span>
        <h2 class="gate-success-title" id="parentalGateTitle">Unlocked!</h2>
        <p class="gate-success-sub">You're all set.</p>
      </div>
    {:else}
      <button class="modal-close-btn" aria-label="Close" onclick={dismissGate}>
        <Icon name="close" class="modal-close-icon" />
      </button>
      <div class="gate-main">
        <header class="gate-header">
          <SplotchyIcon class="gate-mascot" />
          <div class="gate-heading">
            <h2 class="gate-title" id="parentalGateTitle">Grown-Ups Only</h2>
            <p class="gate-subtitle">Solve the problem to continue</p>
          </div>
        </header>
        <!-- The row's label carries the whole equation for assistive tech (and
             the native smoke test); the digit visuals inside are aria-hidden so
             the only "5" in the accessibility tree is the keypad key. -->
        <div class="gate-equation" role="img" aria-label={`What is ${gate.x} times ${gate.y}?`}>
          <span
            class="gate-operand"
            aria-hidden="true"
            style:background={OPERAND_FILLS[0]}
            style:border-radius={OPERAND_RADII[0]}>{gate.x}</span
          >
          <span class="gate-operator" aria-hidden="true">×</span>
          <span
            class="gate-operand"
            aria-hidden="true"
            style:background={OPERAND_FILLS[1]}
            style:border-radius={OPERAND_RADII[1]}>{gate.y}</span
          >
          <span class="gate-operator" aria-hidden="true">=</span>
          {#each dabs as digit, i (i)}
            <span class="gate-dab" class:filled={digit !== ''} aria-hidden="true">{digit}</span>
          {/each}
        </div>
        <p class="gate-error" role="status">{gate.error ?? ''}</p>
        <div class="gate-keypad">
          {#each KEYPAD_DIGITS as digit (digit)}
            <button class="gate-key" onclick={() => pressGateDigit(digit)}>{digit}</button>
          {/each}
          <button class="gate-key" aria-label="Delete" onclick={pressGateBackspace}>
            <Icon name="backspace" class="gate-key-icon" />
          </button>
        </div>
      </div>
    {/if}
  </div>
</dialog>

<style>
  .parental-gate {
    width: min(92vw, 336px);
    border-radius: var(--radius-lg);
  }

  .gate-content {
    padding: 22px var(--space-6) var(--space-5);
  }

  /* --gate-shake-duration is stamped by the markup from GATE_SHAKE_MS, the
     same constant that clears the shaking flag — one source of truth. */
  .gate-content.shaking {
    animation: gateShakeSoft var(--gate-shake-duration) ease;
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

  /* ── Equation ───────────────────────────────────────────────────────────── */
  .gate-equation {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }

  .gate-operand {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 54px;
    height: 54px;
    flex-shrink: 0;
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-bold);
    /* The splat is a brand/crayon fill, so its digit wears the on-brand ink. */
    color: var(--on-brand);
  }

  .gate-operator {
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-bold);
    color: var(--text-soft);
  }

  .gate-dab {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 54px;
    flex-shrink: 0;
    border-radius: 52% 48% 55% 45% / 45% 55% 45% 55%;
    border: 2px dashed var(--border-warm-strong);
    background: transparent;
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-bold);
    color: var(--brand-text);
    transition:
      background var(--duration-fast) ease,
      border-color var(--duration-fast) ease;
  }

  .gate-dab.filled {
    border-color: transparent;
    background: var(--brand-wash);
  }

  /* Fixed-height line so the message appearing doesn't shift the keypad. */
  .gate-error {
    height: 18px;
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--danger-text);
    text-align: center;
  }

  /* ── Keypad ─────────────────────────────────────────────────────────────── */
  .gate-keypad {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-2);
  }

  .gate-key {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 46px;
    border: none;
    border-radius: var(--radius-md);
    background: var(--surface-2);
    font-family: inherit;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    color: var(--text-strong);
    cursor: pointer;
    touch-action: manipulation;
    transition: background var(--duration-fast) ease;
  }

  @media (hover: hover) {
    .gate-key:hover {
      background: var(--brand-wash);
    }
  }

  .gate-key:active {
    transform: scale(0.92);
  }

  :global(.gate-key-icon) {
    width: 22px;
    height: 22px;
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
    animation: gatePopIn var(--duration-slow) var(--ease-pop);
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
    }
    70% {
      transform: scale(1.08);
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  /* ── Landscape / short screens (mirrors SettingsModal's compact breakpoint) */
  @media (orientation: landscape) and (max-height: 599px) {
    .parental-gate {
      width: min(94vw, 336px);
    }

    .gate-content {
      padding: var(--space-5) 22px;
    }

    .gate-main {
      width: 100%;
    }

    .gate-header {
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

    .gate-operand {
      width: 48px;
      height: 48px;
      font-size: var(--font-size-xl);
    }

    .gate-error {
      height: 16px;
    }

    .gate-keypad {
      gap: 7px;
      max-width: 240px;
      margin: 0 auto;
    }

    .gate-key {
      height: 44px;
    }

    .gate-success {
      width: 100%;
      min-height: 240px;
    }
  }

  /* ── Reduced motion: fades instead of fly/shake/pop (polaroid pattern) ──── */
  @media (prefers-reduced-motion: reduce) {
    .parental-gate.modal-fly-in[open] {
      animation: gateFadeIn var(--duration-base) ease;
    }

    .gate-content.shaking {
      animation: none;
    }

    .gate-success {
      animation: gateFadeIn var(--duration-base) ease;
    }
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
