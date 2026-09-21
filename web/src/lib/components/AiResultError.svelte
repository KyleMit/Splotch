<script lang="ts">
  import AiImageReport, { type ImageReportStatus } from './AiImageReport.svelte';
  import AiErrorCard from './AiErrorCard.svelte';
  import Button from './design/Button.svelte';
  import type { AiErrorPhase } from '$lib/state/aiGeneration.svelte';
  import type { StyleName } from '$lib/ai/styles';
  import type { Origin } from '$lib/state/modal.svelte';

  // The result card's error section: a safety refusal guides the child to draw
  // something else and offers grown-ups a report; anything else is the error
  // card with its own report. Both reports write `status`, which the card reads
  // to decide when the report launcher gives way to the outcome.
  let {
    error,
    previewUrl,
    style,
    attempts,
    reportOrigin,
    onRequestReport,
    status = $bindable(),
  }: {
    error: AiErrorPhase;
    previewUrl: string | null;
    style: StyleName | null;
    attempts: number;
    reportOrigin: Origin | null;
    onRequestReport: (event: MouseEvent & { currentTarget: HTMLElement }) => void;
    status: ImageReportStatus;
  } = $props();

  const safety = $derived(error.errorKind === 'safety');
  const reportSettled = $derived(status === 'success' || status === 'error');
</script>

<div class="ai-result-error" class:safety class:server={!safety}>
  {#if safety}
    <p>{error.message}</p>
    <p class="ai-result-error-sub">That picture didn't work — try drawing something different!</p>
    <div class="ai-refusal-report">
      <span class="ai-refusal-report-label" id="refusalReportAudience">For grown-ups</span>
      {#if !reportSettled}
        <Button
          size="md"
          aria-describedby="refusalReportAudience"
          onclick={onRequestReport}
          disabled={!previewUrl}>Report this refusal</Button
        >
      {/if}
      <AiImageReport
        kind="false-positive-refusal"
        drawingUrl={previewUrl}
        outputUrl={null}
        {style}
        reportToken={error.reportToken}
        origin={reportOrigin}
        bind:status
      />
    </div>
  {:else}
    <AiErrorCard>
      <AiImageReport
        kind="generation-error"
        drawingUrl={null}
        outputUrl={null}
        {style}
        reportToken={null}
        failure={error.details}
        {attempts}
        origin={reportOrigin}
        bind:status
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
