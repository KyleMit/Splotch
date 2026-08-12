<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  // Design-system button primitive (ADR-0071): the shared chrome for
  // text-labeled buttons on modal/settings surfaces. Canvas-floating controls
  // (Actions Panel, corner buttons) keep their bespoke paper treatments.
  //
  // Variants map to the token washes:
  //   brand  — solid purple, the primary action
  //   wash   — brand-tinted fill, secondary / selected
  //   danger — destructive confirm (Clear, delete key)
  //
  // Sizes step the label, not just the box: sm/md both carry the 14px chrome
  // label and differ only in padding, while lg takes --font-size-md so a pair
  // of buttons can read as a screen's primary decision rather than as chrome.
  interface Props extends HTMLButtonAttributes {
    variant?: 'brand' | 'wash' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    children: Snippet;
  }

  let { variant = 'wash', size = 'md', children, class: className, ...rest }: Props = $props();
</script>

<button type="button" class={['btn', variant, size, className]} {...rest}>
  {@render children()}
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    border: none;
    border-radius: var(--radius-md);
    font-family: inherit;
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    touch-action: manipulation;
    transition:
      background var(--duration-base) ease,
      border-color var(--duration-base) ease,
      color var(--duration-base) ease,
      transform var(--duration-fast) ease;
  }

  .btn:active:not(:disabled) {
    transform: scale(0.96);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* 14px of vertical padding, not a --space step: it is what carries a 16px
     label to the app's 44px minimum target. */
  .lg {
    padding: 14px var(--space-4);
    font-size: var(--font-size-md);
  }

  .md {
    padding: var(--space-3) var(--space-5);
    font-size: var(--font-size-sm);
  }

  .sm {
    padding: var(--space-2) var(--space-4);
    font-size: var(--font-size-sm);
  }

  /* --brand-solid, not --brand: this fill carries a text label, and --brand is
     only 3.4:1 against --on-brand (fails WCAG AA at body size). */
  .brand {
    background: var(--brand-solid);
    color: var(--on-brand);
  }

  .wash {
    background: var(--brand-wash);
    color: var(--brand-text);
  }

  .danger {
    background: var(--danger-wash);
    color: var(--danger-text);
  }

  @media (hover: hover) {
    .brand:hover:not(:disabled) {
      background: var(--brand-solid-hover);
    }

    .wash:hover:not(:disabled) {
      background: var(--brand-wash-hover);
    }

    .danger:hover:not(:disabled) {
      background: var(--danger-text);
      color: var(--danger-wash);
    }
  }
</style>
