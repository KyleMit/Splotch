import { createIssue, escapeIssueMarkdown, isReportingConfigured } from './github';
import {
  describeDeviceInfo,
  sanitizeDeviceInfo,
  type DeviceInfo,
} from '$lib/platform/deviceReport';
import {
  attachesDevice,
  MAX_REPORT_MESSAGE_LENGTH,
  parseReportKind,
  type ReportKind,
  type ReportRequestBody,
} from '$lib/report';

// Server-only core of the feedback flow, shared by its two front doors: the
// `/api/report` JSON endpoint the in-app form in Settings posts to, and the
// `/feedback` page's form action. Both throttle into the same bucket
// (reportBucket) and then hand the raw fields here, so validation, the
// honeypot, the issue Markdown, and the error wording can't drift between them.

// The body cap at both front doors: the capped message plus an optional device
// snapshot and framing. It holds for the form door's percent-encoding too, which
// at most triples each UTF-8 byte; the /feedback action's test posts the longest
// message the form allows in its costliest encoding.
export const MAX_REPORT_BODY_BYTES = 64 * 1024;

// Identifies every in-app submission at a glance; each kind's type label mirrors
// the repo's taxonomy (docs/ISSUE-WORKFLOW.md). All are declared in
// .github/labels.yml, but GitHub also auto-creates any missing label on write.
const REPORT_LABEL = 'user-report';

// Everything a report's kind decides about the issue it files, so a new
// ReportKind fails to compile here until its issue has a label and wording.
const ISSUE_BY_KIND: Record<ReportKind, { label: string; titlePrefix: string; noun: string }> = {
  bug: { label: 'type:bug', titlePrefix: 'Bug', noun: 'bug report' },
  feature: { label: 'type:feature', titlePrefix: 'Feature', noun: 'feature request' },
};

// Keeps an issue title scannable in a GitHub list view. A truncated summary
// spends its last character on the ellipsis (U+2026 is a single UTF-16 code
// unit), so it measures exactly the cap rather than one glyph short of it.
const MAX_ISSUE_TITLE_SUMMARY_LENGTH = 72;
const TITLE_ELLIPSIS = '…';

/** `message` arrives trimmed and non-empty, so its first line is never blank. */
function titleFor(kind: ReportKind, message: string): string {
  const firstLine = message.split('\n', 1)[0].trim();
  const summary =
    firstLine.length > MAX_ISSUE_TITLE_SUMMARY_LENGTH
      ? `${firstLine.slice(0, MAX_ISSUE_TITLE_SUMMARY_LENGTH - TITLE_ELLIPSIS.length)}${TITLE_ELLIPSIS}`
      : firstLine;
  return `[${ISSUE_BY_KIND[kind].titlePrefix}] ${summary}`;
}

function bodyFor(
  kind: ReportKind,
  message: string,
  device: DeviceInfo | null,
  deviceUnavailable = false
): string {
  // The message and every device value are attacker-controlled and rendered as
  // Markdown, so neutralize mentions/refs/embeds before they reach the issue.
  const lines = [
    escapeIssueMarkdown(message),
    '',
    '---',
    `_Submitted from the Splotch app's ${ISSUE_BY_KIND[kind].noun} form._`,
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

/**
 * The raw, untrusted fields either front door hands over, keyed by the wire
 * body's own declaration so a renamed field cannot compile at one door alone.
 */
export type ReportInput = Record<keyof ReportRequestBody, unknown> & {
  /**
   * Whether the reporter asked for device info. Normally redundant — a ticked
   * box is what produces `device` — but a form post with no JavaScript can
   * carry the opt-in and no snapshot, and an explicit request must not vanish
   * silently. Present and empty gets said so in the issue — for a kind that
   * carries device info at all (`attachesDevice`).
   */
  wantsDevice?: unknown;
};

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
  const reportKind = parseReportKind(kind);
  if (!reportKind) {
    return { ok: false, status: 400, error: 'Please choose bug or feature.' };
  }

  const rawMessage = typeof message === 'string' ? message.trim() : '';
  if (!rawMessage) {
    return { ok: false, status: 400, error: 'Please type a short description.' };
  }
  const text = rawMessage.slice(0, MAX_REPORT_MESSAGE_LENGTH);

  const sanitized = device && typeof device === 'object' ? sanitizeDeviceInfo(device) : null;
  const snapshot = sanitized && Object.keys(sanitized).length > 0 ? sanitized : null;
  // Sending a snapshot is itself the opt-in on the JSON door; the form door
  // also says whether the box was ticked. Either way the kind has the last word.
  const attachedDevice = attachesDevice(reportKind, snapshot !== null) ? snapshot : null;
  const deviceUnavailable = attachesDevice(reportKind, Boolean(wantsDevice)) && !attachedDevice;

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
  // submitter gets on every path. Each door's tests hold the two answers against
  // each other rather than against a literal: routes/api/report/server.test.ts
  // for the JSON body, routes/feedback/page.server.test.ts for the form's
  // redirect and its failures.
  if (typeof hp === 'string' && hp.trim()) return { ok: true };

  try {
    await createIssue({
      title: titleFor(reportKind, text),
      body: bodyFor(reportKind, text, attachedDevice, deviceUnavailable),
      labels: [REPORT_LABEL, ISSUE_BY_KIND[reportKind].label],
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
