<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  // Design-system button primitive (ADR-0071): the shared chrome for
  // text-labeled buttons on modal/parent surfaces. Canvas-floating controls
  // (Actions Panel, corner buttons) keep their bespoke paper treatments.
  //
  // Variants map to the token washes:
  //   brand  — solid purple, the primary action
  //   wash   — brand-tinted fill, secondary / selected
  //   danger — destructive confirm (Clear, delete key)
  //   ghost  — quiet bordered action on any surface
  interface Props extends HTMLButtonAttributes {
    variant?: 'brand' | 'wash' | 'danger' | 'ghost';
    size?: 'sm' | 'md';
    children: Snippet;
  }

  let { variant = 'wash', size = 'md', children, ...rest }: Props = $props();
</script>

<button type="button" class="btn {variant} {size}" {...rest}>
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
    font-weight: 600;
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

  .md {
    padding: var(--space-3) var(--space-5);
    font-size: var(--text-md);
  }

  .sm {
    padding: var(--space-2) var(--space-4);
    font-size: var(--text-sm);
  }

  .brand {
    background: var(--brand);
    color: #fff;
  }

  .wash {
    background: var(--brand-wash);
    color: var(--brand-text);
  }

  .danger {
    background: var(--danger-wash);
    color: var(--danger-text);
  }

  .ghost {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-mid);
  }

  @media (hover: hover) {
    .brand:hover:not(:disabled) {
      background: var(--brand-hover);
    }

    .wash:hover:not(:disabled) {
      background: var(--brand-wash-hover);
    }

    .danger:hover:not(:disabled) {
      background: var(--danger-text);
      color: var(--danger-wash);
    }

    .ghost:hover:not(:disabled) {
      background: var(--surface-hover);
      color: var(--text-strong);
    }
  }
</style>
