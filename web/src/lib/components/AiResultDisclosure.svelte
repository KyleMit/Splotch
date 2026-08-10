<script lang="ts">
  import Icon from './Icon.svelte';

  interface Props {
    disabled?: boolean;
    onclick: () => void;
  }

  let { disabled = false, onclick }: Props = $props();
</script>

<div class="ai-result-disclosure">
  <span>AI-generated picture</span>
  <span class="ai-disclosure-separator" aria-hidden="true">·</span>
  <button class="ai-report-flag" aria-label="Report this picture" {onclick} {disabled}>
    <Icon name="flag" class="ai-report-flag-icon" />
    <span>Report</span>
  </button>
</div>

<style>
  .ai-result-disclosure {
    /* The strip hangs off the *card*, not the viewport, so the gap below the
       picture it discloses is the same on a phone and on a desktop. The dialog
       sets overflow: visible so this child can sit outside it. */
    position: absolute;
    top: calc(100% + var(--report-strip-gap));
    left: 50%;
    transform: translateX(-50%);
    z-index: 3;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    /* Height is declared rather than derived from padding because the card's
       height budget reserves --report-strip-height for this strip. */
    height: var(--report-strip-height);
    padding: 0 14px;
    border-radius: var(--radius-pill);
    /* The strip sits on the dimmed backdrop, which is dark in both themes
       (--modal-dialog::backdrop), so these colors are literal rather than theme
       tokens that would flip to dark ink on dark glass in light mode.

       Whatever is on the page is still showing through that backdrop, though,
       and under 12px text its bleed reads as muddiness rather than depth. So
       the pill lays down its own quiet ground: blur to erase the shape still
       coming through, saturate to drop the color cast bright artwork throws
       over the ink, and brightness to floor the ground dark however light that
       artwork is — the fill alone leaves the ink riding whatever is behind it.
       The ground itself is applied below; this fill is heavy enough to stay
       legible on its own where the engine can't paint it. */
    background: rgba(23, 23, 29, 0.72);
    color: #b3b1bf;
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    line-height: 1;
    white-space: nowrap;
  }

  /* The strip's ground, in an @supports block rather than a plain declaration
     beside `background` above, and unprefixed with no -webkit- twin beside it.
     Both are load-bearing: esbuild collapses an adjacent prefixed/unprefixed
     pair down to whichever single form `build.target` implies, and
     browserTargets.ts's safari16.4 implies the -webkit- one, which neither Blink
     nor Gecko ever aliased — a hand-written pair therefore ships a filter only
     WebKit can see. Left alone here, esbuild instead widens the condition to
     `(-webkit-backdrop-filter: …) or (backdrop-filter: …)` and emits both
     declarations inside it, which is the output every engine can use. */
  @supports (backdrop-filter: blur(1px)) {
    .ai-result-disclosure {
      backdrop-filter: blur(12px) saturate(0.6) brightness(0.55);
    }
  }

  .ai-disclosure-separator {
    opacity: 0.5;
  }

  .ai-report-flag {
    /* Fine print, not a CTA: the visual stays small so a pre-reader doesn't
       target it, while transparent padding — cancelled by the matching negative
       margin so the strip's own height is unchanged — grows the tap target to
       the app's 44px minimum. */
    --report-tap-size: 44px;
    --report-icon-size: 14px;
    min-width: var(--report-tap-size);
    padding: calc((var(--report-tap-size) - var(--report-icon-size)) / 2) 0;
    margin: calc((var(--report-icon-size) - var(--report-tap-size)) / 2) 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    border: none;
    background: none;
    color: #e09393;
    cursor: pointer;
    font: inherit;
    touch-action: manipulation;
    transition: transform var(--duration-fast) var(--ease-glide);
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
    width: var(--report-icon-size);
    height: var(--report-icon-size);
  }

  /* Beats the modal shell's icon re-ink (`:where(.modal-shell) … svg`), which is
     zero-specificity, so the flag takes the Report label's color. */
  :global(.ai-report-flag-icon svg) {
    fill: currentColor;
  }

  /* Guarded behind a real pointer: a touch browser applies :hover on tap and
     leaves it stuck there afterwards. */
  @media (hover: hover) {
    .ai-report-flag:not(:disabled):hover {
      text-decoration: underline;
    }
  }
</style>
