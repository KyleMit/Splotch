import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IMAGE_REPORT_RETENTION_DAYS, IMAGE_REPORT_REVIEW_HOURS } from '$lib/imageReport';

vi.mock('$lib/ai/credentials', () => ({ aiCredentialHeaders: async () => ({}) }));

import AiImageReport from './AiImageReport.svelte';
import { createImageReportFlow } from './imageReportFlow.svelte';
import { closeAiResult, startAiGeneration } from '$lib/state/aiGeneration.svelte';

let mounted: ReturnType<typeof mount> | null = null;

// Text is compared as rendered, never whitespace-normalized: a formatter
// wrapping template copy leaves a newline run inside the text node, which a
// browser shows as one space but an anchored text locator no longer matches.
function openConfirmation(kind: 'picture' | 'false-positive-refusal') {
  const target = document.createElement('div');
  document.body.append(target);
  // The report sends the run's drawing, which the generation state holds.
  startAiGeneration('blob:drawing');
  const report = createImageReportFlow();
  report.request({ x: 0, y: 0 });
  mounted = mount(AiImageReport, {
    target,
    props: {
      kind,
      outputUrl: kind === 'picture' ? 'blob:output' : null,
      reportToken: null,
      report,
    },
  });
  flushSync();
  return target;
}

async function sendReport(target: HTMLElement) {
  const send = [...target.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === 'Send report'
  );
  if (!send) throw new Error('No Send report button');
  send.click();
  await vi.waitFor(() => {
    flushSync();
    expect(target.querySelector('[role="status"]')).not.toBeNull();
  });
  return target.querySelector('[role="status"]')?.textContent;
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).startsWith('blob:')
        ? new Response(new Blob(['image'], { type: 'image/png' }))
        : Response.json({ ok: true, reportId: 'report-id' })
    )
  );
});

afterEach(async () => {
  if (mounted) await unmount(mounted);
  mounted = null;
  closeAiResult();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe.each(['picture', 'false-positive-refusal'] as const)(
  'AiImageReport %s report copy',
  (kind) => {
    it('promises the review window and the retention window before sending', () => {
      const confirmation = openConfirmation(kind).querySelector('dialog .confirm-card-heading p');

      expect(confirmation?.textContent).toContain(
        `We look within ${IMAGE_REPORT_REVIEW_HOURS} hours, and the report is deleted after ${IMAGE_REPORT_RETENTION_DAYS}`
      );
    });

    it('repeats the review promise with the report reference once sent', async () => {
      expect(await sendReport(openConfirmation(kind))).toBe(
        `Thanks. We'll review it within ${IMAGE_REPORT_REVIEW_HOURS} hours. Keep this report reference if you want it deleted sooner: report-id`
      );
    });
  }
);
