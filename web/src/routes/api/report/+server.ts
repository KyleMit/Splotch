import { json } from '@sveltejs/kit';
import { rateLimit } from '$lib/server/rateLimit';
import { reportBucket } from '$lib/server/rateLimitKeys';
import { rateLimitPolicy } from '$lib/server/rateLimitPolicy';
import { asRecord, readJsonBody, throttled } from '$lib/server/http';
import { submitReport } from '$lib/server/report';
import { REPORT_HONEYPOT_FIELD } from '$lib/report';
import type { RequestHandler } from './$types';

/**
 * Receive an in-app "report a bug / suggest a feature" submission and open a
 * labelled GitHub issue for it. Body: { kind, message, device?, hp? }. Returns
 * { ok: true, url } with the issue URL on success.
 *
 * Validation and issue creation live in $lib/server/report so the `/feedback`
 * page's form action shares them; this route only adds the wire shape.
 *
 * Unauthenticated, so it is rate-limited per IP and each issue creation is a
 * write; the limit is deliberately tighter than the read-only oracles. The
 * bucket is charged before submitReport sees the body, so a honeypot submission
 * still costs budget — scripts/api-smoke.mjs bursts past the limit with
 * honeypotted payloads that cannot open an issue on any server, and
 * server.test.ts pins that order.
 */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const { limited, retryAfter } = rateLimit(
    reportBucket(getClientAddress()),
    rateLimitPolicy.report
  );
  if (limited) return throttled(retryAfter);

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = asRecord(parsed.body);
  const result = await submitReport({
    kind: body?.kind,
    message: body?.message,
    device: body?.device,
    hp: body?.[REPORT_HONEYPOT_FIELD],
  });

  return result.ok
    ? json({ ok: true, url: result.url })
    : json({ ok: false, error: result.error }, { status: result.status });
};
