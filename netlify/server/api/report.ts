import { rateLimit } from '../rateLimit';
import { reportBucket } from '../rateLimitKeys';
import { rateLimitPolicy } from '../rateLimitPolicy';
import { apiHandler, asRecord, json, readJsonBody, throttled } from '../http';
import { MAX_REPORT_BODY_BYTES, submitReport } from '../report';
import { REPORT_HONEYPOT_FIELD } from '../../../src/lib/report';
import type { ApiHandler } from './apiEvent';

export type ReportResponse = { ok: true } | { ok: false; error: string };

/**
 * Receive an in-app "report a bug / suggest a feature" submission and open a
 * labelled GitHub issue for it. Body: `ReportRequestBody` ($lib/report).
 * Returns { ok: true } on success. The issue lands in the private feedback
 * repository, so no inaccessible URL is returned to the reporter.
 *
 * Validation and issue creation live in $lib/server/report so the `/feedback`
 * page's form action shares them; this route only adds the wire shape.
 *
 * Unauthenticated, so it is rate-limited per IP and each issue creation is a
 * write; the limit is deliberately tighter than the read-only oracles. The
 * bucket is charged before submitReport sees the body, so a honeypot submission
 * still costs budget — tools/api-smoke/run-local-contract.mjs bursts past the limit with
 * honeypotted payloads that cannot open an issue on any server, and
 * server.test.ts pins that order.
 */
export const POST: ApiHandler = apiHandler(async ({ request, getClientAddress }) => {
  const { limited, retryAfter } = rateLimit(
    reportBucket(getClientAddress()),
    rateLimitPolicy.report
  );
  if (limited) return throttled(retryAfter);

  const parsed = await readJsonBody(request, MAX_REPORT_BODY_BYTES);
  if (!parsed.ok) return parsed.response;
  const body = asRecord(parsed.body);
  const result = await submitReport({
    kind: body?.kind,
    message: body?.message,
    device: body?.device,
    hp: body?.[REPORT_HONEYPOT_FIELD],
  });

  return result.ok
    ? json({ ok: true } satisfies ReportResponse)
    : json({ ok: false, error: result.error } satisfies ReportResponse, {
        status: result.status,
      });
});
