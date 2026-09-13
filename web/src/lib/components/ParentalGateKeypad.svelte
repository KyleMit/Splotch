<!--
  The Grown-Ups Only challenge's keypad: ten digits, Delete, and the check key
  that submits an answer. Keys stay focusable through a lockout (aria-disabled,
  not disabled) so a keyboard user's focus never falls out of the dialog.

  Its own component only because ParentalGate.svelte is at its line ceiling; it
  has no other call site, and it steps at the gate's viewport floors.
-->
<script lang="ts">
  import Icon from './Icon.svelte';
  import '$lib/components/deferredIcons';
  import { gate, pressGateKey, GATE_KEYPAD_KEYS } from '$lib/state/parentalGate.svelte';

  interface Props {
    /** The gate moves focus onto a key and routes Enter by whether a key has it. */
    element?: HTMLDivElement;
  }

  let { element = $bindable() }: Props = $props();

  const KEY_ICONS = { delete: 'backspace', submit: 'check' } as const;
  const KEY_LABELS = { delete: 'Delete', submit: 'Check answer' } as const;
</script>

<div class="gate-keypad" bind:this={element}>
  {#each GATE_KEYPAD_KEYS as key (key)}
    <button
      class="gate-key"
      aria-label={typeof key === 'number' ? undefined : KEY_LABELS[key]}
      aria-disabled={gate.lockoutMs !== null}
      onclick={() => pressGateKey(key)}
    >
      {#if typeof key === 'number'}
        {key}
      {:else}
        <Icon name={KEY_ICONS[key]} class="gate-key-icon" />
      {/if}
    </button>
  {/each}
</div>

<style>
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

  .gate-key:active:not([aria-disabled='true']) {
    transform: scale(0.92);
  }

  /* aria-disabled rather than disabled: a disabled key drops keyboard focus to
     <body>, outside the dialog's keydown handler, for the whole lockout. */
  .gate-key[aria-disabled='true'] {
    opacity: 0.45;
    cursor: default;
  }

  :global(.gate-key-icon) {
    width: 22px;
    height: 22px;
  }

  @media (orientation: landscape) and (max-height: 599px) {
    .gate-keypad {
      gap: 7px;
      max-width: 240px;
      margin: 0 auto;
    }

    .gate-key {
      height: 44px;
    }
  }

  @media (min-width: 600px) and (min-height: 600px) {
    .gate-keypad {
      gap: var(--space-3);
    }

    .gate-key {
      height: 56px;
      font-size: var(--font-size-xl);
    }

    :global(.gate-key-icon) {
      width: 26px;
      height: 26px;
    }
  }

  @media (min-width: 1000px) and (min-height: 1000px) {
    .gate-keypad {
      gap: var(--space-4);
    }

    .gate-key {
      height: 60px;
    }

    :global(.gate-key-icon) {
      width: 28px;
      height: 28px;
    }
  }
</style>
