import { rateLimit } from '$lib/server/rateLimit';
import { throttled } from '$lib/server/http';
import type { RequestHandler } from './$types';

// A single page load under a broken policy can fire dozens of violations, so
// cap both the payload and how many reports one payload may log.
const MAX_BODY_BYTES = 32 * 1024;
const MAX_REPORTS_PER_PAYLOAD = 10;
const MAX_FIELD_LENGTH = 300;

// Browsers send report-uri batches as application/csp-report and Reporting-API
// batches as application/reports+json; plain JSON is accepted for tooling.
const ACCEPTED_CONTENT_TYPES = [
  'application/csp-report',
  'application/reports+json',
  'application/json',
];

interface CspViolation {
  documentURL: string;
  blockedURL: string;
  directive: string;
  disposition: string;
  sourceFile: string;
  line: number | null;
  column: number | null;
  sample: string;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, MAX_FIELD_LENGTH) : '';
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function fromReportUriPayload(report: Record<string, unknown>): CspViolation {
  return {
    documentURL: str(report['document-uri']),
    blockedURL: str(report['blocked-uri']),
    directive: str(report['effective-directive']) || str(report['violated-directive']),
    disposition: str(report['disposition']) || 'enforce',
    sourceFile: str(report['source-file']),
    line: num(report['line-number']),
    column: num(report['column-number']),
    sample: str(report['script-sample']),
  };
}

function fromReportingApiPayload(body: Record<string, unknown>, url: unknown): CspViolation {
  return {
    documentURL: str(body.documentURL) || str(url),
    blockedURL: str(body.blockedURL),
    directive: str(body.effectiveDirective),
    disposition: str(body.disposition) || 'enforce',
    sourceFile: str(body.sourceFile),
    line: num(body.lineNumber),
    column: num(body.columnNumber),
    sample: str(body.sample),
  };
}

function extractViolations(payload: unknown): CspViolation[] {
  if (Array.isArray(payload)) {
    return payload
      .filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' &&
          item !== null &&
          (item as Record<string, unknown>).type === 'csp-violation' &&
          typeof (item as Record<string, unknown>).body === 'object' &&
          (item as Record<string, unknown>).body !== null
      )
      .map((item) => fromReportingApiPayload(item.body as Record<string, unknown>, item.url));
  }
  if (typeof payload === 'object' && payload !== null) {
    const report = (payload as Record<string, unknown>)['csp-report'];
    if (typeof report === 'object' && report !== null) {
      return [fromReportUriPayload(report as Record<string, unknown>)];
    }
  }
  return [];
}

/**
 * First-party CSP violation receiver (issue #457). The site's CSP header
 * (root netlify.toml) points report-uri / report-to here, so real-traffic
 * violations land as structured `[csp-report]` lines in the Netlify function
 * log — the app's only telemetry sink (no third-party reporting by design).
 *
 * Browsers post these unauthenticated, so there is no credential gate; abuse
 * is blunted the same way as /api/report — a per-IP rate limit plus a hard
 * body-size cap — and every accepted payload is answered 204 regardless of
 * how many reports inside it were usable.
 */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const { limited, retryAfter } = rateLimit(`csp-report:${getClientAddress()}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (limited) return throttled(retryAfter);

  const contentType = (request.headers.get('content-type') ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (!ACCEPTED_CONTENT_TYPES.includes(contentType)) {
    return new Response(null, { status: 415 });
  }

  // Reject on the declared length first so an oversized body is never
  // buffered; the byte-accurate re-check after reading catches liars (a
  // code-unit length check would let multibyte payloads triple the cap).
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return new Response(null, { status: 413 });
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return new Response(null, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 204 });
  }

  for (const violation of extractViolations(payload).slice(0, MAX_REPORTS_PER_PAYLOAD)) {
    console.warn('[csp-report]', JSON.stringify(violation));
  }

  return new Response(null, { status: 204 });
};
