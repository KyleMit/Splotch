import { fail, redirect } from '@sveltejs/kit';
import { rateLimit } from '$lib/server/rateLimit';
import { reportBucket } from '$lib/server/rateLimitKeys';
import { rateLimitPolicy } from '$lib/server/rateLimitPolicy';
import { throttledMessage } from '$lib/server/http';
import { parseDeviceField, submitReport } from '$lib/server/report';
import { parseReportKind, REPORT_FORM_FIELDS } from '$lib/report';
import type { Actions, PageServerLoad } from './$types';

// The standalone feedback page. It has a form action, so it can't join the
// site-wide prerender. The native route-exclusion plugin also drops its client
// module: the form's POST has no local server there, so native links open this
// hosted page behind the external-link gate instead. The apps carry the working
// in-app form in Settings and post to /api/report.
export const prerender = false;
export const ssr = true;

// Presence marks a completed submission.
const SENT_PARAM = 'sent';

/**
 * The success view is reached by redirect, not by rendering the POST response
 * (see the action), so it is driven by the URL.
 */
export const load: PageServerLoad = ({ url }) => ({ sent: url.searchParams.has(SENT_PARAM) });

export const actions: Actions = {
  default: async ({ request, getClientAddress, setHeaders }) => {
    // Same bucket and policy as /api/report, so the two front doors share one
    // budget rather than doubling it (ADR-0014's shared-bucket contract).
    const { limited, retryAfter } = rateLimit(
      reportBucket(getClientAddress()),
      rateLimitPolicy.report
    );

    const data = await request.formData();
    const field = REPORT_FORM_FIELDS;
    const rawKind = data.get(field.kind);
    // Echoed back on every failure so a browser with no JavaScript — which
    // re-renders this page from scratch — doesn't hand back an empty textarea
    // and lose what the reporter wrote. Only the echo falls back to a bug:
    // submitReport reads the raw kind, so a value the radio group can't send is
    // refused rather than filed under a guessed label.
    const values = {
      kind: parseReportKind(rawKind) ?? 'bug',
      message: String(data.get(field.message) ?? ''),
      includeDevice: data.get(field.includeDevice) !== null,
    };

    if (limited) {
      setHeaders({ 'Retry-After': String(retryAfter) });
      return fail(429, { error: throttledMessage(retryAfter), values });
    }

    const result = await submitReport({
      kind: rawKind,
      message: values.message,
      device: parseDeviceField(data.get(field.device)),
      wantsDevice: values.includeDevice,
      hp: data.get(field.honeypot),
    });

    if (!result.ok) return fail(result.status, { error: result.error, values });

    // Post/Redirect/Get: rendering the thank-you at the POST URL means a reload
    // or a Back-then-Forward re-submits the body and opens a second issue. The
    // private issue is deliberately not exposed to the reporter.
    const query = new URLSearchParams({ [SENT_PARAM]: '1' });
    redirect(303, `/feedback?${query}`);
  },
};
