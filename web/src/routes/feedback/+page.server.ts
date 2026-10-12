import { fail, redirect } from '@sveltejs/kit';
import { rateLimit } from '$lib/server/rateLimit';
import { reportBucket } from '$lib/server/rateLimitKeys';
import { rateLimitPolicy } from '$lib/server/rateLimitPolicy';
import {
  formStringField,
  readFormBody,
  throttledMessage,
  unreadableFormBody,
} from '$lib/server/http';
import { MAX_REPORT_BODY_BYTES, parseDeviceField, submitReport } from '$lib/server/report';
import { parseReportKind, REPORT_FORM_FIELDS, type ReportKind } from '$lib/report';
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

type EchoedValues = { kind: ReportKind; message: string; includeDevice: boolean };

// Echoed back on every failure so a browser with no JavaScript — which
// re-renders this page from scratch — doesn't hand back an empty textarea and
// lose what the reporter wrote. Only the echo falls back: submitReport reads the
// raw kind and message, so a value the form can't send (a kind the radio group
// lacks, a file for the message) is refused rather than filed under a guessed
// label or as "[object File]".
function echoOf(form: FormData): EchoedValues {
  return {
    kind: parseReportKind(form.get(REPORT_FORM_FIELDS.kind)) ?? 'bug',
    message: formStringField(form, REPORT_FORM_FIELDS.message),
    includeDevice: form.get(REPORT_FORM_FIELDS.includeDevice) !== null,
  };
}

// A body too large or malformed to read has nothing to echo.
const UNREAD_VALUES: EchoedValues = { kind: 'bug', message: '', includeDevice: false };

export const actions: Actions = {
  default: async ({ request, getClientAddress, setHeaders }) => {
    // Same bucket and policy as /api/report, so the two front doors share one
    // budget rather than doubling it (ADR-0014's shared-bucket contract).
    const { limited, retryAfter } = rateLimit(
      reportBucket(getClientAddress()),
      rateLimitPolicy.report
    );

    // Read before the throttle answers so a throttled reporter still gets their
    // text back, and bounded so that read costs no more than /api/report's.
    const body = await readFormBody(request, MAX_REPORT_BODY_BYTES);
    const values = body.ok ? echoOf(body.form) : UNREAD_VALUES;

    if (limited) {
      setHeaders({ 'Retry-After': String(retryAfter) });
      return fail(429, { error: throttledMessage(retryAfter), values });
    }
    if (!body.ok) {
      const { status, message } = unreadableFormBody(body.reason);
      return fail(status, { error: message, values });
    }

    const { form } = body;
    const result = await submitReport({
      kind: form.get(REPORT_FORM_FIELDS.kind),
      message: form.get(REPORT_FORM_FIELDS.message),
      device: parseDeviceField(form.get(REPORT_FORM_FIELDS.device)),
      wantsDevice: values.includeDevice,
      hp: form.get(REPORT_FORM_FIELDS.honeypot),
    });

    if (!result.ok) return fail(result.status, { error: result.error, values });

    // Post/Redirect/Get: rendering the thank-you at the POST URL means a reload
    // or a Back-then-Forward re-submits the body and opens a second issue. The
    // private issue is deliberately not exposed to the reporter.
    const query = new URLSearchParams({ [SENT_PARAM]: '1' });
    redirect(303, `/feedback?${query}`);
  },
};
