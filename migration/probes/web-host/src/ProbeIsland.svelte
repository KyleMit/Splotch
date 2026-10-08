<script lang="ts">
  import { onMount } from 'svelte';
  import { html, fixture } from 'virtual:splotch-web-host-chrome';
  import {
    PROBE_DIALOG_ID,
    PROBE_DIALOG_HEADING_ID,
    PROBE_DIALOG_CLOSE_ID,
    PROBE_DIALOG_REFUSAL_ID,
    PROBE_DIALOG_SETTINGS_ID,
    PROBE_MOUNT_STATE_ATTRIBUTE,
    PROBE_MOUNT_STATES,
  } from './probeProps';
  import './probe.css';

  const initialHtml = html;
  const initialFixture = fixture;
  let outer: HTMLElement;
  let inner: HTMLDivElement;
  let dialog: HTMLDialogElement;

  onMount(() => {
    const mountedOuter = outer;
    const mountedInner = inner;
    const mountedDialog = dialog;
    let cancelled = false;
    let stop: (() => void) | undefined;
    void import('./ProbeClient')
      .then(({ mountProbeClient }) => {
        if (cancelled) return;
        if (mountedOuter !== outer || mountedInner !== inner || mountedDialog !== dialog) {
          throw new Error('The web host route instance changed before mount');
        }
        stop = mountProbeClient(mountedOuter, mountedInner, mountedDialog, initialFixture);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        mountedOuter.setAttribute(PROBE_MOUNT_STATE_ATTRIBUTE, PROBE_MOUNT_STATES.failed);
        console.error('Web host client could not mount', error);
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  });
</script>

<section class="splotch-probe-island" aria-label="Web host probe" bind:this={outer}>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- markup is the hash-verified first-party production React SSR fragment -->
  <div class="splotch-probe-boundary" bind:this={inner}>{@html initialHtml}</div>
  <dialog
    class="splotch-probe-dialog modal-dialog modal-fly-in modal-shell"
    id={PROBE_DIALOG_ID}
    aria-labelledby={PROBE_DIALOG_HEADING_ID}
    bind:this={dialog}
  >
    <div class="splotch-probe-dialog-content">
      <h2 id={PROBE_DIALOG_HEADING_ID}>Web host dialog</h2>
      <label class="splotch-probe-refusal">
        <input type="checkbox" id={PROBE_DIALOG_REFUSAL_ID} />
        Keep this dialog open
      </label>
      <div class="splotch-probe-actions">
        <button class="splotch-probe-button" type="button" id={PROBE_DIALOG_SETTINGS_ID}
          >Open Settings</button
        >
        <button class="splotch-probe-button" type="button" id={PROBE_DIALOG_CLOSE_ID}>Close</button>
      </div>
    </div>
  </dialog>
</section>
