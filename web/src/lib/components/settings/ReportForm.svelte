<script lang="ts">
  import Button from '../design/Button.svelte';
  import StatusMessage from '../design/StatusMessage.svelte';
  import RuleLabel from '../design/RuleLabel.svelte';
  import ReportFields from '../report/ReportFields.svelte';
  import { apiFetch } from '$lib/api';
  import { requireParentalGate } from '$lib/state/parentalGate.svelte';
  import { buttonCenter } from '$lib/state/modal.svelte';
  import {
    createLatestRequest,
    NETWORK_ERROR_MESSAGE,
    type SubmitStatus,
  } from '$lib/latestRequest';
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
  let honeypot = $state('');
  let fields: ReportFields;

  let status = $state<SubmitStatus>('idle');
  let feedback = $state('');

  let submitting = $derived(status === 'busy');

  const latest = createLatestRequest();

  function reset() {
    latest.detach();
    kind = 'bug';
    message = '';
    includeDevice = false;
    honeypot = '';
    status = 'idle';
    feedback = '';
  }

  // Deliberately no abort on open/close, unlike AiKeyManager's idempotent
  // verify: this POST files an issue, so a report the parent already sent must
  // be left to land. `reset` detaches it instead: its result belongs to the
  // visit that sent it, so it is dropped when it arrives rather than clearing
  // the draft the parent has since begun, and the next send neither waits on
  // it nor aborts it.
  $effect(() => {
    if (open) reset();
  });

  async function sendReport() {
    const text = message.trim();
    if (!text || submitting) return;

    const attachDevice = kind === 'bug' && includeDevice;
    const payload = {
      kind,
      message: text,
      [REPORT_HONEYPOT_FIELD]: honeypot,
    };

    const { id, signal } = latest.begin();
    status = 'busy';
    feedback = '';

    try {
      const device = attachDevice ? await fields.ensureDevice() : undefined;
      const res = await apiFetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, device }),
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
  <RuleLabel as="h3" strong class="report-heading">Send Feedback</RuleLabel>
  <p class="report-intro">
    Found a bug or have an idea? Tell us here — it opens a private support issue that only the
    Splotch maintainer can read. No account needed.
  </p>

  <div class="setting report-card">
    <ReportFields bind:this={fields} bind:kind bind:message bind:includeDevice bind:honeypot />

    <Button
      variant="brand"
      class="report-submit"
      onclick={submit}
      disabled={!message.trim()}
      busy={submitting}
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
  .setting-group :global(h3.report-heading) {
    margin-bottom: 6px;
  }

  .report-intro {
    margin: 0 0 12px;
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
