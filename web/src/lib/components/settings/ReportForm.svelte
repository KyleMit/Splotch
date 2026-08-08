<script lang="ts">
  import Button from '../design/Button.svelte';
  import StatusMessage from '../design/StatusMessage.svelte';
  import ReportFields from '../report/ReportFields.svelte';
  import { apiUrl } from '$lib/api';
  import { parentalGateLink } from '$lib/actions/parentalGateLink';
  import { requireParentalGate } from '$lib/state/parentalGate.svelte';
  import { buttonCenter } from '$lib/state/modal.svelte';
  import {
    createLatestRequest,
    NETWORK_ERROR_MESSAGE,
    type SubmitStatus,
  } from '$lib/latestRequest';
  import type { DeviceInfo } from '$lib/deviceReport';
  import { REPORT_HONEYPOT_FIELD, type ReportKind } from '$lib/report';

  interface Props {
    // Flips true when the Settings modal opens; we use it to clear the form
    // and any stale feedback so a reopened panel starts fresh.
    open?: boolean;
  }
  let { open = false }: Props = $props();

  let kind = $state<ReportKind>('bug');
  let message = $state('');
  let includeDevice = $state(false);
  let device = $state<DeviceInfo | null>(null);
  let honeypot = $state('');
  let ensureDevice = $state<() => Promise<DeviceInfo | undefined>>();

  let status = $state<SubmitStatus>('idle');
  let feedback = $state('');
  let resultUrl = $state('');

  let submitting = $derived(status === 'busy');

  const latest = createLatestRequest();

  function reset() {
    kind = 'bug';
    message = '';
    includeDevice = false;
    device = null;
    honeypot = '';
    status = 'idle';
    feedback = '';
    resultUrl = '';
  }

  $effect(() => {
    if (open) reset();
  });

  async function sendReport() {
    const text = message.trim();
    if (!text || submitting) return;

    const { id, signal } = latest.begin();
    status = 'busy';
    feedback = '';
    resultUrl = '';

    const attachDevice = kind === 'bug' && includeDevice;
    try {
      const res = await fetch(apiUrl('/api/report'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          message: text,
          device: attachDevice ? await ensureDevice?.() : undefined,
          [REPORT_HONEYPOT_FIELD]: honeypot,
        }),
        signal,
      });
      const data: { ok?: boolean; error?: string; url?: string } = await res
        .json()
        .catch(() => ({}));
      if (!latest.isCurrent(id)) return;
      if (res.ok && data.ok) {
        status = 'success';
        resultUrl = data.url ?? '';
        feedback = 'Thanks! Your report was sent.';
        message = '';
      } else {
        status = 'error';
        feedback = data.error || 'Could not send your report. Please try again.';
      }
    } catch {
      if (!latest.isCurrent(id)) return;
      status = 'error';
      feedback = NETWORK_ERROR_MESSAGE;
    }
  }

  function submit(event: MouseEvent & { currentTarget: HTMLElement }) {
    requireParentalGate('feedback', () => void sendReport(), buttonCenter(event.currentTarget));
  }
</script>

<section class="setting-group">
  <h3 class="report-heading">Send Feedback</h3>
  <p class="report-intro">
    Found a bug or have an idea? Tell us here — it goes straight to our issue tracker. No account
    needed.
  </p>

  <div class="setting report-card">
    <ReportFields
      bind:kind
      bind:message
      bind:includeDevice
      bind:device
      bind:honeypot
      bind:ensureDevice
    />

    <Button
      variant="brand"
      class="report-submit"
      onclick={submit}
      disabled={!message.trim() || submitting}
    >
      {submitting ? 'Sending…' : 'Send report'}
    </Button>
  </div>

  {#if feedback}
    <StatusMessage status={status === 'error' ? 'error' : 'success'}>
      {feedback}
      {#if status === 'success' && resultUrl}
        <a
          class="report-message-link"
          href={resultUrl}
          target="_blank"
          rel="noopener noreferrer"
          use:parentalGateLink>View your report ↗</a
        >
      {/if}
    </StatusMessage>
  {/if}
</section>

<style>
  .report-heading {
    margin: 0 0 6px 0;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-soft);
  }

  .report-intro {
    margin: 0 0 12px 0;
    font-size: var(--font-size-sm);
    color: var(--text-soft);
    line-height: 1.5;
  }

  .report-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* Chrome comes from the Button primitive; the call site only places it. */
  .report-card :global(.report-submit) {
    align-self: flex-start;
  }

  .report-message-link {
    display: inline-block;
    margin-left: 4px;
    color: inherit;
    font-weight: var(--font-weight-bold);
    text-decoration: underline;
  }
</style>
