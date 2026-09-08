<script lang="ts">
  import { themes } from '$lib/design/tokens';
  import Icon from './Icon.svelte';

  interface Props {
    disabled?: boolean;
    kind?: 'picture' | 'problem';
    /** Handed the tap so the caller can fly the parental gate in from the flag. */
    onclick: (event: MouseEvent & { currentTarget: HTMLElement }) => void;
  }

  let { disabled = false, kind = 'picture', onclick }: Props = $props();
</script>

<div
  class="ai-result-disclosure"
  class:problem={kind === 'problem'}
  style:--text-soft={themes.dark.textSoft}
  style:--danger-text={themes.dark.dangerText}
>
  {#if kind === 'picture'}
    <span>AI-generated picture</span>
    <span class="ai-disclosure-separator" aria-hidden="true">·</span>
  {/if}
  <button
    class="ai-report-flag"
    aria-label={kind === 'problem' ? 'Report a problem' : 'Report this picture'}
    {onclick}
    {disabled}
  >
    <Icon name="flag" class="ai-report-flag-icon" />
    <span>{kind === 'problem' ? 'Report a problem' : 'Report'}</span>
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
    /* The backdrop is dark in both themes, so the strip uses the canonical
       dark theme's ink tokens. Its own ground keeps artwork from muddying text. */
    background: rgba(23, 23, 29, 0.72);
    color: var(--text-soft);
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

  .ai-result-disclosure.problem {
    left: auto;
    right: 0;
    transform: none;
  }

  .ai-disclosure-separator {
    color: var(--text-soft);
  }

  .ai-report-flag {
    /* Fine print, not a CTA: the visual stays small so a pre-reader doesn't
       target it, while transparent padding — cancelled by the matching negative
       margin so the strip's own height is unchanged — grows the tap target to
       --report-strip-tap. That target overhangs the pill it sits in, which is
       why the card's height budget reserves off the same token rather than off
       the pill (app.css). */
    --report-icon-size: 14px;
    min-width: var(--report-strip-tap);
    padding: calc((var(--report-strip-tap) - var(--report-icon-size)) / 2) 0;
    margin: calc((var(--report-icon-size) - var(--report-strip-tap)) / 2) 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    border: none;
    background: none;
    color: var(--danger-text);
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
    color: var(--text-soft);
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
