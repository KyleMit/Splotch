import { apiUrl } from '$lib/api';
import type { StyleName } from '$lib/ai/styles';
import { IMAGE_REPORT_FORM_FIELDS, type AiReportKind } from '$lib/imageReport';
import type { ReportRequestBody } from '$lib/report';
import type { ReportResponse } from './server/api/report';
import type { ImageReportResponse } from './server/api/reportImage';
import { narrowReportReply } from './reportReply';

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
