import { json } from '@sveltejs/kit';
import { rateLimit } from '$lib/server/rateLimit';
import { readJsonBody, throttled } from '$lib/server/http';
import { createIssue, isReportingConfigured } from '$lib/server/github';
import { describeDeviceInfo, sanitizeDeviceInfo, type DeviceInfo } from '$lib/deviceReport';
import type { RequestHandler } from './$types';

const MAX_MESSAGE_LENGTH = 4000;

// Identifies every in-app submission at a glance; the type label mirrors the
// repo's taxonomy (docs/ISSUE-WORKFLOW.md). Both are declared in
// .github/labels.yml, but GitHub also auto-creates any missing label on write.
const REPORT_LABEL = 'user-report';
const KIND_LABEL: Record<Kind, string> = { bug: 'type:bug', feature: 'type:feature' };

type Kind = 'bug' | 'feature';

function titleFor(kind: Kind, message: string): string {
  const prefix = kind === 'bug' ? 'Bug' : 'Feature';
  const firstLine = message.split('\n', 1)[0].trim();
  const summary = firstLine.length > 72 ? `${firstLine.slice(0, 69)}…` : firstLine;
  const fallback = kind === 'bug' ? 'User-reported bug' : 'User feature request';
  return `[${prefix}] ${summary || fallback}`;
}

function bodyFor(kind: Kind, message: string, device: DeviceInfo | null): string {
  const source = kind === 'bug' ? 'bug report' : 'feature request';
  const lines = [message, '', '---', `_Submitted from the Splotch app's ${source} form._`];

  const rows = device ? describeDeviceInfo(device) : [];
  if (rows.length) {
    lines.push('', '**Device info** (shared with the reporter’s permission):', '');
    for (const { label, value } of rows) lines.push(`- **${label}:** ${value}`);
  }
  return lines.join('\n');
}

/**
 * Receive an in-app "report a bug / suggest a feature" submission and open a
 * labelled GitHub issue for it. Body: { kind, message, device?, hp? }. Returns
 * { ok: true, url } with the issue URL on success.
 *
 * Unauthenticated, so it is rate-limited per IP and each issue creation is a
 * write; the limit is deliberately tighter than the read-only oracles.
 */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const { limited, retryAfter } = rateLimit(`report:${getClientAddress()}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (limited) return throttled(retryAfter);

  const body = await readJsonBody(request);

  // Honeypot: a hidden field no human fills. If it's populated, quietly accept
  // without creating an issue — a bot gets no signal and no issue lands.
  if (typeof body?.hp === 'string' && body.hp.trim()) {
    return json({ ok: true });
  }

  const kind: Kind | null =
    body?.kind === 'feature' ? 'feature' : body?.kind === 'bug' ? 'bug' : null;
  if (!kind) {
    return json({ ok: false, error: 'Please choose bug or feature.' }, { status: 400 });
  }

  const rawMessage = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!rawMessage) {
    return json({ ok: false, error: 'Please type a short description.' }, { status: 400 });
  }
  const message = rawMessage.slice(0, MAX_MESSAGE_LENGTH);

  const device =
    body?.device && typeof body.device === 'object' ? sanitizeDeviceInfo(body.device) : null;
  const hasDevice = device && Object.keys(device).length > 0 ? device : null;

  // Validate the payload before checking configuration so tests and callers get
  // a precise 400 regardless of whether reporting is wired up on this instance.
  if (!isReportingConfigured()) {
    return json(
      { ok: false, error: 'Reporting is not available right now. Please try again later.' },
      { status: 503 }
    );
  }

  try {
    const { url } = await createIssue({
      title: titleFor(kind, message),
      body: bodyFor(kind, message, hasDevice),
      labels: [REPORT_LABEL, KIND_LABEL[kind]],
    });
    return json({ ok: true, url });
  } catch (err) {
    console.error('[report] issue creation failed', err);
    return json(
      { ok: false, error: 'Could not send your report. Please try again later.' },
      { status: 502 }
    );
  }
};
