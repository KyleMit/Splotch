<script lang="ts" module>
  import type { CommonIconName } from '../iconTypes';

  export interface SegmentedPickerOption<T extends string> {
    value: T;
    label: string;
    icon?: CommonIconName;
    disabled?: boolean;
    /** Stable DOM id — E2E tests target options through these. */
    id?: string;
  }
</script>

<script lang="ts" generics="T extends string">
  import Icon from '../Icon.svelte';

  // Design-system picker primitive: the one owner of the selected-state
  // control pattern Button deliberately excludes — those are pickers, not
  // actions. Two skins share the option machinery: the iOS-style segmented
  // track whose active option reads as a raised card, and the borderless
  // toggle chips. Selection *semantics* stay with the caller: onSelect always fires
  // with the clicked value, so a radio caller sets it, while a toggle caller
  // may release it (the orientation segment) or flip it in a set (the chips).
  interface Props {
    /** Accessible name for the option group. */
    label: string;
    /** Visible explanatory copy associated with this picker. */
    describedBy?: string;
    options: SegmentedPickerOption<T>[];
    /**
     * The active value (or null when none is), or — for independent toggles
     * like the controls chips — the pressed subset.
     */
    selected: T | null | readonly T[];
    onSelect: (value: T) => void;
    /** radio = choose-one (radiogroup/aria-checked); toggle = pressable options (group/aria-pressed). */
    mode?: 'radio' | 'toggle';
    /** segment = raised-thumb track; chip = borderless toggle grid. */
    variant?: 'segment' | 'chip';
    size?: 'md' | 'sm';
    /** false = the track hugs its content instead of stretching full-width. */
    fill?: boolean;
  }

  let {
    label,
    describedBy,
    options,
    selected,
    onSelect,
    mode = 'radio',
    variant = 'segment',
    size = 'md',
    fill = true,
  }: Props = $props();

  function isSelected(value: T): boolean {
    return Array.isArray(selected) ? selected.includes(value) : selected === value;
  }
</script>

<div
  class={['picker', variant, size, fill && 'fill']}
  role={mode === 'radio' ? 'radiogroup' : 'group'}
  aria-label={label}
  aria-describedby={describedBy}
>
  {#each options as option (option.value)}
    {@const active = isSelected(option.value)}
    <button
      type="button"
      class="option"
      class:active
      id={option.id}
      disabled={option.disabled}
      role={mode === 'radio' ? 'radio' : undefined}
      aria-checked={mode === 'radio' ? active : undefined}
      aria-pressed={mode === 'toggle' ? active : undefined}
      onclick={() => onSelect(option.value)}
    >
      {#if option.icon}
        <Icon name={option.icon} class="picker-option-icon" />
      {/if}
      <span class="option-label">{option.label}</span>
      {#if variant === 'chip'}
        <span class="option-check" aria-hidden="true">{active ? '✓' : ''}</span>
      {/if}
    </button>
  {/each}
</div>

<style>
  .option {
    border: none;
    background: transparent;
    color: var(--text-soft);
    font-family: inherit;
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    touch-action: manipulation;
  }

  .option:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  /* The picker owns its icon ink (the modal shell's re-ink rule only reaches
     icons inside a modal, and pickers also render on plain surfaces). */
  .picker :global(.picker-option-icon svg) {
    fill: var(--icon-ink);
  }

  /* iOS-style segmented track: the active option reads as a raised card. */
  .segment {
    display: inline-flex;
    gap: var(--space-1);
    padding: var(--space-1);
    background: var(--control-track);
    border-radius: var(--radius-md);
  }

  .segment.fill {
    display: flex;
  }

  .segment .option {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    /* Concentric with the track: --radius-md outer minus the --space-1 inset. */
    border-radius: var(--radius-sm);
    transition:
      background var(--duration-fast) ease,
      color var(--duration-fast) ease,
      box-shadow var(--duration-fast) ease;
  }

  .segment.fill .option {
    flex: 1;
    min-width: 0;
  }

  .segment.md .option {
    padding: var(--space-2) var(--space-1);
    font-size: var(--font-size-sm);
  }

  /* A hugging track's options carry their own horizontal room instead of flexing. */
  .segment.md:not(.fill) .option {
    padding: var(--space-2) 14px;
  }

  /* Compact track: option height runs 1px shy of the md step so a picker cell
     lines up with the toggle rows beside it in the landscape settings shell. */
  .segment.sm .option {
    padding: 7px var(--space-1);
    font-size: var(--font-size-xs);
  }

  @media (hover: hover) {
    .segment .option:not(.active):hover {
      color: var(--text-strong);
    }
  }

  .segment .option.active {
    background: var(--surface);
    color: var(--text-strong);
    box-shadow: var(--shadow-control);
  }

  .segment.md :global(.picker-option-icon) {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  .segment.sm :global(.picker-option-icon) {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
  }

  /* Borderless toggle chips in a two-column grid — the independent-toggles
     skin. No hairline: an unselected chip rests on the same recessed
     --control-track the segment variant's track uses, which reads as its own
     surface without one and leaves the whole chip box for the icon instead of
     spending it on the border and its inset. */
  .chip {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  .chip .option {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 11px 12px;
    border-radius: var(--radius-md);
    background: var(--control-track);
    font-size: var(--font-size-sm);
    transition:
      background var(--duration-fast) ease,
      color var(--duration-fast) ease;
  }

  @media (hover: hover) {
    .chip .option:not(.active):hover {
      background: var(--control-track-hover);
      color: var(--text-strong);
    }
  }

  /* --brand-solid, not --brand: the chip carries its label on this fill, and
     --brand is only 3.4:1 against --on-brand (fails WCAG AA at body size). */
  .chip .option.active {
    background: var(--brand-solid);
    color: var(--on-brand);
  }

  @media (hover: hover) {
    .chip .option.active:hover {
      background: var(--brand-solid-hover);
    }
  }

  .chip .option-label {
    flex: 1;
    min-width: 0;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chip :global(.picker-option-icon) {
    width: 26px;
    height: 26px;
    flex-shrink: 0;
  }

  /* The chip's icon follows the chip ink so it flips to white when on. */
  .chip .option.active :global(.picker-option-icon svg) {
    fill: var(--on-brand);
  }

  .option-check {
    flex-shrink: 0;
    width: 14px;
    text-align: center;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
  }
</style>
