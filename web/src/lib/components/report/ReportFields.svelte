<script lang="ts">
  import { slide } from 'svelte/transition';
  import Disclosure from '../design/Disclosure.svelte';
  import SegmentedPicker from '../design/SegmentedPicker.svelte';
  import { collectDeviceInfo } from '$lib/platform/deviceInfo';
  import { createSingleFlight } from '$lib/singleFlight';
  import { describeDeviceInfo, type DeviceInfo } from '$lib/platform/deviceReport';
  import {
    MAX_REPORT_MESSAGE_LENGTH,
    REPORT_HONEYPOT_FIELD,
    REPORT_KINDS,
    type ReportKind,
  } from '$lib/report';

  // One reveal timing for both device disclosures below — the outer toggle and
  // the details block it wraps. Named locally rather than taken from settings'
  // SECTION_SLIDE because this field set is also hosted by /feedback, outside
  // Settings, and reaching for that constant would couple a component used
  // outside Settings to Settings internals. Shorter than a section reveal
  // because these uncover a couple of rows inside an already-open block rather
  // than opening a section.
  const DEVICE_REVEAL_SLIDE_MS = 180;

  // The feedback form's field set, shared by its two hosts: Settings'
  // ReportForm (which posts JSON to /api/report) and the standalone /feedback
  // page (which posts to a SvelteKit form action). Only the submit mechanism,
  // heading, and card chrome differ, so everything between the kind picker and
  // the honeypot lives here — including the copy, which is what a reporter
  // actually reads.
  //
  // Every control is a real, named form control rather than a scripted one, so
  // the whole field set submits correctly with JavaScript unavailable. Inside
  // Settings there is no <form> around them and the names are inert.
  interface Props {
    kind: ReportKind;
    message: string;
    includeDevice: boolean;
    /**
     * The collected snapshot. Bindable for ReportForm, which sends it as JSON
     * rather than through the hidden field below; /feedback never reads it.
     */
    device?: DeviceInfo | null;
    /** Bindable for the same reason — no host has business reading a bot trap. */
    honeypot?: string;
    /**
     * Bindable so ReportForm can await the same in-flight/memoized collection
     * this component's own effect starts, instead of calling
     * collectDeviceInfo independently — the two callers share one collection
     * (in flight or already resolved into `device`), never two concurrent
     * ones, so submit always sends what the preview last rendered.
     */
    ensureDevice?: () => Promise<DeviceInfo | undefined>;
  }

  let {
    kind = $bindable(),
    message = $bindable(),
    includeDevice = $bindable(),
    device = $bindable(null),
    honeypot = $bindable(''),
    ensureDevice = $bindable(),
  }: Props = $props();

  let deviceRows = $derived(device ? describeDeviceInfo(device) : []);

  // What the parent opted into, serialized for a plain form post. Mirrors the
  // `attachDevice` condition ReportForm applies to its JSON body, so a report
  // sent either way carries exactly the rows previewed below.
  let devicePayload = $derived(
    kind === 'bug' && includeDevice && device ? JSON.stringify(device) : ''
  );

  // One collection shared by every caller, writing through into `device` as it
  // resolves. The single-flight memo is what makes the preview and submit agree:
  // both await the same in-flight run rather than racing two collections, so
  // submit cannot send a snapshot the preview never rendered. Its behaviour in
  // the in-flight window is covered by singleFlight.test.ts — an end-to-end test
  // can only observe the settled state, where a weaker result-only memo looks
  // identical.
  const collectDeviceOnce = createSingleFlight(async () => {
    const info = await collectDeviceInfo();
    device = info;
    return info;
  });

  // Collect the device snapshot the first time the parent opts in, so the
  // preview below reflects exactly what will be sent. Shared with ReportForm via
  // the bindable ensureDevice above. A failed collection resolves to undefined
  // rather than throwing — an unavailable snapshot must not surface to the
  // reporter as a failed send — and clears the memo so a later opt-in retries.
  function ensureDeviceInfo(): Promise<DeviceInfo | undefined> {
    if (device) return Promise.resolve(device);
    return collectDeviceOnce().catch(() => undefined);
  }
  ensureDevice = ensureDeviceInfo;

  $effect(() => {
    if (includeDevice && kind === 'bug' && !device) {
      void ensureDeviceInfo();
    }
  });
</script>

<div class="report-fields">
  <SegmentedPicker
    class="report-kind"
    label="Report type"
    options={REPORT_KINDS}
    selected={kind}
    onSelect={(value) => (kind = value)}
    inputName="kind"
  />

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

  {#if kind === 'bug'}
    <div class="report-device" transition:slide={{ duration: DEVICE_REVEAL_SLIDE_MS }}>
      <label class="report-check">
        <input type="checkbox" name="includeDevice" bind:checked={includeDevice} />
        <span>Include device info <em>(helps us reproduce the bug)</em></span>
      </label>

      {#if includeDevice}
        <!-- The slide rides a wrapper: transition directives only attach to DOM
             elements, never to a component instance. -->
        <div transition:slide={{ duration: DEVICE_REVEAL_SLIDE_MS }}>
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

  <!-- Last, so it sits directly above whichever submit button the host renders:
       it is the one line a reporter must not miss, and mid-form it read as
       fine print between two controls. -->
  <p class="report-privacy-note">
    Your report goes to our private support tracker. Please don't include personal details like
    names or email addresses.
  </p>

  <!-- Honeypot: off-screen and aria-hidden, so a person never sees it but a
       form-filling bot does. A filled value is quietly dropped server-side. -->
  <input
    class="report-hp"
    type="text"
    name={REPORT_HONEYPOT_FIELD}
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

  /* A phone tightens the kind picker's track rather than stacking the two
     options: stacked, they stop reading as one control and the selected one
     looks like a button someone already pressed. Reached through the picker's
     forwarded class because these two labels are the primitive's longest — the
     other pickers' fit at every supported width. */
  @media (max-width: 400px) {
    .report-fields :global(.report-kind) {
      gap: 4px;
      padding: 3px;
    }

    .report-fields :global(.report-kind .option) {
      padding: 9px 6px;
      font-size: var(--font-size-xs);
      white-space: nowrap;
    }
  }

  .report-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
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

  .report-textarea:focus-visible {
    border-color: var(--brand);
    outline: 2px solid var(--brand-text);
    outline-offset: 2px;
  }

  .report-privacy-note {
    margin: -2px 0 0 0;
    font-size: var(--font-size-xs);
    line-height: 1.45;
    /* --text-soft, deliberately: this note is fine print, but fine print
       still owes 4.5:1, which the soft step is pinned to hold. */
    color: var(--text-soft);
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
    color: var(--text-soft);
  }

  /* The device-info preview's own chrome on the Disclosure primitive — reached
     with :global() because the class lands on the primitive's own markup. */
  .report-device :global(.report-device-details) {
    background: var(--surface);
  }

  .report-device :global(.report-device-details summary) {
    padding: 8px 12px;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--brand-text);
  }

  .report-device-list {
    margin: 0;
    padding: 0 12px 4px 12px;
    list-style: none;
  }

  .report-device-list li {
    font-size: var(--font-size-xs);
    color: var(--text-soft);
    line-height: 1.7;
    word-break: break-word;
  }

  /* The whole preview sits on --text-soft (pinned to hold 4.5:1 on the
     panel); the key stays distinct on weight alone. */
  .report-device-key {
    color: var(--text-soft);
    font-weight: var(--font-weight-semibold);
  }

  .report-device-empty {
    margin: 0;
    padding: 0 12px 8px;
    font-size: var(--font-size-xs);
    color: var(--text-soft);
  }

  .report-device-note {
    margin: 0;
    padding: 4px 12px 10px;
    font-size: var(--font-size-xs);
    color: var(--text-soft);
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
