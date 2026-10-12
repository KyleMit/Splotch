import type { AiMime, AiStyle } from './contract';
import type { AiCredentialReference } from './credentials';

export const MAX_AI_REPORT_BYTES = 4 * 1024 * 1024;
export const AI_REPORT_TIMEOUT_MS = 20_000;
export const AI_REPORT_REVIEW_HOURS = 24;
export const AI_REPORT_RETENTION_DAYS = 30;
export const MAX_AI_REPORT_TOKEN_CHARACTERS = 4096;
const MAX_REPORT_BOUNDARY_ATTEMPTS = 16;
export const AI_REPORT_FIELDS = {
  kind: 'kind',
  drawing: 'drawing',
  output: 'output',
  style: 'style',
} as const;
export type AiReportContext = {
  id: number;
  drawing: Uint8Array;
  style: AiStyle;
  credential: AiCredentialReference;
  installationId: string | null;
  result: { bytes: Uint8Array; mime: AiMime; token: string | null; uris: Set<string> } | null;
  used: boolean;
};
export type AiReportPreview = { uri: string; drawing: string; output: string; style: AiStyle };
export type AiReportState =
  | { phase: 'idle' }
  | { phase: 'gating'; uri: string }
  | { phase: 'confirm' | 'sending'; preview: AiReportPreview }
  | { phase: 'success'; uri: string; reportId: string }
  | { phase: 'error' | 'unknown' | 'unavailable'; uri: string; message: string; retryAt: number };

export function imageReportToken(raw: string | null) {
  return raw && raw.length <= MAX_AI_REPORT_TOKEN_CHARACTERS && /^[\x21-\x7e]+$/.test(raw)
    ? raw
    : null;
}

function contains(bytes: Uint8Array, needle: Uint8Array) {
  for (let offset = 0; offset <= bytes.length - needle.length; offset++) {
    if (
      bytes[offset] === needle[0] &&
      needle.every((value, index) => value === bytes[offset + index])
    )
      return true;
  }
  return false;
}

export function reportMultipart(context: AiReportContext) {
  const result = context.result;
  if (
    !result ||
    !context.drawing.length ||
    !result.bytes.length ||
    context.drawing.length + result.bytes.length > MAX_AI_REPORT_BYTES
  )
    throw new Error('That AI report is too large or unavailable.');
  const encoder = new TextEncoder();
  let boundary = '';
  for (let index = 0; index < MAX_REPORT_BOUNDARY_ATTEMPTS; index++) {
    const candidate = `splotch-report-${index}`;
    const needle = encoder.encode(candidate);
    if (!contains(context.drawing, needle) && !contains(result.bytes, needle)) {
      boundary = candidate;
      break;
    }
  }
  if (!boundary) throw new Error('AI report boundaries are unavailable.');
  const field = AI_REPORT_FIELDS;
  const chunks = [
    encoder.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="${field.kind}"\r\n\r\npicture\r\n`
    ),
    encoder.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="${field.drawing}"; filename="drawing.png"\r\nContent-Type: image/png\r\n\r\n`
    ),
    context.drawing,
    encoder.encode('\r\n'),
    encoder.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="${field.output}"; filename="output"\r\nContent-Type: ${result.mime}\r\n\r\n`
    ),
    result.bytes,
    encoder.encode('\r\n'),
    encoder.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="${field.style}"\r\n\r\n${context.style}\r\n--${boundary}--\r\n`
    ),
  ];
  const body = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}
