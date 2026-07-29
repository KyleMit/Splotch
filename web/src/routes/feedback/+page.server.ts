import { fail } from '@sveltejs/kit';
import { rateLimit } from '$lib/server/rateLimit';
import { reportBucket } from '$lib/server/rateLimitKeys';
import { rateLimitPolicy } from '$lib/server/rateLimitPolicy';
import { throttledMessage } from '$lib/server/http';
import { submitReport } from '$lib/server/report';
import type { Actions } from './$types';

// The standalone feedback page. It has a form action, so it can't join the
// site-wide prerender — which also keeps it out of the native static export
// (adapter-static's `strict: false`), the same way /admin is handled. The apps
// already carry the Parent Center form and post to /api/report; this page exists
// for the link in the Play Store listing and anywhere else a URL is handed out.
export const prerender = false;
export const ssr = true;

// A form post reaches us as strings; `device` rides along as the JSON the
// client collected, so an empty or malformed value simply means "no device
// info" rather than a failed report.
function parseDevice(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export const actions: Actions = {
  default: async ({ request, getClientAddress }) => {
    // Same bucket and policy as /api/report, so the two front doors share one
    // budget rather than doubling it (ADR-0014's shared-bucket contract).
    const { limited, retryAfter } = rateLimit(
      reportBucket(getClientAddress()),
      rateLimitPolicy.report
    );
    if (limited) return fail(429, { ok: false as const, error: throttledMessage(retryAfter) });

    const data = await request.formData();
    const kind = data.get('kind');
    const message = data.get('message');

    const result = await submitReport({
      kind,
      message,
      device: parseDevice(data.get('device')),
      hp: data.get('hp'),
    });

    if (!result.ok) {
      return fail(result.status, { ok: false as const, error: result.error });
    }
    return { ok: true as const, url: result.url ?? '' };
  },
};
