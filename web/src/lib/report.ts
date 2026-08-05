// The feedback report's shared vocabulary — the two kinds and the message cap.
// Kept free of browser- and server-only imports so the form fields
// (components/report/ReportFields.svelte), the JSON endpoint, and the /feedback
// form action all read one declaration instead of agreeing by hand: the
// textarea's `maxlength` and the server's truncation are the same number, and
// the picker can't offer a kind the server rejects.

export type ReportKind = 'bug' | 'feature';

export const MAX_REPORT_MESSAGE_LENGTH = 4000;

export const REPORT_HONEYPOT_FIELD = 'hp';

export const REPORT_KINDS: { value: ReportKind; label: string }[] = [
  { value: 'bug', label: "Something's broken" },
  { value: 'feature', label: 'I have an idea' },
];
