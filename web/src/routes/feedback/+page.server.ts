import { fail, redirect } from '@sveltejs/kit';
import { rateLimit } from '$lib/server/rateLimit';
import { reportBucket } from '$lib/server/rateLimitKeys';
import { rateLimitPolicy } from '$lib/server/rateLimitPolicy';
import { throttledMessage } from '$lib/server/http';
import { issueUrl } from '$lib/server/github';
import { parseDeviceField, submitReport } from '$lib/server/report';
import { REPORT_KINDS, type ReportKind } from '$lib/report';
import type { Actions, PageServerLoad } from './$types';

// The standalone feedback page. It has a form action, so it can't join the
// site-wide prerender; that also drops its HTML from the native static export
// (adapter-static's `strict: false`), the way /admin is handled — the route's JS
// chunk still ships and a WebView deep-link would render a page whose POST goes
// nowhere, but nothing in the app links there. The apps carry Settings
// form and post to /api/report; this page is for the URL in the Play Store
// listing and anywhere else a link is handed out.
export const prerender = false;
export const ssr = true;

// Presence marks a completed submission; the issue number is separate because
// the honeypot's quiet accept produces one without the other.
const SENT_PARAM = 'sent';
const ISSUE_PARAM = 'issue';

function kindFrom(raw: FormDataEntryValue | null): ReportKind {
  return REPORT_KINDS.find((option) => option.value === raw)?.value ?? 'bug';
}

/**
 * The success view is reached by redirect, not by rendering the POST response
 * (see the action), so it is driven by the URL. Anything but a plain number is
 * treated as no issue to link to — the param is visitor-controlled.
 */
export const load: PageServerLoad = ({ url }) => {
  const raw = url.searchParams.get(ISSUE_PARAM);
  const number = raw && /^\d+$/.test(raw) ? Number(raw) : null;
  return {
    sent: url.searchParams.has(SENT_PARAM),
    sentIssueUrl: number ? issueUrl(number) : null,
  };
};

export const actions: Actions = {
  default: async ({ request, getClientAddress, setHeaders }) => {
    // Same bucket and policy as /api/report, so the two front doors share one
    // budget rather than doubling it (ADR-0014's shared-bucket contract).
    const { limited, retryAfter } = rateLimit(
      reportBucket(getClientAddress()),
      rateLimitPolicy.report
    );

    const data = await request.formData();
    // Echoed back on every failure so a browser with no JavaScript — which
    // re-renders this page from scratch — doesn't hand back an empty textarea
    // and lose what the reporter wrote.
    const values = {
      kind: kindFrom(data.get('kind')),
      message: String(data.get('message') ?? ''),
      includeDevice: data.get('includeDevice') !== null,
    };

    if (limited) {
      setHeaders({ 'Retry-After': String(retryAfter) });
      return fail(429, { error: throttledMessage(retryAfter), values });
    }

    const result = await submitReport({
      kind: values.kind,
      message: values.message,
      device: parseDeviceField(data.get('device')),
      wantsDevice: values.includeDevice,
      hp: data.get('hp'),
    });

    if (!result.ok) return fail(result.status, { error: result.error, values });

    // Post/Redirect/Get: rendering the thank-you at the POST URL means a reload
    // or a Back-then-Forward re-submits the body and opens a second issue. The
    // issue number rides in the query so the redirected page can still link to
    // it; the honeypot's quiet accept has no number and lands on a bare
    // confirmation.
    const query = new URLSearchParams({ [SENT_PARAM]: '1' });
    if (result.number) query.set(ISSUE_PARAM, String(result.number));
    redirect(303, `/feedback?${query}`);
  },
};
