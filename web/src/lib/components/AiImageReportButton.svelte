<script lang="ts">
  import Icon from './Icon.svelte';

  interface Props {
    disabled?: boolean;
    onclick: () => void;
  }

  let { disabled = false, onclick }: Props = $props();
</script>

<button class="ai-report-flag" aria-label="Report this picture" {onclick} {disabled}>
  <Icon name="flag" class="ai-report-flag-icon" />
  <span>Report</span>
</button>

<style>
  .ai-report-flag {
    position: absolute;
    right: calc(50% - 50vw + var(--report-flag-inset) + env(safe-area-inset-right));
    bottom: calc(50% - 50dvh + var(--report-flag-inset) + env(safe-area-inset-bottom));
    z-index: 3;
    min-width: var(--report-flag-size);
    height: var(--report-flag-size);
    padding: 0 var(--space-3);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    border: var(--border-width) solid var(--danger-text);
    border-radius: var(--radius-pill);
    background: var(--danger-text);
    color: var(--danger-wash);
    box-shadow: var(--shadow-control);
    cursor: pointer;
    font-family: inherit;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    touch-action: manipulation;
    transition:
      transform var(--duration-fast) var(--ease-glide),
      box-shadow var(--duration-base) var(--ease-glide);
  }

  .ai-report-flag:focus-visible {
    outline: 3px solid var(--brand);
    outline-offset: 2px;
  }

  .ai-report-flag:active {
    transform: scale(0.95);
  }

  .ai-report-flag:disabled {
    cursor: default;
    opacity: 0.5;
  }

  :global(.ai-report-flag-icon) {
    width: 24px;
    height: 24px;
  }

  :global(.ai-report-flag-icon svg) {
    fill: currentColor;
  }

  @media (hover: hover) {
    .ai-report-flag:not(:disabled):hover {
      transform: translateY(-1px);
    }
  }
</style>
