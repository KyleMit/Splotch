import { createIssue, escapeIssueMarkdown, isReportingConfigured } from './github';
import {
  describeDeviceInfo,
  sanitizeDeviceInfo,
  type DeviceInfo,
} from '$lib/platform/deviceReport';
import { MAX_REPORT_MESSAGE_LENGTH, type ReportKind } from '$lib/report';

// Server-only core of the feedback flow, shared by its two front doors: the
// `/api/report` JSON endpoint the in-app form in Settings posts to, and the
// `/feedback` page's form action. Both throttle into the same bucket
// (reportBucket) and then hand the raw fields here, so validation, the
// honeypot, the issue Markdown, and the error wording can't drift between them.

// Identifies every in-app submission at a glance; the type label mirrors the
// repo's taxonomy (docs/ISSUE-WORKFLOW.md). Both are declared in
// .github/labels.yml, but GitHub also auto-creates any missing label on write.
const REPORT_LABEL = 'user-report';
const KIND_LABEL: Record<ReportKind, string> = { bug: 'type:bug', feature: 'type:feature' };

function titleFor(kind: ReportKind, message: string): string {
  const prefix = kind === 'bug' ? 'Bug' : 'Feature';
  const firstLine = message.split('\n', 1)[0].trim();
  const summary = firstLine.length > 72 ? `${firstLine.slice(0, 69)}…` : firstLine;
  const fallback = kind === 'bug' ? 'User-reported bug' : 'User feature request';
  return `[${prefix}] ${summary || fallback}`;
}

function bodyFor(
  kind: ReportKind,
  message: string,
  device: DeviceInfo | null,
  deviceUnavailable = false
): string {
  const source = kind === 'bug' ? 'bug report' : 'feature request';
  // The message and every device value are attacker-controlled and rendered as
  // Markdown, so neutralize mentions/refs/embeds before they reach the issue.
  const lines = [
    escapeIssueMarkdown(message),
    '',
    '---',
    `_Submitted from the Splotch app's ${source} form._`,
  ];

  if (deviceUnavailable) {
    lines.push(
      '',
      '_The reporter asked to attach device info, but their browser could not collect it (JavaScript unavailable)._'
    );
  }

  const rows = device ? describeDeviceInfo(device) : [];
  if (rows.length) {
    lines.push('', '**Device info** (shared with the reporter’s permission):', '');
    for (const { label, value } of rows) {
      lines.push(`- **${label}:** ${escapeIssueMarkdown(value)}`);
    }
  }
  return lines.join('\n');
}

/** The raw, untrusted fields either front door hands over, in wire shape. */
export interface ReportInput {
  kind: unknown;
  message: unknown;
  device: unknown;
  /**
   * Whether the reporter asked for device info. Normally redundant — a ticked
   * box is what produces `device` — but a form post with no JavaScript can
   * carry the opt-in and no snapshot, and an explicit request must not vanish
   * silently. Present and empty gets said so in the issue.
   */
  wantsDevice?: unknown;
  /** Honeypot — see the quiet-accept branch in submitReport. */
  hp: unknown;
}

/**
 * `status` is the HTTP status the JSON endpoint returns and the status the form
 * action fails with, so the two front doors agree on more than the wording.
 */
export type ReportResult = { ok: true } | { ok: false; status: 400 | 502 | 503; error: string };

/**
 * A form post reaches a front door as strings; `device` rides along as the JSON
 * the client collected, so an empty or malformed value means "no device info"
 * rather than a failed report. Lives here rather than in the route so it is
 * unit-testable against hostile input.
 */
export function parseDeviceField(raw: unknown): unknown {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Validate a feedback submission and open a labelled GitHub issue for it.
 * Rate limiting stays with the caller — it keys on the request, which this
 * module deliberately never sees.
 */
export async function submitReport({
  kind,
  message,
  device,
  wantsDevice,
  hp,
}: ReportInput): Promise<ReportResult> {
  const reportKind: ReportKind | null =
    kind === 'feature' ? 'feature' : kind === 'bug' ? 'bug' : null;
  if (!reportKind) {
    return { ok: false, status: 400, error: 'Please choose bug or feature.' };
  }

  const rawMessage = typeof message === 'string' ? message.trim() : '';
  if (!rawMessage) {
    return { ok: false, status: 400, error: 'Please type a short description.' };
  }
  const text = rawMessage.slice(0, MAX_REPORT_MESSAGE_LENGTH);

  const sanitized = device && typeof device === 'object' ? sanitizeDeviceInfo(device) : null;
  const hasDevice = sanitized && Object.keys(sanitized).length > 0 ? sanitized : null;

  // Validate the payload before checking configuration so tests and callers get
  // a precise 400 regardless of whether reporting is wired up on this instance.
  if (!isReportingConfigured()) {
    return {
      ok: false,
      status: 503,
      error: 'Reporting is not available right now. Please try again later.',
    };
  }

  // Honeypot: a hidden field no human fills. Quietly accept without creating an
  // issue, answering exactly as a real submission would.
  //
  // That is a claim about the response, not about every channel: this path
  // returns with no I/O while a real one awaits GitHub, so latency still
  // separates them. Padding it out is a bigger change than the trap is worth.
  //
  // Placed after every rejection, not before them, and that ordering is the whole
  // guarantee. Short-circuiting first made each rejection an oracle: a bad `kind`
  // answered 200 {ok:true} with the field filled and 400 without, so one invalid
  // payload per candidate name identified the trap in a single request each,
  // defeating any amount of markup obfuscation. Reaching here means the
  // submission would have succeeded, so the caught bot gets exactly what a real
  // submitter gets on every path. server.test.ts holds the two against each
  // other rather than against a literal — for this door. /feedback's form action
  // reads the same ok/not-ok result and builds its redirect from no part of it,
  // but nothing tests that, so it is a property of the current code rather than
  // a guaranteed one.
  if (typeof hp === 'string' && hp.trim()) return { ok: true };

  try {
    await createIssue({
      title: titleFor(reportKind, text),
      body: bodyFor(reportKind, text, hasDevice, Boolean(wantsDevice) && !hasDevice),
      labels: [REPORT_LABEL, KIND_LABEL[reportKind]],
    });
    return { ok: true };
  } catch (err) {
    console.error('[report] issue creation failed', err);
    return {
      ok: false,
      status: 502,
      error: 'Could not send your report. Please try again later.',
    };
  }
}
