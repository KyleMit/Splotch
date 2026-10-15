type ReportReply = { ok: true } | { ok: true; reportId: string } | { ok: false; error: string };
type ImageReportKind = 'picture' | 'false-positive-refusal' | 'generation-error';
const REPORT_FAILURE_MESSAGES: Record<ImageReportKind, string> = {
  picture: 'Could not send your picture report.',
  'false-positive-refusal': 'Could not send your refusal report.',
  'generation-error': 'Could not send your problem report.',
};
export const REPORT_TIMEOUT_MESSAGE = "That's taking too long — please try again.";
export const REPORT_RECEIVED_MESSAGE =
  'Thanks. Your problem report was sent to our private support tracker.';

export function reportFailureMessage(kind: ImageReportKind) {
  return REPORT_FAILURE_MESSAGES[kind];
}

export function narrowReportReply(body: unknown): ReportReply | null {
  if (typeof body !== 'object' || body === null) return null;
  if ('ok' in body && body.ok === true) {
    return 'reportId' in body && typeof body.reportId === 'string'
      ? { ok: true, reportId: body.reportId }
      : { ok: true };
  }
  if ('error' in body && typeof body.error === 'string') return { ok: false, error: body.error };
  return null;
}
