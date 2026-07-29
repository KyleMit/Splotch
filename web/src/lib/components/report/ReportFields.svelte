<script lang="ts">
  import { slide } from 'svelte/transition';
  import Disclosure from '../design/Disclosure.svelte';
  import { collectDeviceInfo } from '$lib/deviceInfo';
  import { describeDeviceInfo, type DeviceInfo } from '$lib/deviceReport';
  import { MAX_REPORT_MESSAGE_LENGTH, REPORT_KINDS, type ReportKind } from '$lib/report';

  // The feedback form's field set, shared by its two hosts: the Parent Center's
  // ReportForm (which posts JSON to /api/report) and the standalone /feedback
  // page (which posts to a SvelteKit form action). Only the submit mechanism,
  // heading, and card chrome differ, so everything between the kind picker and
  // the honeypot lives here — including the copy, which is what a reporter
  // actually reads.
  //
  // Every control carries the `name` the form action reads. Inside the Parent
  // Center there is no <form> around them, so the names are inert there.
  interface Props {
    kind: ReportKind;
    message: string;
    includeDevice: boolean;
    device: DeviceInfo | null;
    honeypot: string;
  }

  let {
    kind = $bindable(),
    message = $bindable(),
    includeDevice = $bindable(),
    device = $bindable(),
    honeypot = $bindable(),
  }: Props = $props();

  let deviceRows = $derived(device ? describeDeviceInfo(device) : []);

  // What the parent opted into, serialized for a plain form post. Mirrors the
  // `attachDevice` condition ReportForm applies to its JSON body, so a report
  // sent either way carries exactly the rows previewed below.
  let devicePayload = $derived(
    kind === 'bug' && includeDevice && device ? JSON.stringify(device) : ''
  );

  // Collect the device snapshot the first time the parent opts in, so the
  // preview below reflects exactly what will be sent.
  $effect(() => {
    if (includeDevice && kind === 'bug' && !device) {
      collectDeviceInfo()
        .then((info) => (device = info))
        .catch(() => {});
    }
  });
</script>

<div class="report-fields">
  <div class="report-kind" role="radiogroup" aria-label="Report type">
    {#each REPORT_KINDS as option (option.value)}
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
  <input type="hidden" name="kind" value={kind} />

  <label class="report-label" for="reportMessage">
    {kind === 'bug' ? 'What went wrong?' : "What's your idea?"}
  </label>
  <textarea
    id="reportMessage"
    name="message"
    class="report-textarea"
    rows="4"
    required
    maxlength={MAX_REPORT_MESSAGE_LENGTH}
    placeholder={kind === 'bug'
      ? 'Describe what happened, and what you expected instead…'
      : "Describe the feature or change you'd love to see…"}
    bind:value={message}></textarea>

  <p class="report-public-note">
    Heads up: your report is posted <strong>publicly</strong> on our GitHub issue tracker, so please don't
    include personal details like names or email addresses.
  </p>

  {#if kind === 'bug'}
    <div class="report-device" transition:slide={{ duration: 180 }}>
      <label class="report-check">
        <input type="checkbox" bind:checked={includeDevice} />
        <span>Include device info <em>(helps us reproduce the bug)</em></span>
      </label>

      {#if includeDevice}
        <!-- The slide rides a wrapper: transition directives only attach to DOM
             elements, never to a component instance. -->
        <div transition:slide={{ duration: 160 }}>
          <Disclosure class="report-device-details">
            {#snippet summary()}What will be sent?{/snippet}
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
          </Disclosure>
        </div>
      {/if}
    </div>
  {/if}
  <input type="hidden" name="device" value={devicePayload} />

  <!-- Honeypot: off-screen and aria-hidden, so a person never sees it but a
       form-filling bot does. A filled value is quietly dropped server-side. -->
  <input
    class="report-hp"
    type="text"
    name="hp"
    tabindex="-1"
    autocomplete="off"
    aria-hidden="true"
    bind:value={honeypot}
  />
</div>

<style>
  .report-fields {
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

  /* --brand-solid, not --brand: a white label on the identity hue is 3.4:1 and
     fails WCAG AA at this size. */
  .report-kind-option.active {
    background: var(--brand-solid);
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
    font-size: var(--input-font-size);
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
    /* --text-muted is 3.5:1 on the light sheet — this note is fine print, but
       fine print still owes 4.5:1. */
    color: var(--text-mid);
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
    color: var(--text-mid);
  }

  /* The device-info preview's own chrome on the Disclosure primitive — reached
     with :global() because the class lands on the primitive's own markup. */
  .report-device :global(.report-device-details) {
    background: var(--surface);
  }

  .report-device :global(.report-device-details summary) {
    padding: 8px 12px;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--brand-text);
  }

  .report-device :global(.report-device-details summary::after) {
    float: right;
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

  /* --text-faint is 2.9:1 on the panel and carries text here, so the whole
     preview steps up to --text-mid; the key stays distinct on weight. */
  .report-device-key {
    color: var(--text-mid);
    font-weight: 600;
  }

  .report-device-empty {
    margin: 0;
    padding: 0 12px 8px;
    font-size: var(--font-size-xs);
    color: var(--text-mid);
  }

  .report-device-note {
    margin: 0;
    padding: 4px 12px 10px;
    font-size: var(--font-size-xs);
    color: var(--text-mid);
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
</style>
