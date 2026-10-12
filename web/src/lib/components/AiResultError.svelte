<script lang="ts">
  import AiImageReport from './AiImageReport.svelte';
  import AiErrorCard from './AiErrorCard.svelte';
  import Button from './design/Button.svelte';
  import type { AiErrorPhase } from '$lib/state/aiGeneration.svelte';
  import { AI_SAFETY_REFUSAL_MESSAGE } from '$lib/ai/loadingCopy';
  import type { ImageReportFlow } from './imageReportFlow.svelte';

  // The result card's error section: a safety refusal guides the child to draw
  // something else and offers grown-ups a report; anything else is the error
  // card with its own report. Both send the card's `report`, whose outcome the
  // refusal's launcher gives way to.
  let {
    error,
    previewUrl,
    report,
    onRequestReport,
  }: {
    error: AiErrorPhase;
    previewUrl: string | null;
    report: ImageReportFlow;
    onRequestReport: (event: MouseEvent & { currentTarget: HTMLElement }) => void;
  } = $props();

  const safety = $derived(error.errorKind === 'safety');
</script>

<div class="ai-result-error" class:safety class:server={!safety}>
  {#if error.errorKind === 'safety'}
    <p>{AI_SAFETY_REFUSAL_MESSAGE}</p>
    <p class="ai-result-error-sub">That picture didn't work — try drawing something different!</p>
    <div class="ai-refusal-report">
      <span class="ai-refusal-report-label" id="refusalReportAudience">For grown-ups</span>
      {#if !report.settled}
        <Button
          size="md"
          aria-describedby="refusalReportAudience"
          onclick={onRequestReport}
          disabled={!previewUrl}>Report this refusal</Button
        >
      {/if}
      <AiImageReport
        kind="false-positive-refusal"
        outputUrl={null}
        reportToken={error.reportToken}
        {report}
      />
    </div>
  {:else}
    <AiErrorCard>
      <AiImageReport
        kind="generation-error"
        outputUrl={null}
        reportToken={null}
        failure={error.details}
        {report}
      />
    </AiErrorCard>
  {/if}
</div>

<style>
  .ai-result-error {
    width: min(86vw, 380px);
    min-height: 240px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    text-align: center;
    color: var(--text);
  }
  .ai-result-error p {
    margin: 0;
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
  }
  .ai-result-error p.ai-result-error-sub {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-soft);
    max-width: 280px;
  }

  /* The error card sizes itself; the section only has to stop reserving room. */
  .ai-result-error.server {
    width: 100%;
    min-height: 0;
    height: auto;
    flex-shrink: 0;
    gap: 0;
  }

  .ai-refusal-report {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-1);
  }

  .ai-refusal-report-label {
    color: var(--text-soft);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
  }

  /* Very short viewports: shrink the error art so it still fits. */
  @media (max-height: 480px) {
    .ai-result-error {
      min-height: 0;
      height: calc(94vh - 96px);
    }
  }
</style>
