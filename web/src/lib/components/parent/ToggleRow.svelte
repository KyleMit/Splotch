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
    disabled?: boolean;
  }

  let { icon, label, id, checked, onToggle, help = '', disabled = false }: Props = $props();
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
    {disabled}
    role="switch"
    aria-label={label}
    aria-checked={checked}
    onclick={() => onToggle(!checked)}
  >
    <span class="toggle-switch-thumb"></span>
  </button>
</div>
{#if help}
  <p class="setting-help">{help}</p>
{/if}

<style>
  .setting-toggle {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .setting-help {
    margin: 6px 0 0 30px;
    font-size: var(--font-size-sm);
    color: var(--text-muted);
    line-height: 1.4;
  }

  .setting-info {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
  }

  :global(.setting-icon) {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .setting-label {
    font-size: var(--font-size-md);
    font-weight: 500;
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
    .toggle-switch.active:hover {
      background: var(--brand-hover);
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

  .toggle-switch:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  @media (hover: hover) {
    .toggle-switch:disabled:hover {
      background: var(--control-track);
    }
  }
</style>
