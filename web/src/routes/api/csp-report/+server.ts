import { rateLimit } from '$lib/server/rateLimit';
import { cspReportBucket } from '$lib/server/rateLimitKeys';
import { rateLimitPolicy } from '$lib/server/rateLimitPolicy';
import { contentTypeOf, readBodyWithinLimit, throttled } from '$lib/server/http';
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

interface ReportingApiEntry {
  type: 'csp-violation';
  body: Record<string, unknown>;
  url?: unknown;
}

function cappedString(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, MAX_FIELD_LENGTH) : '';
}

function sanitizeReportedUrl(value: unknown): string {
  const reportedValue = cappedString(value);
  try {
    const url = new URL(reportedValue);
    url.search = '';
    url.hash = '';
    return cappedString(url.toString());
  } catch {
    return reportedValue;
  }
}

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function fromReportUriPayload(report: Record<string, unknown>): CspViolation {
  return {
    documentURL: sanitizeReportedUrl(report['document-uri']),
    blockedURL: sanitizeReportedUrl(report['blocked-uri']),
    directive:
      cappedString(report['effective-directive']) || cappedString(report['violated-directive']),
    disposition: cappedString(report['disposition']) || 'enforce',
    sourceFile: sanitizeReportedUrl(report['source-file']),
    line: finiteNumberOrNull(report['line-number']),
    column: finiteNumberOrNull(report['column-number']),
    sample: cappedString(report['script-sample']),
  };
}

function fromReportingApiPayload(body: Record<string, unknown>, url: unknown): CspViolation {
  return {
    documentURL: sanitizeReportedUrl(body.documentURL) || sanitizeReportedUrl(url),
    blockedURL: sanitizeReportedUrl(body.blockedURL),
    directive: cappedString(body.effectiveDirective),
    disposition: cappedString(body.disposition) || 'enforce',
    sourceFile: sanitizeReportedUrl(body.sourceFile),
    line: finiteNumberOrNull(body.lineNumber),
    column: finiteNumberOrNull(body.columnNumber),
    sample: cappedString(body.sample),
  };
}

function isReportingApiEntry(item: unknown): item is ReportingApiEntry {
  if (typeof item !== 'object' || item === null) return false;

  const entry = item as Record<string, unknown>;
  return entry.type === 'csp-violation' && typeof entry.body === 'object' && entry.body !== null;
}

function extractViolations(payload: unknown): CspViolation[] {
  if (Array.isArray(payload)) {
    return payload
      .filter(isReportingApiEntry)
      .map((entry) => fromReportingApiPayload(entry.body, entry.url));
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
  const { limited, retryAfter } = rateLimit(
    cspReportBucket(getClientAddress()),
    rateLimitPolicy.cspReport
  );
  if (limited) return throttled(retryAfter);

  const contentType = contentTypeOf(request);
  if (!ACCEPTED_CONTENT_TYPES.includes(contentType)) {
    return new Response(null, { status: 415 });
  }

  const body = await readBodyWithinLimit(request, MAX_BODY_BYTES);
  if (!body.ok) {
    return new Response(null, { status: 413 });
  }
  const raw = body.bytes.toString('utf8');

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
