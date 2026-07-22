<script lang="ts">
  import { slide } from 'svelte/transition';
  import { apiUrl } from '$lib/api';
  import { collectDeviceInfo } from '$lib/deviceInfo';
  import { describeDeviceInfo, type DeviceInfo } from '$lib/deviceReport';

  interface Props {
    // Flips true when the Parent Center modal opens; we use it to clear the form
    // and any stale feedback so a reopened panel starts fresh.
    open?: boolean;
  }
  let { open = false }: Props = $props();

  type Kind = 'bug' | 'feature';
  const kinds: { value: Kind; label: string }[] = [
    { value: 'bug', label: "Something's broken" },
    { value: 'feature', label: 'I have an idea' },
  ];

  let kind = $state<Kind>('bug');
  let message = $state('');
  let includeDevice = $state(false);
  let device = $state<DeviceInfo | null>(null);
  let honeypot = $state('');

  let status = $state<'idle' | 'submitting' | 'success' | 'error'>('idle');
  let feedback = $state('');
  let resultUrl = $state('');

  let submitting = $derived(status === 'submitting');
  let deviceRows = $derived(device ? describeDeviceInfo(device) : []);

  let requestId = 0;
  let controller: AbortController | null = null;

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

  // Collect the device snapshot the first time the parent opts in, so the
  // preview below reflects exactly what will be sent.
  $effect(() => {
    if (includeDevice && kind === 'bug' && !device) {
      collectDeviceInfo()
        .then((info) => (device = info))
        .catch(() => {});
    }
  });

  async function submit() {
    const text = message.trim();
    if (!text || submitting) return;

    requestId += 1;
    const id = requestId;
    controller?.abort();
    controller = new AbortController();
    status = 'submitting';
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
          device: attachDevice ? (device ?? (await collectDeviceInfo())) : undefined,
          hp: honeypot,
        }),
        signal: controller.signal,
      });
      const data: { ok?: boolean; error?: string; url?: string } = await res
        .json()
        .catch(() => ({}));
      if (id !== requestId) return;
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
      if (id !== requestId) return;
      status = 'error';
      feedback = 'Could not reach the server. Check your connection and try again.';
    } finally {
      if (id === requestId) controller = null;
    }
  }
</script>

<section class="setting-group">
  <h3 class="report-heading">Send Feedback</h3>
  <p class="report-intro">
    Found a bug or have an idea? Tell us here — it goes straight to our issue tracker. No account
    needed.
  </p>

  <div class="setting report-card">
    <div class="report-kind" role="radiogroup" aria-label="Report type">
      {#each kinds as option (option.value)}
        <button
          type="button"
          class="report-kind-option"
          class:active={kind === option.value}
          role="radio"
          aria-checked={kind === option.value}
          onclick={() => (kind = option.value)}
        >
          {option.label}
        </button>
      {/each}
    </div>

    <label class="report-label" for="reportMessage">
      {kind === 'bug' ? 'What went wrong?' : "What's your idea?"}
    </label>
    <textarea
      id="reportMessage"
      class="report-textarea"
      rows="4"
      maxlength={4000}
      placeholder={kind === 'bug'
        ? 'Describe what happened, and what you expected instead…'
        : "Describe the feature or change you'd love to see…"}
      bind:value={message}></textarea>

    <p class="report-public-note">
      Heads up: your report is posted <strong>publicly</strong> on our GitHub issue tracker, so please
      don't include personal details like names or email addresses.
    </p>

    {#if kind === 'bug'}
      <div class="report-device" transition:slide={{ duration: 180 }}>
        <label class="report-check">
          <input type="checkbox" bind:checked={includeDevice} />
          <span>Include device info <em>(helps us reproduce the bug)</em></span>
        </label>

        {#if includeDevice}
          <details class="report-device-details" transition:slide={{ duration: 160 }}>
            <summary>What will be sent?</summary>
            {#if deviceRows.length}
              <ul class="report-device-list">
                {#each deviceRows as row (row.label)}
                  <li><span class="report-device-key">{row.label}:</span> {row.value}</li>
                {/each}
              </ul>
            {:else}
              <p class="report-device-empty">Gathering device info…</p>
            {/if}
            <p class="report-device-note">
              No names, accounts, or location — just the basics about your device and app version.
            </p>
          </details>
        {/if}
      </div>
    {/if}

    <!-- Honeypot: off-screen and aria-hidden, so a person never sees it but a
         form-filling bot does. A filled value is quietly dropped server-side. -->
    <input
      class="report-hp"
      type="text"
      tabindex="-1"
      autocomplete="off"
      aria-hidden="true"
      bind:value={honeypot}
    />

    <button
      type="button"
      class="report-submit"
      onclick={submit}
      disabled={!message.trim() || submitting}
    >
      {submitting ? 'Sending…' : 'Send report'}
    </button>
  </div>

  {#if feedback}
    <p
      class="report-message"
      class:error={status === 'error'}
      class:success={status === 'success'}
      role={status === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      {feedback}
      {#if status === 'success' && resultUrl}
        <a href={resultUrl} target="_blank" rel="noopener noreferrer">View your report ↗</a>
      {/if}
    </p>
  {/if}
</section>

<style>
  .report-heading {
    margin: 0 0 6px 0;
    font-size: var(--font-size-sm);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .report-intro {
    margin: 0 0 12px 0;
    font-size: var(--font-size-sm);
    color: var(--text-mid);
    line-height: 1.5;
  }

  .report-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* Bug / feature segmented control — mirrors the Appearance theme picker. */
  .report-kind {
    display: flex;
    gap: 6px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 4px;
  }

  .report-kind-option {
    flex: 1;
    padding: 8px 10px;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--text-mid);
    background: transparent;
    border: none;
    border-radius: 7px;
    cursor: pointer;
    transition:
      background var(--duration-fast) ease,
      color var(--duration-fast) ease;
  }

  .report-kind-option.active {
    background: var(--brand);
    color: var(--on-brand);
  }

  @media (hover: hover) {
    .report-kind-option:not(.active):hover {
      background: var(--surface-hover);
      color: var(--text-strong);
    }
  }

  .report-label {
    font-size: var(--font-size-md);
    font-weight: 500;
    color: var(--text);
  }

  .report-textarea {
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    min-height: 88px;
    padding: 10px 12px;
    font-size: var(--font-size-md);
    font-family: inherit;
    line-height: 1.5;
    color: var(--text-strong);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }

  .report-textarea:focus {
    outline: none;
    border-color: var(--brand);
  }

  .report-public-note {
    margin: -2px 0 0 0;
    font-size: var(--font-size-xs);
    line-height: 1.45;
    color: var(--text-muted);
  }

  .report-public-note strong {
    color: var(--text);
  }

  .report-device {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .report-check {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-size: var(--font-size-sm);
    color: var(--text);
    line-height: 1.4;
    cursor: pointer;
  }

  .report-check input {
    width: 18px;
    height: 18px;
    margin: 1px 0 0 0;
    accent-color: var(--brand);
    flex-shrink: 0;
    cursor: pointer;
  }

  .report-check em {
    font-style: normal;
    color: var(--text-muted);
  }

  /* Collapsible device-info preview — same chevron idiom as the BYOK how-to. */
  .report-device-details {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    overflow: hidden;
  }

  .report-device-details summary {
    padding: 8px 12px;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--brand);
    cursor: pointer;
    user-select: none;
    list-style: none;
  }

  .report-device-details summary::-webkit-details-marker {
    display: none;
  }

  .report-device-details summary::after {
    content: '›';
    float: right;
    color: var(--text-faint);
    transition: transform var(--duration-base) ease;
  }

  .report-device-details[open] summary::after {
    transform: rotate(90deg);
  }

  .report-device-list {
    margin: 0;
    padding: 0 12px 4px 12px;
    list-style: none;
  }

  .report-device-list li {
    font-size: var(--font-size-xs);
    color: var(--text-mid);
    line-height: 1.7;
    word-break: break-word;
  }

  .report-device-key {
    color: var(--text-faint);
    font-weight: 600;
  }

  .report-device-empty {
    margin: 0;
    padding: 0 12px 8px;
    font-size: var(--font-size-xs);
    color: var(--text-faint);
  }

  .report-device-note {
    margin: 0;
    padding: 4px 12px 10px;
    font-size: 11px;
    color: var(--text-faint);
    line-height: 1.4;
  }

  /* Off-screen, non-interactive: a bot fills it, a person can't reach it. */
  .report-hp {
    position: absolute;
    left: -9999px;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .report-submit {
    align-self: flex-start;
    padding: 9px 18px;
    font-size: var(--font-size-md);
    font-weight: 600;
    color: var(--on-brand);
    background: var(--brand);
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background var(--duration-base) ease;
  }

  @media (hover: hover) {
    .report-submit:hover {
      background: var(--brand-hover);
    }
  }

  .report-submit:disabled {
    background: var(--control-track-hover);
    cursor: not-allowed;
  }

  .report-message {
    margin: 12px 0 0 0;
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    line-height: 1.5;
  }

  .report-message.success {
    background: var(--success-wash);
    color: var(--success-text);
  }

  .report-message.error {
    background: var(--danger-wash);
    color: var(--danger-text);
  }

  .report-message a {
    display: inline-block;
    margin-left: 4px;
    color: inherit;
    font-weight: 700;
    text-decoration: underline;
  }
</style>
