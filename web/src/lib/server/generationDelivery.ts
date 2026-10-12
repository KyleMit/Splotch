import { error } from '@sveltejs/kit';
import { FREE_GENERATIONS_REMAINING_HEADER, REPORT_TOKEN_HEADER } from '$lib/apiHeaders';
import { SAFETY_REFUSAL_STATUS } from '$lib/ai/generationResult';
import { hasPunchedBackground, type StyleName } from '../ai/styles';
import { fail } from './http';
import { issueReportToken, type ReportTokenBinding } from './reportToken';

// How a finished generation reaches the child, whichever way it arrives: in-line
// from /api/generate-image, or collected from /api/generation-result after the
// background worker ran it (ADR-0115). docs/API.md promises the two answer
// alike, so each response is built here once. Each route keeps its own flow,
// its report-token binding, and its free-grant settlement.

export interface DeliveredImage {
  bytes: Uint8Array;
  mimeType: string;
}

/** The refusal, with the proof a parent needs to report it as a false positive. */
export function safetyRefusalResponse(
  reason: string,
  binding: ReportTokenBinding | null
): Response {
  const headers: Record<string, string> = {};
  const reportToken = binding
    ? issueReportToken(binding, { kind: 'false-positive-refusal', refusalReason: reason })
    : null;
  if (reportToken) headers[REPORT_TOKEN_HEADER] = reportToken;
  return fail(SAFETY_REFUSAL_STATUS, `Drawing was blocked for safety: ${reason}`, headers);
}

/**
 * The provider's picture as the child gets it: a punched-background style has
 * its flat background keyed out. One that cannot be keyed throws the 502 both
 * deliveries answer with, after a warning tagged with the route that hit it.
 */
export async function prepareDeliveredImage(
  style: StyleName | null,
  bytes: Uint8Array,
  mimeType: string,
  logTag: 'generate-image' | 'generation-result'
): Promise<DeliveredImage> {
  if (style === null || !hasPunchedBackground(style)) return { bytes, mimeType };
  try {
    const { keyStickerBackground } = await import('./ai/flatBackgroundPunch');
    const { buffer } = await keyStickerBackground(bytes);
    return { bytes: buffer, mimeType: 'image/png' };
  } catch (cause) {
    console.warn(
      `[${logTag}] Sticker image rejected:`,
      cause instanceof Error ? cause.message : cause
    );
    throw error(502, 'The sticker picture could not be used. Please try again.');
  }
}

/**
 * The picture. `freeRemaining` is the allowance left once this one was charged,
 * null when nothing was charged or the charge could not be recorded.
 * `freeReportBinding` is set for the free tier only, whose picture carries the
 * proof that this AI attempt ran here, so its result can be reported.
 */
export function pictureResponse(
  image: DeliveredImage,
  {
    freeRemaining,
    freeReportBinding,
  }: { freeRemaining: number | null; freeReportBinding: ReportTokenBinding | null }
): Response {
  const headers: Record<string, string> = { 'Content-Type': image.mimeType };
  if (freeRemaining !== null) headers[FREE_GENERATIONS_REMAINING_HEADER] = String(freeRemaining);
  const reportToken = freeReportBinding ? issueReportToken(freeReportBinding) : null;
  if (reportToken) headers[REPORT_TOKEN_HEADER] = reportToken;
  return new Response(Buffer.from(image.bytes), { headers });
}
