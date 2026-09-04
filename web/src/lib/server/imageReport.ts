import { STYLE_SUFFIXES, type StyleName } from '$lib/ai/styles';
import { AI_REPORT_KINDS, type AiReportKind } from '$lib/imageReport';
import type { ReportTokenContext } from './reportToken';
import { createIssue } from './github';
import { isAllowedImageType, resolveGenerationPrompt } from './generateImagePolicy';
import {
  deleteImageReport,
  IMAGE_REPORT_RETENTION_DAYS,
  IMAGE_REPORT_STORE_NAME,
  saveImageReport,
  type SaveImageReportInput,
  type SavedImageReport,
} from './imageReportStore';

const MAX_REPORT_BUNDLE_BYTES = 4 * 1024 * 1024;
// `submitImageReport` bounds the two images it keeps, but only after the whole
// multipart payload is buffered, and it never sees the parts it discards — so
// two tiny images plus a huge unused field would sail past it. The route caps
// the raw body at this before parsing: the bundle limit plus a budget for part
// headers, boundaries, and the style field.
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
export const MAX_REPORT_REQUEST_BYTES = MAX_REPORT_BUNDLE_BYTES + MULTIPART_OVERHEAD_BYTES;
const IMAGE_REPORT_LABELS = ['user-report', 'area:ai-art', 'type:bug'];

export interface ImageReportInput {
  kind: unknown;
  drawing: unknown;
  output: unknown;
  style: unknown;
  reportContext: ReportTokenContext | null;
}

export type ImageReportResult =
  { ok: true; reportId: string } | { ok: false; status: 400 | 502 | 503; error: string };

function readStyle(raw: unknown): StyleName | null | undefined {
  if (raw === '' || raw === null) return null;
  return typeof raw === 'string' && Object.hasOwn(STYLE_SUFFIXES, raw)
    ? (raw as StyleName)
    : undefined;
}

function readReportKind(raw: unknown): AiReportKind | undefined {
  if (raw === null) return 'picture';
  return typeof raw === 'string' && (AI_REPORT_KINDS as readonly string[]).includes(raw)
    ? (raw as AiReportKind)
    : undefined;
}

function validImage(value: unknown): value is Blob {
  return value instanceof Blob && value.size > 0 && isAllowedImageType(value.type);
}

export async function submitImageReport({
  kind: rawKind,
  drawing,
  output,
  style: rawStyle,
  reportContext,
}: ImageReportInput): Promise<ImageReportResult> {
  const kind = readReportKind(rawKind);
  const style = readStyle(rawStyle);
  if (!kind || !validImage(drawing) || style === undefined) {
    return { ok: false, status: 400, error: 'That AI report could not be sent.' };
  }

  let reportInput: SaveImageReportInput;
  let refusalReason: string | null = null;
  const prompt = resolveGenerationPrompt(style);
  if (kind === 'picture') {
    if (!validImage(output) || reportContext?.kind === 'false-positive-refusal') {
      return { ok: false, status: 400, error: 'That AI report could not be sent.' };
    }
    reportInput = { kind, input: drawing, output, prompt, style };
  } else {
    if (output !== null) {
      return { ok: false, status: 400, error: 'That AI report could not be sent.' };
    }
    if (reportContext?.kind !== 'false-positive-refusal') {
      return {
        ok: false,
        status: 503,
        error: 'AI reporting is not available right now. Please try again later.',
      };
    }
    refusalReason = reportContext.refusalReason;
    reportInput = {
      kind,
      input: drawing,
      output: null,
      prompt,
      style,
      refusalReason,
    };
  }

  if (drawing.size + (reportInput.output?.size ?? 0) > MAX_REPORT_BUNDLE_BYTES) {
    return { ok: false, status: 400, error: 'That AI report is too large to send.' };
  }

  let report: SavedImageReport;
  try {
    report = await saveImageReport(reportInput);
  } catch (error) {
    console.error('[report-image] evidence storage failed', error);
    return {
      ok: false,
      status: 503,
      error: 'AI reporting is not available right now. Please try again later.',
    };
  }

  const styleLabel = style ?? 'Default';
  const refusal = kind === 'false-positive-refusal';
  try {
    await createIssue({
      title: refusal
        ? `[AI refusal] Possible false positive (${styleLabel})`
        : `[AI image] Reported ${styleLabel} picture`,
      labels: IMAGE_REPORT_LABELS,
      body: [
        refusal
          ? 'A parent reported a safety refusal as a possible false positive.'
          : 'An AI-generated picture was reported from the result view.',
        '',
        `- **Category:** ${kind}`,
        `- **Blob store:** \`${IMAGE_REPORT_STORE_NAME}\``,
        `- **Blob key prefix:** \`${report.keyPrefix}\``,
        `- **Style:** ${styleLabel}`,
        ...(refusalReason ? [`- **Refusal reason:** ${refusalReason}`] : []),
        `- **Reported:** ${report.reportedAt}`,
        `- **Automatic deletion:** ${report.deleteAfter}`,
        '',
        refusal
          ? `The bundle contains the rejected drawing, resolved prompt, and metadata. Review within 24 hours. It is automatically deleted after ${IMAGE_REPORT_RETENTION_DAYS} days.`
          : `The bundle contains the input drawing, resolved prompt, output image, and metadata. Review within 24 hours. It is automatically deleted after ${IMAGE_REPORT_RETENTION_DAYS} days.`,
      ].join('\n'),
    });
  } catch (error) {
    await deleteImageReport(report).catch((cleanupError) => {
      console.error('[report-image] failed report cleanup', cleanupError);
    });
    console.error('[report-image] private notification failed', error);
    return {
      ok: false,
      status: 502,
      error: 'Could not send your AI report. Please try again later.',
    };
  }

  return { ok: true, reportId: report.reportId };
}
