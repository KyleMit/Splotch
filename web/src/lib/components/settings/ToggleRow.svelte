<script lang="ts">
  import type { CommonIconName } from '../iconTypes';
  import Icon from '../Icon.svelte';

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
  }

  let { icon, label, id, checked, onToggle, help = '' }: Props = $props();
</script>

<div class="setting-toggle">
  <label class="setting-info" for={id}>
    <Icon name={icon} class="setting-icon" />
    <span class="setting-label">{label}</span>
  </label>
  <button
    class="toggle-switch"
    class:active={checked}
    {id}
    role="switch"
    aria-label={label}
    aria-checked={checked}
    aria-describedby={help ? `${id}-help` : undefined}
    onclick={() => onToggle(!checked)}
  >
    <span class="toggle-switch-thumb"></span>
  </button>
</div>
{#if help}
  <p id="{id}-help" class="setting-help">{help}</p>
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

  /* iOS-style toggle switch (boolean settings) */
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

  .toggle-switch-thumb {
    position: absolute;
    top: 3px;
    left: 3px;
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
</style>
