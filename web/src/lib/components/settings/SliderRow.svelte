<script lang="ts">
  import type { CommonIconName } from '../iconTypes';
  import Icon from '../Icon.svelte';
  import Slider from '../Slider.svelte';

  // A labelled slider setting: a name/value label row above a <Slider>. `id`
  // wires the label to the slider via aria-labelledby, so the two can't drift
  // apart. With an `icon`, the name renders in the larger standalone-setting
  // typeface; without one it stays in the muted sub-setting style used when the
  // row sits indented under its own toggle. `help` is the calm sentence under
  // the track, wired to the slider through aria-describedby.
  interface Props {
    id: string;
    label: string;
    value: number;
    min?: number;
    max?: number;
    snap?: number;
    valueText?: string;
    icon?: CommonIconName;
    help?: string;
    onInput: (value: number) => void;
    onActiveChange?: (active: boolean) => void;
  }

  let { id, label, value, min, max, snap, valueText, icon, help, onInput, onActiveChange }: Props =
    $props();

  const displayedValueText = $derived(valueText ?? `${value}%`);
</script>

<div class="slider-row" class:indented={!icon}>
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
    describedBy={help ? `${id}-help` : undefined}
    {onInput}
    {onActiveChange}
  />
  {#if help}
    <p id="{id}-help" class="slider-help">{help}</p>
  {/if}
</div>

<style>
  /* An icon-less row is a sub-setting of the ToggleRow above it, so the whole
     row — label and track — shifts past that toggle's icon column to line up
     with its label. */
  .slider-row.indented {
    margin-left: var(--setting-indent);
  }

  .slider-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--text-soft);
  }

  /* --text-soft is pinned to hold 4.5:1 for this small help text on --surface
     (the /design axe scan enforces it). */
  .slider-help {
    margin: 8px 0 0;
    font-size: var(--font-size-sm);
    color: var(--text-soft);
    line-height: 1.4;
  }

  .slider-label-name {
    display: inline-flex;
    align-items: center;
    gap: var(--setting-icon-gap);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text);
  }
</style>
