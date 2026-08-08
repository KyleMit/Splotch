<script lang="ts">
  import Button from '../design/Button.svelte';
  import StatusMessage from '../design/StatusMessage.svelte';
  import ReportFields from '../report/ReportFields.svelte';
  import { apiUrl } from '$lib/api';
  import { requireParentalGate } from '$lib/state/parentalGate.svelte';
  import { buttonCenter } from '$lib/state/modal.svelte';
  import {
    createLatestRequest,
    NETWORK_ERROR_MESSAGE,
    type SubmitStatus,
  } from '$lib/latestRequest';
  import type { DeviceInfo } from '$lib/deviceReport';
  import { REPORT_HONEYPOT_FIELD, type ReportKind } from '$lib/report';
  import type { ReportResponse } from '../../../routes/api/report/+server';

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
      const data: ReportResponse = await res
        .json()
        .catch(() => ({ ok: false, error: 'Could not read the server response.' }));
      if (!latest.isCurrent(id)) return;
      if (res.ok && data.ok) {
        status = 'success';
        feedback = 'Thanks for your feedback.';
        message = '';
      } else {
        status = 'error';
        feedback = !data.ok ? data.error : 'Could not send your report. Please try again.';
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
</style>
