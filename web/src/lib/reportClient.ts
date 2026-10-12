import { apiUrl } from '$lib/api';
import type { StyleName } from '$lib/ai/styles';
import { IMAGE_REPORT_FORM_FIELDS, type AiReportKind } from '$lib/imageReport';
import type { ReportRequestBody } from '$lib/report';
import type { ReportResponse } from '../routes/api/report/+server';
import type { ImageReportResponse } from '../routes/api/report-image/+server';

// The client half of the two report endpoints' wire contract. Each request is
// built from the declaration its route parses ($lib/report's body type,
// $lib/imageReport's field names), and reportClient.test.ts sends what these
// build through the real route handlers.

export function postFeedbackReport(
  body: ReportRequestBody,
  signal: AbortSignal
): Promise<Response> {
  return fetch(apiUrl('/api/report'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
}

interface ImageReportFields {
  kind: AiReportKind;
  drawing: Blob;
  /** The AI picture; absent from a false-positive refusal, which has none. */
  output: Blob | null;
  style: StyleName | null;
}

export function postImageReport(
  { kind, drawing, output, style }: ImageReportFields,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<Response> {
  const field = IMAGE_REPORT_FORM_FIELDS;
  const form = new FormData();
  form.set(field.kind, kind);
  form.set(field.drawing, drawing, field.drawing);
  if (output) form.set(field.output, output, field.output);
  form.set(field.style, style ?? '');
  return fetch(apiUrl('/api/report-image'), { method: 'POST', headers, body: form, signal });
}

// A body carrying a string `error` is a failure that says why even without
// `ok: false`: a platform or proxy can answer that way, and its reason is
// still the most useful line to show the parent.
function narrowReportReply(body: unknown): ReportResponse | ImageReportResponse | null {
  if (typeof body !== 'object' || body === null) return null;
  if ('ok' in body && body.ok === true) {
    return 'reportId' in body && typeof body.reportId === 'string'
      ? { ok: true, reportId: body.reportId }
      : { ok: true };
  }
  if ('error' in body && typeof body.error === 'string') return { ok: false, error: body.error };
  return null;
}

/**
 * Either report endpoint's reply, read from `unknown` into its declared shape.
 * `null` means the body gave no usable answer — not JSON, `null`, or neither
 * `ok: true` nor a string `error` — so the caller shows its own copy instead
 * of a blank or misattributed line. A read the caller's own `signal` cut
 * short rethrows: only the caller can tell its deadline from an unmount.
 */
export async function readReportReply(
  response: Response,
  signal: AbortSignal
): Promise<ReportResponse | ImageReportResponse | null> {
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (signal.aborted) throw error;
    return null;
  }
  return narrowReportReply(body);
}
