<script lang="ts">
  import type { CommonIconName } from '../iconTypes';
  import Icon from '../Icon.svelte';
  import ToggleSwitch from './ToggleSwitch.svelte';

  // A single iOS-style toggle row: an icon + label on the left, a switch on the
  // right, and an optional help line below. `aria-label` is derived from `label`
  // so the visible text and the accessible name can never diverge. `onToggle`
  // receives the next boolean value.
  interface Props {
    icon: CommonIconName;
    label: string;
    id: string;
    checked: boolean;
    onToggle: (next: boolean) => void;
    help?: string;
    disabled?: boolean;
  }

  let { icon, label, id, checked, onToggle, help = '', disabled = false }: Props = $props();
</script>

<div class="setting-toggle" class:disabled>
  <label class="setting-info" for={id}>
    <Icon name={icon} class="setting-icon" />
    <span class="setting-label">{label}</span>
  </label>
  <ToggleSwitch
    {id}
    {label}
    {checked}
    {onToggle}
    {disabled}
    describedBy={help ? `${id}-help` : undefined}
  />
</div>
{#if help}
  <p id="{id}-help" class="setting-help" class:disabled>{help}</p>
{/if}

<style>
  .setting-toggle {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  /* --text-soft is pinned to hold 4.5:1 for this small help text on --surface
     (the /design axe scan enforces it). */
  .setting-help {
    margin: 6px 0 0 var(--setting-indent);
    font-size: var(--font-size-sm);
    color: var(--text-soft);
    line-height: 1.4;
  }

  .setting-info {
    display: flex;
    align-items: center;
    gap: var(--setting-icon-gap);
    cursor: pointer;
  }

  :global(.setting-icon) {
    width: var(--setting-icon-size);
    height: var(--setting-icon-size);
    flex-shrink: 0;
  }

  .setting-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text);
  }

  .setting-toggle.disabled,
  .setting-help.disabled {
    opacity: 0.55;
  }

  .setting-toggle.disabled .setting-info {
    cursor: default;
  }
</style>
