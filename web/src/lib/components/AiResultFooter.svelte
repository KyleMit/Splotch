<script lang="ts">
  import Icon from './Icon.svelte';
  import AiImageReport from './AiImageReport.svelte';
  import type { AiResultPhase } from '$lib/state/aiGeneration.svelte';
  import type { ImageReportFlow } from './imageReportFlow.svelte';
  import { autoSaveFooter } from '$lib/ai/autoSaveCopy';
  import '$lib/components/deferredIcons';
  import { stampMotionAtStart } from '$lib/platform/reducedMotion';

  let {
    result,
    report,
    ondownload,
  }: {
    result: AiResultPhase;
    report: ImageReportFlow;
    ondownload: () => void;
  } = $props();

  const footer = $derived(autoSaveFooter(result.autoSave));
</script>

<div class="ai-result-footer">
  {#if footer?.kind === 'saved'}
    <p class="ai-result-saved" use:stampMotionAtStart>✓ {footer.caption}</p>
  {:else if footer?.kind === 'downloadButton'}
    <button class="ai-result-download" onclick={ondownload} use:stampMotionAtStart>
      <Icon name="download" class="ai-result-download-icon" />
      <span>Download</span>
    </button>
  {/if}
  <AiImageReport outputUrl={result.url} reportToken={result.reportToken} {report} />
</div>

<style>
  /* ── Saved caption (auto-save mode, replaces the Download button) ── */
  .ai-result-saved {
    margin: 0;
    color: var(--success-text);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    animation: downloadPop 0.4s backwards 0.25s var(--ease-pop);
  }

  .ai-result-footer {
    min-height: var(--loading-caption-height);
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
  }

  /* ── Download button ── */
  .ai-result-download {
    height: 44px;
    padding: 0 22px;
    /* --brand-solid, not --brand: the fill carries its 14px bold label, and
       --brand is only 3.4:1 against --on-brand (fails WCAG AA below
       large-text size). */
    background: var(--brand-solid);
    border: none;
    border-radius: var(--radius-pill);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--on-brand);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--brand) 40%, transparent);
    transition:
      transform var(--duration-fast) ease,
      background var(--duration-base) ease;
    animation: downloadPop 0.4s backwards 0.25s var(--ease-pop);
  }

  /* Guard hover behind a real pointer: touch browsers apply :hover on tap and
     keep it sticky, leaving the button's background stuck after a tap. */
  @media (hover: hover) {
    .ai-result-download:hover {
      background: var(--brand-solid-hover);
    }
  }
  .ai-result-download:active {
    transform: scale(0.95);
  }

  @keyframes downloadPop {
    from {
      transform: scale(0);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }

  /* Reduced motion: the footer still arrives a beat after the picture, so the
     staging still reads — it fades up instead of springing open. Both footers
     share the pop and both take the fade: the Download button, and the saved
     caption that replaces it when auto-save is on. */
  .ai-result-download:global([data-start-reduced-motion]),
  .ai-result-saved:global([data-start-reduced-motion]) {
    animation-name: downloadFadeIn;
  }

  @keyframes downloadFadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .ai-result-download :global(.ai-result-download-icon) {
    width: 18px;
    height: 18px;
    pointer-events: none;
  }

  /* Solid white on the brand button in both themes (a filter over the themed
     icon re-ink would drift dark in dark mode). */
  .ai-result-download :global(.ai-result-download-icon svg) {
    fill: var(--on-brand);
  }
</style>
