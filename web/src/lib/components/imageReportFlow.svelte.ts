import type { Origin } from '$lib/state/modal.svelte';

type ImageReportStatus = 'idle' | 'confirm' | 'busy' | 'success' | 'error';

// One report from the AI result card, from the grown-up's Report tap to its
// outcome. The card owns it: its launchers request it, and they give way once
// it settles. The AiImageReport inside the card sends it. Each side moves it
// only through these named transitions, so the status has one writer.
export function createImageReportFlow() {
  let status = $state<ImageReportStatus>('idle');
  let origin = $state<Origin | null>(null);

  return {
    get status() {
      return status;
    },
    /** The Report control's center, for the confirm dialog's fly-in. */
    get origin() {
      return origin;
    },
    /** An outcome is on screen, so the launchers give way to its message. */
    get settled() {
      return status === 'success' || status === 'error';
    },
    request(from: Origin) {
      origin = from;
      status = 'confirm';
    },
    retry() {
      status = 'confirm';
    },
    begin() {
      status = 'busy';
    },
    succeed() {
      status = 'success';
    },
    fail() {
      status = 'error';
    },
    // A send on the wire cannot be called back, so dismissal waits it out.
    cancel() {
      if (status !== 'busy') status = 'idle';
    },
    reset() {
      status = 'idle';
      origin = null;
    },
  };
}

export type ImageReportFlow = ReturnType<typeof createImageReportFlow>;
