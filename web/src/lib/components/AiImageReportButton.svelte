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
</button>

<style>
  .ai-report-flag {
    position: absolute;
    left: calc(
      50vw + 50% - var(--report-flag-inset) - env(safe-area-inset-right) - var(--report-flag-size)
    );
    top: calc(
      50vh + 50% - var(--report-flag-inset) - env(safe-area-inset-bottom) - var(--report-flag-size)
    );
    z-index: 3;
    width: var(--report-flag-size);
    height: var(--report-flag-size);
    padding: 10px;
    display: grid;
    place-items: center;
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-pill);
    background: var(--surface);
    box-shadow: var(--shadow-control);
    cursor: pointer;
    touch-action: manipulation;
    transition:
      transform var(--duration-fast) var(--ease-glide),
      background var(--duration-base) var(--ease-glide),
      border-color var(--duration-base) var(--ease-glide);
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
    fill: var(--icon-muted);
    transition: fill var(--duration-base) var(--ease-glide);
  }

  @media (hover: hover) {
    .ai-report-flag:not(:disabled):hover {
      background: var(--surface-hover);
      border-color: var(--border-warm-strong);
    }

    .ai-report-flag:not(:disabled):hover :global(.ai-report-flag-icon svg) {
      fill: var(--icon-ink);
    }
  }
</style>
