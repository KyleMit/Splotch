import { STYLE_SUFFIXES, type StyleName } from '$lib/ai/styles';
import { createIssue } from './github';
import { isAllowedImageType, resolveGenerationPrompt } from './generateImagePolicy';
import {
  deleteImageReport,
  IMAGE_REPORT_RETENTION_DAYS,
  IMAGE_REPORT_STORE_NAME,
  saveImageReport,
  type SavedImageReport,
} from './imageReportStore';

export const MAX_REPORT_BUNDLE_BYTES = 4 * 1024 * 1024;
// `submitImageReport` bounds the two images it keeps, but only after the whole
// multipart payload is buffered, and it never sees the parts it discards — so
// two tiny images plus a huge unused field would sail past it. The route caps
// the raw body at this before parsing: the bundle limit plus a budget for part
// headers, boundaries, and the style field.
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
export const MAX_REPORT_REQUEST_BYTES = MAX_REPORT_BUNDLE_BYTES + MULTIPART_OVERHEAD_BYTES;
const IMAGE_REPORT_LABELS = ['user-report', 'area:ai-art', 'type:bug'];

export interface ImageReportInput {
  drawing: unknown;
  output: unknown;
  style: unknown;
}

export type ImageReportResult =
  | { ok: true; reportId: string }
  | { ok: false; status: 400 | 502 | 503; error: string };

function readStyle(raw: unknown): StyleName | null | undefined {
  if (raw === '' || raw === null) return null;
  return typeof raw === 'string' && Object.hasOwn(STYLE_SUFFIXES, raw)
    ? (raw as StyleName)
    : undefined;
}

function validImage(value: unknown): value is Blob {
  return value instanceof Blob && value.size > 0 && isAllowedImageType(value.type);
}

export async function submitImageReport({
  drawing,
  output,
  style: rawStyle,
}: ImageReportInput): Promise<ImageReportResult> {
  const style = readStyle(rawStyle);
  if (!validImage(drawing) || !validImage(output) || style === undefined) {
    return { ok: false, status: 400, error: 'That picture could not be reported.' };
  }
  if (drawing.size + output.size > MAX_REPORT_BUNDLE_BYTES) {
    return { ok: false, status: 400, error: 'That picture is too large to report.' };
  }

  const prompt = resolveGenerationPrompt(style);
  let report: SavedImageReport;
  try {
    report = await saveImageReport({ input: drawing, output, prompt, style });
  } catch (error) {
    console.error('[report-image] evidence storage failed', error);
    return {
      ok: false,
      status: 503,
      error: 'Picture reporting is not available right now. Please try again later.',
    };
  }

  const styleLabel = style ?? 'Default';
  try {
    await createIssue({
      title: `[AI image] Reported ${styleLabel} picture`,
      labels: IMAGE_REPORT_LABELS,
      body: [
        'An AI-generated picture was reported from the result view.',
        '',
        `- **Blob store:** \`${IMAGE_REPORT_STORE_NAME}\``,
        `- **Blob key prefix:** \`${report.keyPrefix}\``,
        `- **Style:** ${styleLabel}`,
        `- **Reported:** ${report.reportedAt}`,
        `- **Automatic deletion:** ${report.deleteAfter}`,
        '',
        `The bundle contains the input drawing, resolved prompt, output image, and metadata. Review within 24 hours. It is automatically deleted after ${IMAGE_REPORT_RETENTION_DAYS} days.`,
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
      error: 'Could not send your picture report. Please try again later.',
    };
  }

  return { ok: true, reportId: report.reportId };
}
