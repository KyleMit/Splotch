// The feedback report's shared vocabulary — the kinds, the message cap, the
// device-info rule, and the JSON body the in-app forms send. Kept free of
// browser- and server-only imports so the form fields
// (components/report/ReportFields.svelte), the client that posts them
// (lib/reportClient.ts), the JSON endpoint, and the /feedback form action all
// read one declaration instead of agreeing by hand: the textarea's `maxlength`
// and the server's truncation are the same number, the picker can't offer a
// kind the server rejects, every door reads a submitted kind through
// `parseReportKind` and decides whether it carries device info through
// `attachesDevice`, and the form action reads the field names the form sets.
//
// tools/api-smoke/run-local-contract.mjs loads this file in plain Node, where
// `$lib` does not resolve, so its imports stay type-only.

import type { DeviceInfo } from '$lib/platform/deviceReport';

export type ReportKind = 'bug' | 'feature';

export const MAX_REPORT_MESSAGE_LENGTH = 4000;

export const REPORT_HONEYPOT_FIELD = 'hp';

/** The `/feedback` form's field names, set by ReportFields.svelte and read by the page's form action. */
export const REPORT_FORM_FIELDS = {
  kind: 'kind',
  message: 'message',
  includeDevice: 'includeDevice',
  device: 'device',
  honeypot: REPORT_HONEYPOT_FIELD,
} as const;

export const REPORT_KINDS = [
  { value: 'bug', label: "Something's broken" },
  { value: 'feature', label: 'I have an idea' },
] satisfies { value: ReportKind; label: string }[];

/** A kind the picker does not offer; `never` once every one has an option. */
type UnofferedReportKind = Exclude<ReportKind, (typeof REPORT_KINDS)[number]['value']>;

/**
 * The compiler's half of "the picker offers every kind": a kind added to
 * ReportKind and not to REPORT_KINDS fails this assignment, naming itself.
 * Without it parseReportKind would refuse that kind at both front doors.
 */
const _everyKindIsOffered: [UnofferedReportKind] extends [never] ? true : UnofferedReportKind =
  true;

export function parseReportKind(raw: unknown): ReportKind | null {
  return REPORT_KINDS.find((option) => option.value === raw)?.value ?? null;
}

/**
 * Whether a report carries device info: only a bug report the parent opted
 * into, since device details help reproduce a bug and say nothing about an
 * idea. The one owner of that rule for the forms that preview and send the
 * snapshot and for the server that files it, so a no-JavaScript post that
 * switches to an idea with the box still ticked files the idea without device
 * info, exactly as the scripted form would.
 */
export function attachesDevice(kind: ReportKind, optedIn: boolean): boolean {
  return kind === 'bug' && optedIn;
}

/**
 * The `/api/report` JSON body. The server core's input (`ReportInput` in
 * $lib/server/report) is keyed by this type, so renaming a key here fails to
 * compile at both ends of the wire.
 */
export interface ReportRequestBody {
  kind: ReportKind;
  message: string;
  /** Sent only when `attachesDevice` holds; the server drops it otherwise. */
  device?: DeviceInfo;
  /** The honeypot a human never fills; see the quiet-accept branch in submitReport. */
  [REPORT_HONEYPOT_FIELD]?: string;
}
