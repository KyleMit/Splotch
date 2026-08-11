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
    width: 52px;
    height: 32px;
    background: var(--control-track);
    border: none;
    border-radius: var(--radius-pill);
    padding: 0;
    position: relative;
    cursor: pointer;
    transition: background var(--duration-base) ease;
    flex-shrink: 0;
  }

  @media (hover: hover) {
    .toggle-switch:hover {
      background: var(--control-track-hover);
    }
  }

  .toggle-switch.active {
    background: var(--brand);
  }

  @media (hover: hover) {
    /* The textless --brand fill darkens through the same themed ramp the
       labeled fills rest on — there is no separate unthemed hover step. */
    .toggle-switch.active:hover {
      background: var(--brand-solid);
    }
  }

  .toggle-switch:disabled {
    cursor: default;
  }

  .toggle-switch-thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    background: white;
    border-radius: 50%;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    transition: transform var(--duration-base) ease;
  }

  .toggle-switch.active .toggle-switch-thumb {
    transform: translateX(20px);
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
