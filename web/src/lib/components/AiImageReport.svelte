<script lang="ts">
  import ReportFields from './report/ReportFields.svelte';
  import { failureReportRows } from '$lib/ai/failureReport';
  import { aiGenerationState, type AiFailureDetails } from '$lib/state/aiGeneration.svelte';
  import type { ImageReportFlow } from './imageReportFlow.svelte';
  import Button from './design/Button.svelte';
  import StatusMessage from './design/StatusMessage.svelte';
  import { modalDialog, waitForDialogRetirement } from '$lib/actions/modalDialog.svelte';
  import { aiCredentialHeaders } from '$lib/ai/credentials';
  import { CLIENT_REQUEST_TIMEOUT_MS } from '$lib/ai/limits';
  import { REPORT_TOKEN_HEADER } from '$lib/apiHeaders';
  import {
    IMAGE_REPORT_RETENTION_DAYS,
    IMAGE_REPORT_REVIEW_HOURS,
    type AiReportKind,
  } from '$lib/imageReport';
  import { NETWORK_ERROR_MESSAGE } from '$lib/latestRequest';
  import { attachesDevice, type ReportKind } from '$lib/report';
  import { postFeedbackReport, postImageReport, readReportReply } from '$lib/reportClient';

  // What this report's phase adds. The run's own inputs (the drawing, its style
  // and the failure count) are read from aiGenerationState below.
  interface Props {
    kind?: AiReportKind | 'generation-error';
    failure?: AiFailureDetails | null;
    outputUrl: string | null;
    /** The free tier's proof of generation; null on the BYOK and managed paths. */
    reportToken: string | null;
    report: ImageReportFlow;
  }

  let { kind = 'picture', failure = null, outputUrl, reportToken, report }: Props = $props();

  const REPORT_TIMEOUT_MESSAGE = "That's taking too long — please try again.";
  // The kind a problem report files as. Its fields offer the device opt-in and
  // its send attaches the snapshot by the same rule, `attachesDevice`.
  const PROBLEM_REPORT_KIND: ReportKind = 'bug';
  // Short enough to keep the confirmation's promise on one template line. The
  // formatter wraps the full name, and a wrap leaves a newline run in the
  // rendered sentence (AiImageReport.copy.test.ts compares it as rendered).
  const reviewHours = IMAGE_REPORT_REVIEW_HOURS;
  const problem = $derived(kind === 'generation-error');
  // A problem report sends diagnostics only, never the drawing.
  const drawingUrl = $derived(problem ? null : aiGenerationState.previewUrl);
  const style = $derived(aiGenerationState.style);
  const diagnosticRows = $derived(
    failureReportRows(failure, aiGenerationState.consecutiveFailures, style)
  );
  let includeDevice = $state(false);
  // Rendered only for a problem report, so absent for the picture and refusal
  // kinds — and bound inside that conditional block, which is why Svelte wants
  // the holder to be state rather than the plain `let` a top-level bind uses.
  let fields = $state<ReportFields>();
  const refusal = $derived(kind === 'false-positive-refusal');
  const sendFailedMessage = $derived(
    problem
      ? 'Could not send your problem report.'
      : refusal
        ? 'Could not send your refusal report.'
        : 'Could not send your picture report.'
  );

  let message = $state('');
  let controller: AbortController | null = null;
  let statusEl = $state<HTMLDivElement>();
  let confirmDialog = $state<HTMLDialogElement>();

  // The confirmation is the last step before an irreversible send, so it stands
  // in front of the result rather than in its footer: exactly one action is live
  // at a time, and the Download button behind the second scrim reads as context.
  const sending = $derived(report.status === 'busy');
  const confirmOpen = $derived(report.status === 'confirm' || sending);

  // Failing closes the dialog the keyboard user was in, so the retry it leaves
  // behind takes focus — the alert announces what happened, and this puts them
  // on the control that acts on it. Reached without any tap of theirs when the
  // send times out, which is exactly when being dropped on <body> is worst.
  $effect(() => {
    if (report.status !== 'error' || !confirmDialog) return;
    void waitForDialogRetirement(confirmDialog).then(() => {
      if (report.status === 'error') statusEl?.querySelector('button')?.focus();
    });
  });

  $effect(() => {
    return () => {
      controller?.abort();
      report.reset();
    };
  });

  async function submit(signal: AbortSignal): Promise<Response> {
    if (kind === 'generation-error') {
      const device = attachesDevice(PROBLEM_REPORT_KIND, includeDevice)
        ? await fields?.ensureDevice()
        : undefined;
      const diagnostics = diagnosticRows.map(({ label, value }) => `${label}: ${value}`).join('\n');
      return postFeedbackReport(
        { kind: PROBLEM_REPORT_KIND, message: diagnostics, device },
        signal
      );
    }
    if (!drawingUrl) throw new Error('Missing drawing');
    const [drawingResponse, outputResponse] = await Promise.all([
      fetch(drawingUrl, { signal }),
      outputUrl ? fetch(outputUrl, { signal }) : Promise.resolve(null),
    ]);
    const drawing = await drawingResponse.blob();
    const output = outputResponse ? await outputResponse.blob() : null;

    const credentials = await aiCredentialHeaders();
    return postImageReport(
      { kind, drawing, output, style },
      reportToken ? { ...credentials, [REPORT_TOKEN_HEADER]: reportToken } : credentials,
      signal
    );
  }

  async function send() {
    if ((!problem && (!drawingUrl || (kind === 'picture' && !outputUrl))) || sending) return;
    controller?.abort();
    const requestController = new AbortController();
    controller = requestController;
    report.begin();
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
      const response = await submit(requestController.signal);
      // The deadline can fire while the body is still arriving, which rejects
      // this read rather than the fetch. readReportReply rethrows that into the
      // catch below, where the deadline is told apart from an unmount;
      // swallowing it would leave the dialog on "Sending…" with dismissal
      // blocked.
      const reply = await readReportReply(response, requestController.signal);
      if (requestController.signal.aborted) return;
      if (response.ok && reply?.ok) {
        report.succeed();
        message =
          'reportId' in reply
            ? `Thanks. We'll review it within ${reviewHours} hours. Keep this report reference if you want it deleted sooner: ${reply.reportId}`
            : 'Thanks. Your problem report was sent to our private support tracker.';
      } else {
        report.fail();
        message = reply && !reply.ok ? reply.error : sendFailedMessage;
      }
    } catch {
      // An abort this component did not schedule is an unmount or a supersede —
      // there is no one left to tell. Its own deadline firing is a real failure.
      if (requestController.signal.aborted && !timedOut) return;
      report.fail();
      message = timedOut ? REPORT_TIMEOUT_MESSAGE : NETWORK_ERROR_MESSAGE;
    } finally {
      clearTimeout(timeout);
      if (controller === requestController) controller = null;
    }
  }
</script>

{#if report.status === 'success' || report.status === 'error'}
  <div class="ai-image-report" bind:this={statusEl}>
    <StatusMessage status={report.status}>{message}</StatusMessage>
    {#if report.status === 'error'}
      <!-- No second gate: the one guarding this report was already solved. -->
      <Button size="sm" onclick={() => report.retry()}
        >{problem ? 'Retry report' : 'Try again'}</Button
      >
    {/if}
  </div>
{/if}

<dialog
  bind:this={confirmDialog}
  class="ai-report-confirm confirm-card modal-dialog modal-fly-in modal-shell"
  class:refusal
  class:problem
  aria-labelledby="aiReportConfirmTitle"
  use:modalDialog={() => ({
    open: confirmOpen,
    origin: report.origin,
    onRequestClose: () => report.cancel(),
    // Cancel is the dismissal, and nothing is in flight until Send report is
    // tapped — so backdrop taps and Esc dismiss freely right up until the
    // request the dialog can't get back is on the wire.
    allowDismiss: () => !sending,
  })}
>
  <div class="ai-report-confirm-content confirm-card-content">
    <div class="ai-report-confirm-heading confirm-card-heading">
      <h3 id="aiReportConfirmTitle">
        {problem ? 'Report this problem' : refusal ? 'Report this refusal' : 'Report this picture'}
      </h3>
      <p>
        {#if problem}
          The error below and your app version go to a grown-up at Splotch in our private support
          tracker.
        {:else if refusal}
          The rejected drawing, selected art style, exact instruction sent to the AI, and the AI's
          refusal reason go to a grown-up at Splotch.
        {:else}
          The AI picture, drawing behind it, selected art style, and exact instruction sent to the
          AI go to a grown-up at Splotch.
        {/if}
        {#if !problem}We look within {reviewHours} hours, and the report is deleted after {IMAGE_REPORT_RETENTION_DAYS}
          days.{/if}
      </p>
    </div>

    <!-- The captions carry what each picture is, so the images themselves are
         decorative — an alt describing them would only repeat the caption. -->
    {#if problem}
      <section class="ai-report-diagnostics" aria-label="What will be sent">
        <h4>What will be sent</h4>
        <dl>
          {#each diagnosticRows as row (row.label)}<div>
              <dt>{row.label}:</dt>
              <dd>{row.value}</dd>
            </div>{/each}
        </dl>
        <p>Not sent: the drawing, names, accounts, or location.</p>
      </section>
      <fieldset class="ai-report-device" disabled={sending}>
        <ReportFields
          mode="device-only"
          kind={PROBLEM_REPORT_KIND}
          bind:this={fields}
          bind:includeDevice
        />
      </fieldset>
    {:else}
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
    {/if}

    <div class="ai-report-confirm-actions">
      <Button size="lg" onclick={() => report.cancel()} disabled={sending}>Cancel</Button>
      <Button variant="brand" size="lg" onclick={() => void send()} busy={sending}>
        {sending ? 'Sending…' : 'Send report'}
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
    box-shadow: 0 2px 8px rgb(0 0 0 / 14%);
  }

  .ai-report-thumbs figcaption {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--text-soft);
    text-align: center;
  }

  .ai-report-confirm.problem {
    text-align: left;
  }
  .ai-report-device {
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }

  .ai-report-diagnostics {
    border: var(--border-width) solid var(--border-warm);
    border-radius: var(--radius-md);
    text-align: left;
  }
  .ai-report-diagnostics h4 {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--brand-text);
  }
  .ai-report-diagnostics dl {
    margin: 0;
    padding: 0 var(--space-3) var(--space-1);
    font-size: var(--font-size-xs);
    color: var(--text-soft);
    line-height: 1.7;
    overflow-wrap: anywhere;
  }
  .ai-report-diagnostics dt {
    display: inline;
    font-weight: var(--font-weight-semibold);
  }
  .ai-report-diagnostics dd {
    display: inline;
    margin: 0;
  }
  .ai-report-diagnostics p {
    margin: 0;
    padding: var(--space-1) var(--space-3) 10px;
    font-size: var(--font-size-xs);
    color: var(--text-soft);
    line-height: 1.4;
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
      max-width: 560px;
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
</style>
