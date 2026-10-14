import type { AiMime, AiStyle } from './contract';
import type { AiCredentialReference } from './credentials';

// Candidate import ownership rejects paths outside native-architecture.
// tools/tests/native-ai-recovery-report-transport.test.mjs pins the hosted apiHeaders contract.
export const REPORT_TOKEN_HEADER = 'X-Report-Token';
export const MAX_AI_REPORT_BYTES = 4 * 1024 * 1024;
export const AI_REPORT_TIMEOUT_MS = 20_000;
export const AI_REPORT_REVIEW_HOURS = 24;
export const AI_REPORT_RETENTION_DAYS = 30;
export const AI_REPORT_HANDLING_NOTICE = `We review reports within ${AI_REPORT_REVIEW_HOURS} hours and schedule deletion after ${AI_REPORT_RETENTION_DAYS} days by a daily cleanup.`;
export const MAX_AI_REPORT_TOKEN_CHARACTERS = 4096;
const MAX_REPORT_BOUNDARY_ATTEMPTS = 16;
export const AI_REPORT_FIELDS = {
  kind: 'kind',
  drawing: 'drawing',
  output: 'output',
  style: 'style',
} as const;
export type AiReportTarget =
  { kind: 'picture'; uri: string } | { kind: 'false-positive-refusal'; id: number };
type AiReportEvidence =
  | { kind: 'picture'; bytes: Uint8Array; mime: AiMime; token: string | null; uris: Set<string> }
  | { kind: 'false-positive-refusal'; token: string };
export type AiReportContext = {
  id: number;
  drawing: Uint8Array;
  // Null for a run sent with no style, which the report sends as an empty style.
  style: AiStyle | null;
  credential: AiCredentialReference;
  installationId: string | null;
  evidence: AiReportEvidence | null;
  used: boolean;
};
export type AiReportPreview = { drawing: string; style: AiStyle | null } & (
  | { target: Extract<AiReportTarget, { kind: 'picture' }>; output: string }
  | { target: Extract<AiReportTarget, { kind: 'false-positive-refusal' }>; output?: never }
);
export type AiReportState =
  | { phase: 'idle' }
  | { phase: 'gating'; target: AiReportTarget }
  | { phase: 'confirm' | 'sending'; preview: AiReportPreview }
  | { phase: 'success'; target: AiReportTarget; reportId: string }
  | {
      phase: 'error' | 'unknown' | 'unavailable';
      target: AiReportTarget;
      message: string;
      retryAt: number;
    };

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
  const evidence = context.evidence;
  if (
    !evidence ||
    !context.drawing.length ||
    (evidence.kind === 'picture' && !evidence.bytes.length) ||
    context.drawing.length + (evidence.kind === 'picture' ? evidence.bytes.length : 0) >
      MAX_AI_REPORT_BYTES ||
    (evidence.kind === 'false-positive-refusal' && !imageReportToken(evidence.token))
  )
    throw new Error('That AI report is too large or unavailable.');
  const encoder = new TextEncoder();
  let boundary = '';
  for (let index = 0; index < MAX_REPORT_BOUNDARY_ATTEMPTS; index++) {
    const candidate = `splotch-report-${index}`;
    const needle = encoder.encode(candidate);
    if (
      !contains(context.drawing, needle) &&
      (evidence.kind === 'false-positive-refusal' || !contains(evidence.bytes, needle))
    ) {
      boundary = candidate;
      break;
    }
  }
  if (!boundary) throw new Error('AI report boundaries are unavailable.');
  const field = AI_REPORT_FIELDS;
  const chunks = [
    encoder.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="${field.kind}"\r\n\r\n${evidence.kind}\r\n`
    ),
    encoder.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="${field.drawing}"; filename="drawing.png"\r\nContent-Type: image/png\r\n\r\n`
    ),
    context.drawing,
    encoder.encode('\r\n'),
  ];
  if (evidence.kind === 'picture')
    chunks.push(
      encoder.encode(
        `--${boundary}\r\nContent-Disposition: form-data; name="${field.output}"; filename="output"\r\nContent-Type: ${evidence.mime}\r\n\r\n`
      ),
      evidence.bytes,
      encoder.encode('\r\n')
    );
  chunks.push(
    encoder.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="${field.style}"\r\n\r\n${context.style ?? ''}\r\n--${boundary}--\r\n`
    )
  );
  const body = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}
