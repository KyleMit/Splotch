<script lang="ts">
  import type { CommonIconName } from '../iconTypes';
  import Icon from '../Icon.svelte';

  // The iOS-style switch behind every boolean in Settings: the trailing control
  // of a ToggleRow, and the inline switch on a phone hub row. `thumbIcon` rides
  // inside the thumb where the switch stands alone with no label beside it —
  // the hub's Night Mode row, where the sun/moon glyph is what names the state.
  interface Props {
    id: string;
    /** Accessible name; the visible label, where the caller renders one. */
    label: string;
    checked: boolean;
    onToggle: (next: boolean) => void;
    /** Id of the help line the caller renders, for `aria-describedby`. */
    describedBy?: string;
    disabled?: boolean;
    thumbIcon?: CommonIconName;
  }

  let {
    id,
    label,
    checked,
    onToggle,
    describedBy = undefined,
    disabled = false,
    thumbIcon = undefined,
  }: Props = $props();
</script>

<button
  class="toggle-switch"
  class:active={checked}
  {id}
  role="switch"
  aria-label={label}
  aria-checked={checked}
  aria-describedby={describedBy}
  {disabled}
  onclick={() => onToggle(!checked)}
>
  <span class="toggle-switch-thumb">
    {#if thumbIcon}
      <Icon name={thumbIcon} class="toggle-switch-glyph" aria-hidden="true" />
    {/if}
  </span>
</button>

<style>
  .toggle-switch {
    --switch-track-height: 32px;
    --switch-thumb-size: 26px;

    width: 52px;
    height: var(--touch-target-min);
    background: transparent;
    border: none;
    padding: 0;
    position: relative;
    cursor: pointer;
    flex-shrink: 0;
  }

  .toggle-switch::before {
    content: '';
    position: absolute;
    inset: calc((var(--touch-target-min) - var(--switch-track-height)) / 2) 0;
    background: var(--control-track);
    border-radius: var(--radius-pill);
    pointer-events: none;
    transition:
      background var(--duration-base) ease,
      box-shadow var(--duration-base) ease;
    /* The OFF track is two shades from its card (1.1:1); this rim gives its
       boundary the 3:1 WCAG 1.4.11 asks of a state you read by position. */
    box-shadow: inset 0 0 0 var(--border-width) var(--icon-muted);
  }

  .toggle-switch:focus-visible {
    outline: none;
  }

  .toggle-switch:focus-visible::before {
    outline: var(--focus-ring-width) solid var(--brand);
    outline-offset: var(--focus-ring-offset);
  }

  @media (hover: hover) {
    .toggle-switch:hover::before {
      background: var(--control-track-hover);
    }
  }

  .toggle-switch.active::before {
    background: var(--brand);
    box-shadow: none;
  }

  @media (hover: hover) {
    /* The textless --brand fill darkens through the same themed ramp the
       labeled fills rest on — there is no separate unthemed hover step. */
    .toggle-switch.active:hover::before {
      background: var(--brand-solid);
    }
  }

  .toggle-switch:disabled {
    cursor: default;
  }

  .toggle-switch-thumb {
    position: absolute;
    top: calc((var(--touch-target-min) - var(--switch-thumb-size)) / 2);
    left: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--switch-thumb-size);
    height: var(--switch-thumb-size);
    background: white;
    border-radius: 50%;
    box-shadow: 0 2px 4px rgb(0 0 0 / 20%);
    transition: transform var(--duration-base) ease;
  }

  .toggle-switch.active .toggle-switch-thumb {
    transform: translateX(20px);
  }

  /* Reduced motion: the thumb is where the state is, so it stays — it just
     stops sliding there. */
  :global(:root[data-reduce-motion]) .toggle-switch-thumb {
    transition: none;
  }

  /* The thumb is white on both papers, so the glyph on it cannot take the
     themed --icon-ink the modal shell re-inks monochrome icons with: that ink
     is near-white in dark mode. --brand-solid is the near-constant purple that
     reads on white either way. */
  :global(.toggle-switch-glyph) {
    width: 16px;
    height: 16px;
  }

  :global(.toggle-switch-glyph svg) {
    fill: var(--brand-solid);
  }
</style>
