import { sanitizeDeviceInfo, type DeviceInfo } from '../feedback/deviceReport';
import { describeFeedbackDevice } from '../feedback/feedback';
import { FEEDBACK_APP_VERSION } from '../feedback/feedbackCopy';
import { sendFeedback, type FeedbackTransport } from '../feedback/feedbackTransport';
import { attachesDevice, type ReportKind } from '../feedback/report';
import { truncateCodeUnits } from '../feedback/truncate';
import type { ParentOperationPort } from '../parentCenter/parentPolicy';
import type { AiStyle } from './contract';
import type { AiFailureDetails } from './sessionContract';
import { REPORT_RECEIVED_MESSAGE, reportFailureMessage } from '../../../../web/src/lib/reportReply';

// Shipping's failureReport.ts cap on the error message a problem report carries;
// native-ai-problem-report.test.mjs reads it back.
export const MAX_FAILURE_MESSAGE_LENGTH = 1000;
// The kind a problem report files as, whose device opt-in follows `attachesDevice`.
const PROBLEM_REPORT_KIND: ReportKind = 'bug';

export const AI_PROBLEM_REPORT_COPY = {
  title: 'Report this problem',
  copy: 'The error below and your app version go to a grown-up at Splotch in our private support tracker.',
  sent: REPORT_RECEIVED_MESSAGE,
  failed: reportFailureMessage('generation-error'),
  whatIsSent: 'What will be sent',
  notSent: 'Not sent: the drawing, names, accounts, or location.',
  retry: 'Retry report',
  launcher: 'Report a problem',
} as const;

export type ProblemRow = Readonly<{ label: string; value: string }>;

// The rows shipping's failureReportRows lists: the error, its message, the attempts in a row, the
// app version and platform, and the art style. Nothing of the drawing or the credential.
export function problemReportRows(
  failure: AiFailureDetails | null,
  attempts: number,
  style: AiStyle | null,
  platform: string
): ProblemRow[] {
  return [
    {
      label: 'Error',
      value: failure
        ? `${failure.status ?? 'No response'} · ${failure.endpoint}`
        : 'Picture generation failed',
    },
    {
      label: 'Message',
      value:
        (failure &&
          truncateCodeUnits(
            failure.message.replace(/\s+/g, ' ').trim(),
            MAX_FAILURE_MESSAGE_LENGTH
          )) ||
        'No error details available.',
    },
    { label: 'Attempts', value: `${attempts} in a row` },
    { label: 'App version', value: `${FEEDBACK_APP_VERSION} (${platform})` },
    { label: 'Art style', value: style ?? 'Default' },
  ];
}

export type AiProblemState =
  | Readonly<{ phase: 'idle' | 'gating' }>
  | Readonly<{
      phase: 'confirm' | 'sending';
      rows: readonly ProblemRow[];
      includeDevice: boolean;
      // What the device opt-in would attach, listed under it once it is on.
      deviceRows: readonly ProblemRow[];
    }>
  | Readonly<{ phase: 'success' | 'error'; message: string }>;

export type AiProblemTransport = Readonly<{
  // What the report names as the app's platform: web, android or ios.
  platform: string;
  transport: FeedbackTransport;
  device: () => DeviceInfo;
  offline: () => boolean | null;
}>;

// A grown-up's report of a failed AI run, from the error card's Report a problem to its outcome:
// asked for behind the AI report check, confirmed on the card that lists exactly what goes, and
// sent through the feedback endpoint as a bug report.
export function createAiProblemReport({
  transport,
  device,
  offline,
  parent,
  publish,
}: AiProblemTransport & {
  parent?: ParentOperationPort;
  publish: (state: AiProblemState) => void;
}) {
  let state: AiProblemState = { phase: 'idle' };
  let controller: AbortController | null = null;
  let rows: readonly ProblemRow[] = [];
  let epoch = 0;
  const set = (next: AiProblemState) => {
    state = next;
    publish(next);
  };
  const confirm = (includeDevice = false) =>
    set({ phase: 'confirm', rows, includeDevice, deviceRows: describeFeedbackDevice(device) });
  return {
    request(next: readonly ProblemRow[]) {
      if (state.phase !== 'idle') return;
      rows = next;
      const ticket = ++epoch;
      if (!parent) {
        confirm();
        return;
      }
      set({ phase: 'gating' });
      const asked = parent.request('imageReport', (proof) => {
        if (ticket === epoch && proof.valid()) confirm();
      });
      if (!asked && ticket === epoch) set({ phase: 'idle' });
    },
    setIncludeDevice(includeDevice: boolean) {
      if (state.phase === 'confirm') confirm(includeDevice);
    },
    // No second check: the one guarding this report was already answered.
    retry() {
      if (state.phase === 'error') confirm();
    },
    async send() {
      if (state.phase !== 'confirm') return;
      const { includeDevice } = state;
      const ticket = epoch;
      const request = new AbortController();
      controller = request;
      set({ phase: 'sending', rows, includeDevice, deviceRows: state.deviceRows });
      let attached: DeviceInfo | undefined;
      try {
        attached = attachesDevice(PROBLEM_REPORT_KIND, includeDevice)
          ? sanitizeDeviceInfo(device())
          : undefined;
      } catch {
        attached = undefined;
      }
      const outcome = await sendFeedback(
        transport,
        {
          kind: PROBLEM_REPORT_KIND,
          message: rows.map(({ label, value }) => `${label}: ${value}`).join('\n'),
          ...(attached ? { device: attached } : {}),
        },
        request,
        offline
      );
      if (ticket !== epoch || controller !== request) return;
      controller = null;
      set(
        outcome.status === 'success'
          ? { phase: 'success', message: AI_PROBLEM_REPORT_COPY.sent }
          : {
              phase: 'error',
              message: outcome.status === 'error' ? AI_PROBLEM_REPORT_COPY.failed : outcome.message,
            }
      );
    },
    // A send on the wire cannot be called back, so dismissal waits it out.
    cancel() {
      if (state.phase === 'sending') return;
      epoch += 1;
      parent?.cancel('imageReport');
      set({ phase: 'idle' });
    },
    reset() {
      epoch += 1;
      controller?.abort();
      controller = null;
      set({ phase: 'idle' });
    },
  };
}

export type AiProblemReport = ReturnType<typeof createAiProblemReport>;
