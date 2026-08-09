<script module lang="ts">
  export type ImageReportStatus = 'idle' | 'confirm' | 'busy' | 'success' | 'error';
</script>

<script lang="ts">
  import Button from './design/Button.svelte';
  import StatusMessage from './design/StatusMessage.svelte';
  import { apiUrl } from '$lib/api';
  import { ACCESS_TOKEN_HEADER, API_KEY_HEADER } from '$lib/apiHeaders';
  import type { StyleName } from '$lib/ai/styles';
  import { IMAGE_REPORT_RETENTION_DAYS } from '$lib/imageReport';
  import { NETWORK_ERROR_MESSAGE } from '$lib/latestRequest';
  import { buttonCenter } from '$lib/state/modal.svelte';
  import { requireParentalGate } from '$lib/state/parentalGate.svelte';
  import { settings } from '$lib/state/settings.svelte';
  import type { ImageReportResponse } from '../../routes/api/report-image/+server';

  interface Props {
    drawingUrl: string | null;
    outputUrl: string;
    style: StyleName | null;
    expanded?: boolean;
    status?: ImageReportStatus;
  }

  let {
    drawingUrl,
    outputUrl,
    style,
    expanded = $bindable(false),
    status = $bindable('idle'),
  }: Props = $props();

  let message = $state('');
  let controller: AbortController | null = null;

  $effect(() => {
    expanded = status !== 'idle';
  });

  $effect(() => {
    return () => {
      controller?.abort();
      status = 'idle';
      expanded = false;
    };
  });

  async function send() {
    if (!drawingUrl || status === 'busy') return;
    controller?.abort();
    const requestController = new AbortController();
    controller = requestController;
    status = 'busy';
    message = '';

    try {
      const [drawingResponse, outputResponse] = await Promise.all([
        fetch(drawingUrl, { signal: requestController.signal }),
        fetch(outputUrl, { signal: requestController.signal }),
      ]);
      const form = new FormData();
      form.set('drawing', await drawingResponse.blob(), 'drawing');
      form.set('output', await outputResponse.blob(), 'output');
      form.set('style', style ?? '');

      const headers = new Headers();
      if (settings.aiUserApiKey) headers.set(API_KEY_HEADER, settings.aiUserApiKey);
      else headers.set(ACCESS_TOKEN_HEADER, settings.aiAccessToken);
      const response = await fetch(apiUrl('/api/report-image'), {
        method: 'POST',
        headers,
        body: form,
        signal: requestController.signal,
      });
      const result: ImageReportResponse = await response
        .json()
        .catch(() => ({ ok: false, error: 'Could not send your picture report.' }));
      if (requestController.signal.aborted) return;
      if (response.ok && result.ok) {
        status = 'success';
        message = `Thanks. We'll review it within 24 hours. Keep this report reference if you want it deleted sooner: ${result.reportId}`;
      } else {
        status = 'error';
        message = result.ok ? 'Could not send your picture report.' : result.error;
      }
    } catch {
      if (requestController.signal.aborted) return;
      status = 'error';
      message = NETWORK_ERROR_MESSAGE;
    } finally {
      if (controller === requestController) controller = null;
    }
  }

  function confirm(event: MouseEvent & { currentTarget: HTMLElement }) {
    requireParentalGate('imageReport', () => void send(), buttonCenter(event.currentTarget));
  }
</script>

<div class="ai-image-report">
  {#if status === 'confirm' || status === 'busy'}
    <div class="ai-report-confirmation">
      <p>
        Send this picture and the drawing behind it for review? The report is deleted after
        {IMAGE_REPORT_RETENTION_DAYS} days.
      </p>
      <div class="ai-report-confirm-actions">
        <Button size="sm" onclick={() => (status = 'idle')} disabled={status === 'busy'}>
          Cancel
        </Button>
        <Button variant="brand" size="sm" onclick={confirm} disabled={status === 'busy'}>
          {status === 'busy' ? 'Sending…' : 'Send report'}
        </Button>
      </div>
    </div>
  {:else if status === 'success' || status === 'error'}
    <StatusMessage {status}>{message}</StatusMessage>
    {#if status === 'error'}
      <Button size="sm" onclick={() => (status = 'confirm')}>Try again</Button>
    {/if}
  {/if}
</div>

<style>
  .ai-image-report {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
  }

  .ai-report-confirm-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
  }

  .ai-report-confirmation {
    max-width: 420px;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    text-align: center;
  }

  .ai-report-confirmation p {
    margin: 0 0 var(--space-2);
    font-size: var(--font-size-sm);
    line-height: 1.45;
  }

  .ai-image-report :global(p.status-message) {
    margin-top: 0;
  }
</style>
