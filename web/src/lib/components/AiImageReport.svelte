<script module lang="ts">
  export type ImageReportStatus = 'idle' | 'confirm' | 'busy' | 'success' | 'error';
</script>

<script lang="ts">
  import Button from './design/Button.svelte';
  import StatusMessage from './design/StatusMessage.svelte';
  import { modalDialog, waitForDialogRetirement } from '$lib/actions/modalDialog.svelte';
  import { apiUrl } from '$lib/api';
  import { aiCredentialHeaders } from '$lib/ai/credentials';
  import { CLIENT_REQUEST_TIMEOUT_MS } from '$lib/ai/limits';
  import type { StyleName } from '$lib/ai/styles';
  import { REPORT_TOKEN_HEADER } from '$lib/apiHeaders';
  import { IMAGE_REPORT_RETENTION_DAYS, type AiReportKind } from '$lib/imageReport';
  import { NETWORK_ERROR_MESSAGE } from '$lib/latestRequest';
  import type { Origin } from '$lib/state/modal.svelte';
  import type { ImageReportResponse } from '../../routes/api/report-image/+server';

  interface Props {
    kind?: AiReportKind;
    drawingUrl: string | null;
    outputUrl: string | null;
    style: StyleName | null;
    /** The free tier's proof of generation; null on the BYOK and managed paths. */
    reportToken: string | null;
    /** The Report control's center, for the confirm dialog's fly-in. */
    origin?: Origin | null;
    status?: ImageReportStatus;
  }

  let {
    kind = 'picture',
    drawingUrl,
    outputUrl,
    style,
    reportToken,
    origin = null,
    status = $bindable('idle'),
  }: Props = $props();

  const REPORT_TIMEOUT_MESSAGE = "That's taking too long — please try again.";
  const refusal = $derived(kind === 'false-positive-refusal');

  let message = $state('');
  let controller: AbortController | null = null;
  let statusEl = $state<HTMLDivElement>();
  let confirmDialog = $state<HTMLDialogElement>();

  // The confirmation is the last step before an irreversible send, so it stands
  // in front of the result rather than in its footer: exactly one action is live
  // at a time, and the Download button behind the second scrim reads as context.
  const confirmOpen = $derived(status === 'confirm' || status === 'busy');

  // Failing closes the dialog the keyboard user was in, so the retry it leaves
  // behind takes focus — the alert announces what happened, and this puts them
  // on the control that acts on it. Reached without any tap of theirs when the
  // send times out, which is exactly when being dropped on <body> is worst.
  $effect(() => {
    if (status !== 'error' || !confirmDialog) return;
    void waitForDialogRetirement(confirmDialog).then(() => {
      if (status === 'error') statusEl?.querySelector('button')?.focus();
    });
  });

  $effect(() => {
    return () => {
      controller?.abort();
      status = 'idle';
    };
  });

  async function send() {
    if (!drawingUrl || (kind === 'picture' && !outputUrl) || status === 'busy') return;
    controller?.abort();
    const requestController = new AbortController();
    controller = requestController;
    status = 'busy';
    message = '';
    // Nothing else bounds this wait: dismissal is blocked while the request is
    // on the wire, so without a deadline a stalled send holds the topmost dialog
    // open against Cancel, the backdrop, Esc and Android back alike.
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      requestController.abort();
    }, CLIENT_REQUEST_TIMEOUT_MS);

    try {
      const [drawingResponse, outputResponse] = await Promise.all([
        fetch(drawingUrl, { signal: requestController.signal }),
        outputUrl ? fetch(outputUrl, { signal: requestController.signal }) : Promise.resolve(null),
      ]);
      const form = new FormData();
      form.set('kind', kind);
      form.set('drawing', await drawingResponse.blob(), 'drawing');
      if (outputResponse) form.set('output', await outputResponse.blob(), 'output');
      form.set('style', style ?? '');

      const credentials = await aiCredentialHeaders();
      const response = await fetch(apiUrl('/api/report-image'), {
        method: 'POST',
        headers: reportToken ? { ...credentials, [REPORT_TOKEN_HEADER]: reportToken } : credentials,
        body: form,
        signal: requestController.signal,
      });
      const result: ImageReportResponse = await response.json().catch(() => ({
        ok: false,
        error: refusal
          ? 'Could not send your refusal report.'
          : 'Could not send your picture report.',
      }));
      if (requestController.signal.aborted) return;
      if (response.ok && result.ok) {
        status = 'success';
        message = `Thanks. We'll review it within 24 hours. Keep this report reference if you want it deleted sooner: ${result.reportId}`;
      } else {
        status = 'error';
        message = result.ok
          ? refusal
            ? 'Could not send your refusal report.'
            : 'Could not send your picture report.'
          : result.error;
      }
    } catch {
      // An abort this component did not schedule is an unmount or a supersede —
      // there is no one left to tell. Its own deadline firing is a real failure.
      if (requestController.signal.aborted && !timedOut) return;
      status = 'error';
      message = timedOut ? REPORT_TIMEOUT_MESSAGE : NETWORK_ERROR_MESSAGE;
    } finally {
      clearTimeout(timeout);
      if (controller === requestController) controller = null;
    }
  }

  function cancel() {
    if (status === 'busy') return;
    status = 'idle';
  }
</script>

{#if status === 'success' || status === 'error'}
  <div class="ai-image-report" bind:this={statusEl}>
    <StatusMessage {status}>{message}</StatusMessage>
    {#if status === 'error'}
      <!-- No second gate: the one guarding this report was already solved. -->
      <Button size="sm" onclick={() => (status = 'confirm')}>Try again</Button>
    {/if}
  </div>
{/if}

<dialog
  bind:this={confirmDialog}
  class="ai-report-confirm modal-dialog modal-fly-in modal-shell"
  class:refusal
  aria-labelledby="aiReportConfirmTitle"
  use:modalDialog={() => ({
    open: confirmOpen,
    origin,
    onRequestClose: cancel,
    // Cancel is the dismissal, and nothing is in flight until Send report is
    // tapped — so backdrop taps and Esc dismiss freely right up until the
    // request the dialog can't get back is on the wire.
    allowDismiss: () => status !== 'busy',
  })}
>
  <div class="ai-report-confirm-content">
    <div class="ai-report-confirm-heading">
      <h3 id="aiReportConfirmTitle">
        {refusal ? 'Report this refusal' : 'Report this picture'}
      </h3>
      <p>
        {#if refusal}
          The rejected drawing, selected art style, exact instruction sent to the AI, and the AI's
          refusal reason go to a grown-up at Splotch.
        {:else}
          The AI picture, drawing behind it, selected art style, and exact instruction sent to the
          AI go to a grown-up at Splotch.
        {/if}
        We look within 24 hours, and the report is deleted after {IMAGE_REPORT_RETENTION_DAYS} days.
      </p>
    </div>

    <!-- The captions carry what each picture is, so the images themselves are
         decorative — an alt describing them would only repeat the caption. -->
    <div class="ai-report-thumbs" class:single={!outputUrl}>
      {#if outputUrl}
        <figure>
          <img src={outputUrl} alt="" />
          <figcaption>The AI picture</figcaption>
        </figure>
      {/if}
      {#if drawingUrl}
        <figure>
          <img src={drawingUrl} alt="" />
          <figcaption>{refusal ? 'The rejected drawing' : 'The drawing behind it'}</figcaption>
        </figure>
      {/if}
    </div>

    <div class="ai-report-confirm-actions">
      <Button size="lg" onclick={cancel} disabled={status === 'busy'}>Cancel</Button>
      <Button variant="brand" size="lg" onclick={() => void send()} disabled={status === 'busy'}>
        {status === 'busy' ? 'Sending…' : 'Send report'}
      </Button>
    </div>
  </div>
</dialog>

<style>
  .ai-image-report {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
  }

  .ai-image-report :global(p.status-message) {
    margin-top: 0;
  }

  /* ── Confirm dialog ─────────────────────────────────────────────────────── */

  /* Phone width and card padding are the parental gate's: this dialog is the
     step right after it, and the pair should read as one boundary. */
  .ai-report-confirm {
    width: min(92vw, 336px);
  }

  .ai-report-confirm-content {
    padding: 22px var(--space-6) var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  /* Title and copy are one group, so they sit closer than the dialog's own
     rhythm separates the groups from each other. */
  .ai-report-confirm-heading {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .ai-report-confirm-heading h3 {
    margin: 0;
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-bold);
    color: var(--text-strong);
    line-height: 1.2;
  }

  .ai-report-confirm-heading p {
    margin: 0;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-soft);
    line-height: 1.45;
    text-wrap: pretty;
  }

  .ai-report-thumbs {
    display: flex;
    gap: var(--space-3);
  }

  .ai-report-thumbs figure {
    flex: 1;
    min-width: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .ai-report-thumbs.single figure {
    max-width: 144px;
    margin-inline: auto;
  }

  .ai-report-thumbs img {
    display: block;
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    border-radius: var(--radius-md);
    background: var(--paper);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.14);
  }

  .ai-report-thumbs figcaption {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--text-soft);
    text-align: center;
  }

  .ai-report-confirm-actions {
    display: flex;
    gap: var(--space-2);
  }

  .ai-report-confirm-actions :global(.btn) {
    flex: 1;
  }

  @media (max-height: 480px) and (orientation: landscape) {
    .ai-report-confirm.refusal {
      width: min(92vw, 560px);
    }

    .ai-report-confirm.refusal .ai-report-confirm-content {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 160px;
      grid-template-areas:
        'heading thumbs'
        'actions thumbs';
      align-items: center;
    }

    .ai-report-confirm.refusal .ai-report-confirm-heading {
      grid-area: heading;
    }

    .ai-report-confirm.refusal .ai-report-thumbs {
      grid-area: thumbs;
    }

    .ai-report-confirm.refusal .ai-report-confirm-actions {
      grid-area: actions;
    }
  }

  /* Reduced motion: fade instead of flying in, as ParentalGate already does. */
  @media (prefers-reduced-motion: reduce) {
    .ai-report-confirm.modal-fly-in[open] {
      animation: aiReportConfirmFadeIn var(--duration-base) ease;
    }
  }

  @keyframes aiReportConfirmFadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
