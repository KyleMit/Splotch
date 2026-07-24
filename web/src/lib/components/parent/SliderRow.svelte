<script lang="ts">
  import type { CommonIconName } from '../iconTypes';
  import Icon from '../Icon.svelte';
  import Slider from '../Slider.svelte';

  // A labelled slider setting: a name/value label row above a <Slider>. `id`
  // wires the label to the slider via aria-labelledby, so the two can't drift
  // apart. With an `icon`, the name renders in the larger standalone-setting
  // typeface; without one it stays in the muted sub-setting style used when the
  // row sits indented under its own toggle.
  interface Props {
    id: string;
    label: string;
    value: number;
    min?: number;
    max?: number;
    snap?: number;
    valueText?: string;
    icon?: CommonIconName;
    onInput: (value: number) => void;
    onActiveChange?: (active: boolean) => void;
  }

  let { id, label, value, min, max, snap, valueText, icon, onInput, onActiveChange }: Props =
    $props();

  const displayedValueText = $derived(valueText ?? `${value}%`);
</script>

<div class="slider-label" {id}>
  {#if icon}
    <span class="slider-label-name">
      <Icon name={icon} class="setting-icon" />
      {label}
    </span>
  {:else}
    <span>{label}</span>
  {/if}
  <span>{displayedValueText}</span>
</div>
<Slider
  {value}
  {min}
  {max}
  {snap}
  labelId={id}
  valueText={displayedValueText}
  {onInput}
  {onActiveChange}
/>

<style>
  .slider-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--text-mid);
  }

  .slider-label-name {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-size: var(--font-size-md);
    font-weight: 500;
    color: var(--text);
  }
</style>
