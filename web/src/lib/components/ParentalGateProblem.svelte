<!--
  The Grown-Ups Only challenge's problem: the equation with its answer dabs, the
  line under it that says what just happened, and the screen-reader
  announcements for the same moments. The visible line is hidden from assistive
  tech because a lockout's countdown rewrites it every second; the announcement
  region speaks only at the moments worth hearing (parentalGate.svelte.ts).

  Its own component only because ParentalGate.svelte is at its line ceiling; it
  has no other call site, and it steps at the gate's viewport floors.
-->
<script lang="ts">
  import { paletteHex } from '$lib/palette';
  import { colorFamilyShade } from '$lib/hexPickerLayout';
  import { parentalGateState } from '$lib/state/parentalGate.svelte';

  // Operand splats wear crayon hues, not chrome tokens — they read as paint.
  // Both fills must hold ≥3:1 against the --on-brand digit (WCAG AA large
  // text, asserted in a11y.spec.ts): palette Purple passes at 3.40:1, but
  // palette Blue only reaches 2.67:1, so the second splat borrows the
  // picker's mid-blue (3.12:1) instead.
  const OPERAND_FILLS = [paletteHex('Purple'), colorFamilyShade('blues', 4)];
  // Organic blob shapes; plain geometry, one per operand so the pair reads as
  // two hand-made daubs rather than stamped circles.
  const OPERAND_RADII = ['58% 42% 55% 45% / 45% 58% 42% 55%', '45% 55% 48% 52% / 55% 45% 58% 42%'];

  // One dab per answer digit, filled left-to-right as the adult types.
  const dabs = $derived(
    Array.from(
      { length: String(parentalGateState.x * parentalGateState.y).length },
      (_, i) => parentalGateState.input[i] ?? ''
    )
  );
</script>

<div class="gate-problem">
  <!-- The row's label carries the whole equation for assistive tech (and
       the native smoke test); the digit visuals inside are aria-hidden so
       the only "5" in the accessibility tree is the keypad key. -->
  <div
    class="gate-equation"
    role="img"
    aria-label={`What is ${parentalGateState.x} times ${parentalGateState.y}?`}
  >
    <span
      class="gate-operand"
      aria-hidden="true"
      style:background={OPERAND_FILLS[0]}
      style:border-radius={OPERAND_RADII[0]}>{parentalGateState.x}</span
    >
    <span class="gate-operator" aria-hidden="true">×</span>
    <span
      class="gate-operand"
      aria-hidden="true"
      style:background={OPERAND_FILLS[1]}
      style:border-radius={OPERAND_RADII[1]}>{parentalGateState.y}</span
    >
    <span class="gate-operator" aria-hidden="true">=</span>
    {#each dabs as digit, i (i)}
      <span class="gate-dab" class:filled={digit !== ''} aria-hidden="true">{digit}</span>
    {/each}
  </div>
  <p class="gate-error" aria-hidden="true">
    {parentalGateState.lockoutMessage ?? parentalGateState.error ?? ''}
  </p>
  <p class="visually-hidden" role="status">{parentalGateState.announcement}</p>
</div>

<style>
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
    border-radius: 52% 48% 55% 45% / 45% 55%;
    /* An empty dab is drawn by this edge alone, and it is the only hint of
       how many digits the answer has, so it needs the 3:1 non-text floor
       the warm border (1.9:1) misses. */
    border: 2px dashed var(--icon-muted);
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
    margin: var(--space-2) 0 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--danger-text);
    text-align: center;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  /* Narrow enough to share the landscape card with the keypad beside it. */
  @media (orientation: landscape) and (max-height: 599px) {
    .gate-equation {
      gap: 6px;
    }

    .gate-dab {
      width: 44px;
      height: 48px;
    }

    .gate-operand {
      width: 48px;
      height: 48px;
      font-size: var(--font-size-xl);
    }

    /* The keypad column sets the card's height here, so the problem column
       has room to give the message more air without growing the card. */
    .gate-error {
      height: 16px;
      margin-top: var(--space-3);
    }
  }

  @media (min-width: 600px) and (min-height: 600px) {
    .gate-equation {
      gap: var(--space-3);
    }

    .gate-operand {
      width: 58px;
      height: 58px;
    }

    .gate-dab {
      width: 52px;
      height: 58px;
    }

    .gate-error {
      height: 20px;
      font-size: var(--font-size-sm);
    }
  }

  @media (min-width: 1000px) and (min-height: 1000px) {
    .gate-equation {
      gap: var(--space-4);
    }

    .gate-operand {
      width: 60px;
      height: 60px;
    }

    .gate-dab {
      width: 54px;
      height: 60px;
    }
  }
</style>
